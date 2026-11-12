// Carrier registry, shipment stages and their rules. Pure and client-safe:
// the admin panel, the customer pages, the emails and the CRM webhook all
// read the same definitions, so a stage or a tracking link can't mean one
// thing on one screen and another elsewhere.

import type { OrderStatus } from "@/lib/generated/prisma/enums";

// ───────────────────────────── carriers ─────────────────────────────

/** How the cylinders reach the buyer. Derived from the carrier code, never stored separately. */
export type FulfilmentMethod = "DHL" | "FREIGHT" | "OWN_FLEET" | "PICKUP";

interface CarrierDef {
  method: FulfilmentMethod;
  /** Display name; null where it comes from translations (own fleet, pickup) or the admin (OTHER). */
  name: string | null;
  /**
   * Public tracking page for a waybill, or null when the carrier offers no
   * stable deep link (the admin pastes one instead). Every template here was
   * checked to resolve on 2026-11-12; Dachser and Raben had none that did.
   */
  url: ((reference: string) => string) | null;
}

const enc = encodeURIComponent;

export const CARRIERS = {
  DHL: { method: "DHL", name: "DHL", url: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${enc(n)}` },
  // DB Schenker is part of DSV since 2025; its public tracker forwards to DSV's.
  DB_SCHENKER: { method: "FREIGHT", name: "DB Schenker", url: (n) => `https://www.dbschenker.com/app/tracking-public/?refNumber=${enc(n)}` },
  DSV: { method: "FREIGHT", name: "DSV", url: (n) => `https://www.dsv.com/mydsv/tracking-public/?refNumber=${enc(n)}` },
  DACHSER: { method: "FREIGHT", name: "Dachser", url: null },
  RABEN: { method: "FREIGHT", name: "Raben", url: null },
  KUEHNE_NAGEL: { method: "FREIGHT", name: "Kuehne+Nagel", url: (n) => `https://mykn.kuehne-nagel.com/public-tracking/shipments?query=${enc(n)}` },
  DPD: { method: "FREIGHT", name: "DPD", url: (n) => `https://tracking.dpd.de/parcelstatus?query=${enc(n)}&locale=en_DE` },
  GLS: { method: "FREIGHT", name: "GLS", url: (n) => `https://gls-group.com/EU/en/parcel-tracking/?match=${enc(n)}` },
  NOVA_POSHTA: { method: "FREIGHT", name: "Nova Poshta", url: (n) => `https://novaposhta.ua/tracking/?cargo_number=${enc(n)}` },
  OTHER: { method: "FREIGHT", name: null, url: null },
  OWN_FLEET: { method: "OWN_FLEET", name: null, url: null },
  PICKUP: { method: "PICKUP", name: null, url: null },
} as const satisfies Record<string, CarrierDef>;

export type CarrierCode = keyof typeof CARRIERS;
export const CARRIER_CODES = Object.keys(CARRIERS) as CarrierCode[];
/** The freight presets, in the order the admin dropdown lists them. */
export const FREIGHT_CARRIERS = CARRIER_CODES.filter((c) => CARRIERS[c].method === "FREIGHT");

export const isCarrierCode = (value: unknown): value is CarrierCode => typeof value === "string" && value in CARRIERS;

/** A null or unknown column reads as DHL: every order before this existed went by DHL. */
export const carrierCodeOf = (stored: string | null | undefined): CarrierCode => (isCarrierCode(stored) ? stored : "DHL");
export const methodOf = (code: CarrierCode): FulfilmentMethod => CARRIERS[code].method;
export const hasUrlTemplate = (code: CarrierCode) => CARRIERS[code].url !== null;

/** The carrier's public tracking page for a reference, when the registry knows one. */
export function templateTrackingUrl(code: CarrierCode, reference: string | null | undefined): string | null {
  const ref = reference?.trim();
  const url = CARRIERS[code].url as CarrierDef["url"];
  return ref && url ? url(ref) : null;
}

/** Admin override first (https only), then the registry template. */
export function resolveTrackingUrl(code: CarrierCode, reference: string | null | undefined, override: string | null | undefined): string | null {
  const custom = override?.trim();
  if (custom && /^https:\/\/[^\s]+$/i.test(custom)) return custom;
  return templateTrackingUrl(code, reference);
}

/** "Raben ADR" when the admin named it, else the preset's own name. */
export function carrierDisplayName(code: CarrierCode, custom: string | null | undefined): string | null {
  return custom?.trim() || CARRIERS[code].name;
}

// ───────────────────────────── stages ─────────────────────────────

export const SHIPMENT_STAGES = ["ORDER_PLACED", "ADR_PACKING", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "DELIVERED"] as const;
export type ShipmentStage = (typeof SHIPMENT_STAGES)[number];
export const isShipmentStage = (value: unknown): value is ShipmentStage => typeof value === "string" && (SHIPMENT_STAGES as readonly string[]).includes(value);

/** The stages each method moves through, in order. */
export const STAGE_SEQUENCE: Record<FulfilmentMethod, readonly ShipmentStage[]> = {
  DHL: ["ORDER_PLACED", "ADR_PACKING", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
  FREIGHT: ["ORDER_PLACED", "ADR_PACKING", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
  OWN_FLEET: ["ORDER_PLACED", "ADR_PACKING", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
  PICKUP: ["ORDER_PLACED", "ADR_PACKING", "READY_FOR_PICKUP", "DELIVERED"],
};

export const stageIndex = (method: FulfilmentMethod, stage: ShipmentStage) => STAGE_SEQUENCE[method].indexOf(stage);

export function nextStage(method: FulfilmentMethod, stage: ShipmentStage): ShipmentStage | null {
  const seq = STAGE_SEQUENCE[method];
  const i = seq.indexOf(stage);
  return i >= 0 && i < seq.length - 1 ? seq[i + 1] : null;
}

export function previousStage(method: FulfilmentMethod, stage: ShipmentStage): ShipmentStage | null {
  const i = STAGE_SEQUENCE[method].indexOf(stage);
  return i > 0 ? STAGE_SEQUENCE[method][i - 1] : null;
}

/**
 * The coarse order status every other part of the app reads (admin buckets,
 * dashboards, cancellation, compliance) — kept in step with the stage on
 * every write. "Left the warehouse or waiting at it" is IN_TRANSIT; there is
 * no fourth status, and adding one would ripple through every reader.
 */
export function stageToStatus(stage: ShipmentStage): OrderStatus {
  if (stage === "DELIVERED") return "DELIVERED";
  if (stage === "ORDER_PLACED" || stage === "ADR_PACKING") return "PENDING";
  return "IN_TRANSIT";
}

/** Orders written before the stage existed: the status is all there is. */
export function stageOf(stored: string | null | undefined, status: OrderStatus): ShipmentStage {
  if (isShipmentStage(stored)) return stored;
  return status === "DELIVERED" ? "DELIVERED" : status === "IN_TRANSIT" ? "IN_TRANSIT" : "ORDER_PLACED";
}

/** Has the consignment left us (or been put out for collection)? */
export const isDispatchedStage = (stage: ShipmentStage) => stageToStatus(stage) !== "PENDING";

// ───────────────────────────── checkpoints ─────────────────────────────

export interface ShipmentEvent {
  stage: ShipmentStage;
  /** ISO timestamp. */
  at: string;
  location?: string;
  note?: string;
  source: "admin" | "crm" | "system";
}

/** The JSON column, defensively: anything malformed is dropped, never thrown on. */
export function parseShipmentEvents(value: unknown): ShipmentEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .filter((e) => isShipmentStage(e.stage) && typeof e.at === "string" && !Number.isNaN(Date.parse(e.at)))
    .map((e): ShipmentEvent => ({
      stage: e.stage as ShipmentStage,
      at: e.at as string,
      ...(typeof e.location === "string" && e.location.trim() ? { location: e.location.trim() } : {}),
      ...(typeof e.note === "string" && e.note.trim() ? { note: e.note.trim() } : {}),
      source: e.source === "crm" ? "crm" : e.source === "system" ? "system" : "admin",
    }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// ───────────────────────────── customer emails ─────────────────────────────

/** The fulfilment emails a stage change can trigger. */
export type FulfilmentEmailKind = "SHIPPED" | "OUT_FOR_DELIVERY" | "READY_FOR_PICKUP" | "DELIVERED";

/**
 * Which email (if any) moving from `from` to `to` sends. Only real progress
 * the buyer acts on: it left (once), it's arriving today, it's ready to
 * collect, it arrived. In-transit checkpoints and corrections send nothing.
 */
export function emailForTransition(method: FulfilmentMethod, from: ShipmentStage, to: ShipmentStage): FulfilmentEmailKind | null {
  if (stageIndex(method, to) <= stageIndex(method, from)) return null;
  if (to === "DELIVERED") return "DELIVERED";
  if (to === "READY_FOR_PICKUP") return "READY_FOR_PICKUP";
  if (to === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if ((to === "DISPATCHED" || to === "IN_TRANSIT") && !isDispatchedStage(from)) return "SHIPPED";
  return null;
}
