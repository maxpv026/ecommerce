import "server-only";

import { z } from "zod";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  CARRIER_CODES,
  STAGE_SEQUENCE,
  carrierCodeOf,
  emailForTransition,
  isDispatchedStage,
  methodOf,
  parseShipmentEvents,
  previousStage,
  stageIndex,
  stageOf,
  stageToStatus,
  templateTrackingUrl,
  SHIPMENT_STAGES,
  type FulfilmentEmailKind,
  type ShipmentEvent,
  type ShipmentStage,
} from "@/lib/shipping/carriers";

/**
 * The only writer of an order's fulfilment. The admin panel
 * (lib/actions/adminOrders) and the CRM webhook (/api/webhooks/crm-shipment)
 * both call these, so the rules can't differ between them:
 *
 *   saveFulfilment   who carries it and the details (carrier, waybill, link,
 *                    vehicle, driver, notes, ETA). Changes no stage.
 *   advanceShipment  moves the stage forward (or logs a checkpoint at the
 *                    current one), appends a timestamped event, keeps
 *                    `status` in step, and says which customer email is due.
 *   revertShipment   one step back, for a mis-click. Sends nothing.
 *
 * Every write is conditional on the row exactly as it was read (stage,
 * updatedAt, not cancelled), so two admins — or an admin and the CRM — can't interleave.
 * Emails are returned, not sent: the caller schedules them after the
 * response (next/server after()).
 */

export type ShipmentErrorCode =
  | "NOT_FOUND"
  | "CANCELLED"
  | "INVALID"
  | "STAGE_NOT_ALLOWED"
  | "STAGE_BEHIND"
  | "UNCHANGED"
  | "TRACKING_REQUIRED"
  | "CARRIER_NAME_REQUIRED"
  | "METHOD_LOCKED"
  | "STALE";

export type ShipmentResult<T> = { ok: true; value: T } | { ok: false; code: ShipmentErrorCode; detail?: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(/\s+/g, " ") || null)
    .nullish();

export const FulfilmentInput = z.object({
  carrier: z.enum(CARRIER_CODES as [string, ...string[]]),
  carrierName: optionalText(60),
  // Waybill / CMR / TTN / consignment number: letters, digits and the
  // separators carriers print. DHL keeps its stricter format below.
  trackingNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " ").toUpperCase())
    .refine((v) => v === "" || /^[A-Z0-9][A-Z0-9 ./-]{3,59}$/.test(v), "trackingNumber")
    .transform((v) => v || null)
    .nullish(),
  trackingUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^https:\/\/[^\s<>"]+$/i.test(v) && v.length <= 500), "trackingUrl")
    .transform((v) => v || null)
    .nullish(),
  driverName: optionalText(80),
  driverPhone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{5,22}$/.test(v), "driverPhone")
    .transform((v) => v || null)
    .nullish(),
  vehiclePlate: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.replace(/\s+/g, " ").toUpperCase() || null)
    .nullish(),
  deliveryNotes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .nullish(),
  estimatedDelivery: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "estimatedDelivery")
    .transform((v) => (v ? new Date(v) : null))
    .nullish(),
});
export type FulfilmentInputValue = z.input<typeof FulfilmentInput>;

export const AdvanceInput = z.object({
  stage: z.enum(SHIPMENT_STAGES),
  location: optionalText(120),
  note: optionalText(280),
  /** When it happened (CRM backfills); defaults to now, never in the future. */
  at: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "at")
    .nullish(),
});
export type AdvanceInputValue = z.input<typeof AdvanceInput>;

const DHL_NUMBER = /^[A-Z0-9]{8,40}$/;

const LOAD = {
  id: true,
  status: true,
  paymentStatus: true,
  shippingCarrier: true,
  carrierName: true,
  trackingNumber: true,
  shipmentStage: true,
  shipmentEvents: true,
  updatedAt: true,
} as const;

/** Who carries it, and the details the buyer sees. */
export async function saveFulfilment(orderId: string, raw: unknown): Promise<ShipmentResult<{ carrier: string }>> {
  const parsed = FulfilmentInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", detail: String(parsed.error.issues[0]?.message ?? parsed.error.issues[0]?.path) };
  const input = parsed.data;
  const carrier = carrierCodeOf(input.carrier);
  const method = methodOf(carrier);

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: LOAD });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentStatus === "FAILED") return { ok: false, code: "CANCELLED" };

  // A pickup that is already "ready" can't silently become a delivery (and
  // vice versa): move the stage back first, so the buyer's timeline stays true.
  const stage = stageOf(order.shipmentStage, order.status);
  if (!STAGE_SEQUENCE[method].includes(stage)) return { ok: false, code: "METHOD_LOCKED", detail: stage };

  if (carrier === "OTHER" && !input.carrierName) return { ok: false, code: "CARRIER_NAME_REQUIRED" };
  const reference = method === "DHL" ? input.trackingNumber?.replace(/[\s./-]+/g, "") ?? null : input.trackingNumber ?? null;
  if (method === "DHL" && reference && !DHL_NUMBER.test(reference)) return { ok: false, code: "INVALID", detail: "trackingNumber" };
  if (method === "DHL" && !reference && isDispatchedStage(stage)) return { ok: false, code: "TRACKING_REQUIRED" };

  // Only what the method uses is kept: switching from own fleet to a
  // carrier must not leave a driver's phone number on the order page.
  const carriesReference = method === "DHL" || method === "FREIGHT";
  // The registry's own link is not stored, so it keeps tracking a corrected waybill.
  const url = carriesReference && input.trackingUrl && input.trackingUrl !== templateTrackingUrl(carrier, reference) ? input.trackingUrl : null;

  const data: Prisma.OrderUpdateManyMutationInput = {
    shippingCarrier: carrier,
    carrierName: method === "FREIGHT" ? (input.carrierName ?? null) : null,
    trackingNumber: carriesReference ? reference : null,
    trackingUrl: url,
    driverName: method === "OWN_FLEET" ? (input.driverName ?? null) : null,
    driverPhone: method === "OWN_FLEET" ? (input.driverPhone ?? null) : null,
    vehiclePlate: method === "OWN_FLEET" ? (input.vehiclePlate ?? null) : null,
    deliveryNotes: input.deliveryNotes ?? null,
    ...(input.estimatedDelivery ? { estimatedDelivery: input.estimatedDelivery } : {}),
    // Materialise the stage on legacy rows, so later writes compare against a value.
    ...(order.shipmentStage === null ? { shipmentStage: stage } : {}),
  };

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, shipmentStage: order.shipmentStage, updatedAt: order.updatedAt, paymentStatus: { not: "FAILED" } },
    data,
  });
  if (count === 0) return { ok: false, code: "STALE" };
  return { ok: true, value: { carrier } };
}

/**
 * Moves the stage forward to `stage` (skipping is allowed: packing straight
 * to in transit), or — same stage plus a location or note — logs a
 * checkpoint. Returns the email the transition calls for, if any.
 */
export async function advanceShipment(
  orderId: string,
  raw: unknown,
  source: ShipmentEvent["source"]
): Promise<ShipmentResult<{ stage: ShipmentStage; email: FulfilmentEmailKind | null; checkpointOnly: boolean }>> {
  const parsed = AdvanceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", detail: String(parsed.error.issues[0]?.path?.join(".") ?? "") };
  const { stage: target, location, note } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: LOAD });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentStatus === "FAILED") return { ok: false, code: "CANCELLED" };

  const carrier = carrierCodeOf(order.shippingCarrier);
  const method = methodOf(carrier);
  const current = stageOf(order.shipmentStage, order.status);
  if (!STAGE_SEQUENCE[method].includes(target)) return { ok: false, code: "STAGE_NOT_ALLOWED", detail: target };
  const from = stageIndex(method, current);
  const to = stageIndex(method, target);
  if (to < from) return { ok: false, code: "STAGE_BEHIND", detail: current };
  if (to === from && !location && !note) return { ok: false, code: "UNCHANGED" };
  // DHL is tracked by its number; a DHL consignment without one has nothing to follow.
  if (method === "DHL" && isDispatchedStage(target) && !order.trackingNumber) return { ok: false, code: "TRACKING_REQUIRED" };
  if (carrier === "OTHER" && !order.carrierName) return { ok: false, code: "CARRIER_NAME_REQUIRED" };

  const now = Date.now();
  const at = parsed.data.at ? new Date(Math.min(Date.parse(parsed.data.at), now)) : new Date(now);
  const event: ShipmentEvent = { stage: target, at: at.toISOString(), ...(location ? { location } : {}), ...(note ? { note } : {}), source };
  const events = [...parseShipmentEvents(order.shipmentEvents), event];

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, shipmentStage: order.shipmentStage, updatedAt: order.updatedAt, paymentStatus: { not: "FAILED" } },
    data: { shipmentStage: target, status: stageToStatus(target), shipmentEvents: events as unknown as Prisma.InputJsonValue },
  });
  if (count === 0) return { ok: false, code: "STALE" };
  return { ok: true, value: { stage: target, email: emailForTransition(method, current, target), checkpointOnly: to === from } };
}

/** One step back — corrects a mis-click. Drops the checkpoints of the undone stage; emails nothing. */
export async function revertShipment(orderId: string): Promise<ShipmentResult<{ stage: ShipmentStage }>> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: LOAD });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentStatus === "FAILED") return { ok: false, code: "CANCELLED" };
  const method = methodOf(carrierCodeOf(order.shippingCarrier));
  const current = stageOf(order.shipmentStage, order.status);
  const back = previousStage(method, current);
  if (!back) return { ok: false, code: "UNCHANGED" };

  const keep = parseShipmentEvents(order.shipmentEvents).filter((e) => stageIndex(method, e.stage) <= stageIndex(method, back));
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, shipmentStage: order.shipmentStage, updatedAt: order.updatedAt, paymentStatus: { not: "FAILED" } },
    data: { shipmentStage: back, status: stageToStatus(back), shipmentEvents: keep as unknown as Prisma.InputJsonValue },
  });
  if (count === 0) return { ok: false, code: "STALE" };
  return { ok: true, value: { stage: back } };
}
