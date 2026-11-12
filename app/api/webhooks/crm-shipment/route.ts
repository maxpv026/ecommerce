import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { crmWebhookAuth } from "@/lib/webhookAuth";
import { CARRIER_CODES, SHIPMENT_STAGES } from "@/lib/shipping/carriers";
import { advanceShipment, saveFulfilment, type ShipmentErrorCode } from "@/lib/shipping/update";
import { sendOrderStatusEmail } from "@/lib/orderEmails";

/**
 * CRM → storefront shipment webhook: who carries an order and how far it has got.
 *
 *   POST {SITE_URL}/api/webhooks/crm-shipment
 *   Authorization: Bearer {CRM_WEBHOOK_SECRET}       ← same secret as crm-inventory
 *   Content-Type: application/json
 *
 *   { "orderNumber": "ORD-20261112-ABCD1234",
 *     // optional — set or correct the fulfilment (all-or-nothing, like the admin form):
 *     "carrier": "RABEN",                 // DHL | DB_SCHENKER | DSV | DACHSER | RABEN | KUEHNE_NAGEL
 *                                         // | DPD | GLS | NOVA_POSHTA | OTHER | OWN_FLEET | PICKUP
 *     "carrierName": "Raben ADR",         // required for OTHER
 *     "trackingNumber": "CMR 4471-2290",  // waybill / CMR / TTN
 *     "trackingUrl": "https://…",         // overrides the registry's public link
 *     "driverName": "…", "driverPhone": "+380…", "vehiclePlate": "AA 1234 BB",   // OWN_FLEET
 *     "deliveryNotes": "…", "estimatedDelivery": "2026-11-20T10:00:00Z",
 *     // optional — move the stage (or, same stage + location/note, log a checkpoint):
 *     "stage": "IN_TRANSIT",              // ORDER_PLACED | ADR_PACKING | DISPATCHED | IN_TRANSIT
 *                                         // | OUT_FOR_DELIVERY | READY_FOR_PICKUP | DELIVERED
 *     "location": "Raben terminal, Lviv", "note": "…", "at": "2026-11-18T07:40:00Z" }
 *
 * Responses
 *   200 { ok: true, stage, email }       applied (email = the customer notice scheduled, or null)
 *   200 { ok: true, unchanged: true }    the stage was already there — replays are harmless
 *   400 invalid payload · 401 wrong secret · 404 unknown order
 *   409 { code } the move isn't allowed: STAGE_BEHIND, STAGE_NOT_ALLOWED, METHOD_LOCKED,
 *       TRACKING_REQUIRED, CARRIER_NAME_REQUIRED, CANCELLED, STALE (retry)
 *   503 CRM_WEBHOOK_SECRET not configured
 *
 * Same engine as the admin panel (lib/shipping/update), so the CRM and a
 * person can never apply different rules. Customer emails go out after the
 * response, never twice for the same transition.
 */

const Payload = z
  .object({
    orderNumber: z.string().trim().min(3).max(64),
    carrier: z.enum(CARRIER_CODES as [string, ...string[]]).optional(),
    carrierName: z.string().max(60).nullish(),
    trackingNumber: z.string().max(80).nullish(),
    trackingUrl: z.string().max(500).nullish(),
    driverName: z.string().max(80).nullish(),
    driverPhone: z.string().max(30).nullish(),
    vehiclePlate: z.string().max(20).nullish(),
    deliveryNotes: z.string().max(500).nullish(),
    estimatedDelivery: z.string().max(40).nullish(),
    stage: z.enum(SHIPMENT_STAGES).optional(),
    location: z.string().max(120).nullish(),
    note: z.string().max(280).nullish(),
    at: z.string().max(40).nullish(),
  })
  .refine((p) => p.carrier || p.stage, { message: "Send a carrier, a stage, or both." });

const CONFLICT: ShipmentErrorCode[] = ["STAGE_BEHIND", "STAGE_NOT_ALLOWED", "METHOD_LOCKED", "TRACKING_REQUIRED", "CARRIER_NAME_REQUIRED", "CANCELLED", "STALE"];
const fail = (code: ShipmentErrorCode, detail?: string) =>
  Response.json({ ok: false, code, ...(detail ? { detail } : {}) }, { status: code === "NOT_FOUND" ? 404 : code === "INVALID" ? 400 : CONFLICT.includes(code) ? 409 : 400 });

export async function POST(request: Request) {
  const auth = crmWebhookAuth(request);
  if (auth === "unconfigured") return Response.json({ ok: false, error: "CRM_WEBHOOK_SECRET is not configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Body must be valid JSON" }, { status: 400 });
  }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const p = parsed.data;

  const order = await prisma.order.findUnique({ where: { orderNumber: p.orderNumber }, select: { id: true } });
  if (!order) return fail("NOT_FOUND");

  if (p.carrier) {
    const saved = await saveFulfilment(order.id, {
      carrier: p.carrier,
      carrierName: p.carrierName ?? null,
      trackingNumber: p.trackingNumber ?? null,
      trackingUrl: p.trackingUrl ?? null,
      driverName: p.driverName ?? null,
      driverPhone: p.driverPhone ?? null,
      vehiclePlate: p.vehiclePlate ?? null,
      deliveryNotes: p.deliveryNotes ?? null,
      estimatedDelivery: p.estimatedDelivery ?? null,
    });
    if (!saved.ok) return fail(saved.code, saved.detail);
  }

  let result: { stage: string; email: string | null } | null = null;
  if (p.stage) {
    const moved = await advanceShipment(order.id, { stage: p.stage, location: p.location ?? null, note: p.note ?? null, at: p.at ?? null }, "crm");
    if (!moved.ok) {
      // A replay of a stage we already hold is success, not a conflict.
      if (moved.code === "UNCHANGED") return Response.json({ ok: true, unchanged: true });
      return fail(moved.code, moved.detail);
    }
    result = moved.value;
    const email = moved.value.email;
    if (email) after(() => sendOrderStatusEmail(order.id, email));
  }

  revalidatePath("/[locale]/admin/orders", "page");
  revalidatePath(`/[locale]/profile/orders/${order.id}`, "page");
  return Response.json({ ok: true, stage: result?.stage ?? null, email: result?.email ?? null });
}
