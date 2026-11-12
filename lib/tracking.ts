// Pure tracking domain types + timeline derivation. No server imports here:
// this module is shared by the server-only DHL client (lib/dhl.ts), the
// shipping resolver (lib/shipping/resolve.ts) and the client-side tracking UI.

import type { OrderStatus } from "@/lib/generated/prisma/enums";
import {
  carrierCodeOf,
  carrierDisplayName,
  methodOf,
  parseShipmentEvents,
  resolveTrackingUrl,
  stageOf,
  type CarrierCode,
  type FulfilmentMethod,
  type ShipmentStage,
} from "@/lib/shipping/carriers";

/** Normalized DHL Unified Tracking API status codes. */
export type DhlStatusCode = "pre-transit" | "transit" | "delivered" | "failure" | "unknown";

export interface DhlEvent {
  timestamp: string | null;
  description: string;
  location: string | null;
}

export interface DhlTracking {
  trackingNumber: string;
  statusCode: DhlStatusCode;
  description: string;
  location: string | null;
  timestamp: string | null;
  estimatedDelivery: string | null;
  events: DhlEvent[];
}

export type TrackingErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

export type TrackingResult = { ok: true; tracking: DhlTracking } | { ok: false; code: TrackingErrorCode };

// ---------------------------------------------------------------------------
// Timeline derivation — one view for every carrier
// ---------------------------------------------------------------------------

/** Position on the 4-node stepper. Stable across methods (dashboards key on "delivered"). */
export type TimelineStepKey = "placed" | "shipped" | "inTransit" | "delivered";
export type TimelineStepState = "done" | "current" | "upcoming";

/**
 * What the step is called. Delivery: placed → packing/shipped → in transit /
 * out for delivery → delivered. Pickup: accepted → preparing → ready → collected.
 */
export type TimelineStepLabel =
  | "placed"
  | "packing"
  | "shipped"
  | "inTransit"
  | "outForDelivery"
  | "delivered"
  | "pickupPlaced"
  | "pickupPreparing"
  | "pickupReady"
  | "pickupCollected";

/** The Checkout-namespace message for each label. */
export const STEP_LABEL_KEY: Record<TimelineStepLabel, string> = {
  placed: "stepPlaced",
  packing: "stepPacking",
  shipped: "stepShipped",
  inTransit: "stepInTransit",
  outForDelivery: "stepOutForDelivery",
  delivered: "stepDelivered",
  pickupPlaced: "stepPickupPlaced",
  pickupPreparing: "stepPickupPreparing",
  pickupReady: "stepPickupReady",
  pickupCollected: "stepPickupCollected",
};

/** The Checkout-namespace message for each stage (checkpoint log, admin, badges). */
export const STAGE_LABEL_KEY: Record<ShipmentStage, string> = {
  ORDER_PLACED: "stageOrderPlaced",
  ADR_PACKING: "stageAdrPacking",
  DISPATCHED: "stageDispatched",
  IN_TRANSIT: "stageInTransit",
  OUT_FOR_DELIVERY: "stageOutForDelivery",
  READY_FOR_PICKUP: "stageReadyForPickup",
  DELIVERED: "stageDelivered",
};

export interface TimelineStep {
  key: TimelineStepKey;
  label: TimelineStepLabel;
  state: TimelineStepState;
  /** ISO timestamp when known: order creation, the checkpoint that reached it, a carrier scan. */
  timestamp: string | null;
}

/** One line of the checkpoint log: a carrier scan (description) or our own checkpoint (stage). */
export interface TrackingEvent {
  timestamp: string | null;
  /** Carrier wording (DHL scans). */
  description: string | null;
  /** Our checkpoint; rendered with the localized stage label. */
  stage: ShipmentStage | null;
  location: string | null;
  note: string | null;
}

export interface OrderTrackingView {
  /** True when the timeline is backed by live DHL data. */
  live: boolean;
  method: FulfilmentMethod;
  carrierCode: CarrierCode;
  stage: ShipmentStage;
  steps: TimelineStep[];
  /** Newest first. */
  events: TrackingEvent[];
  estimatedDelivery: string | null;
  /** DHL and freight carriers: who carries it, and where to follow it. */
  carrier: { name: string | null; trackingNumber: string | null; trackingUrl: string | null } | null;
  /** Own ADR vehicle. */
  fleet: { vehiclePlate: string | null; driverName: string | null; driverPhone: string | null } | null;
  /** Collection at the warehouse. */
  pickup: { location: string | null; hours: string | null } | null;
  /** Delivery window, gate code, instructions — as the logistics team wrote them. */
  notes: string | null;
}

/** The order columns the view is built from. */
export interface ShipmentSource {
  status: OrderStatus;
  createdAt: string;
  estimatedDelivery: string;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  carrierName: string | null;
  trackingUrl: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  deliveryNotes: string | null;
  shipmentStage: string | null;
  shipmentEvents: unknown;
}

/** Stepper position (1-4) and label set for a stage. */
function stepperFor(method: FulfilmentMethod, stage: ShipmentStage): { reached: number; labels: TimelineStepLabel[] } {
  if (method === "PICKUP") {
    const position: Partial<Record<ShipmentStage, number>> = { ORDER_PLACED: 1, ADR_PACKING: 2, READY_FOR_PICKUP: 3, DELIVERED: 4 };
    const reached = position[stage] ?? 1;
    return { reached, labels: ["pickupPlaced", "pickupPreparing", "pickupReady", "pickupCollected"] };
  }
  const position: Record<ShipmentStage, number> = { ORDER_PLACED: 1, ADR_PACKING: 2, DISPATCHED: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 3, READY_FOR_PICKUP: 3, DELIVERED: 4 };
  const reached = position[stage];
  return {
    reached,
    labels: ["placed", stage === "ADR_PACKING" ? "packing" : "shipped", stage === "OUT_FOR_DELIVERY" ? "outForDelivery" : "inTransit", "delivered"],
  };
}

/** Which stepper position a stage belongs to (for timestamps). */
const positionOf = (method: FulfilmentMethod, stage: ShipmentStage) => stepperFor(method, stage).reached;

function reachedFromDhl(code: DhlStatusCode): number | null {
  switch (code) {
    case "pre-transit":
      return 2;
    case "transit":
      return 3;
    case "delivered":
      return 4;
    default:
      // "failure"/"unknown" carry no positional information.
      return null;
  }
}

const STEP_KEYS: TimelineStepKey[] = ["placed", "shipped", "inTransit", "delivered"];

/**
 * Collapses an order — any carrier — into the view every tracking surface
 * renders. The stage set by the admin or the CRM drives the stepper; for DHL
 * a live scan can move it further (never back), so a lagging API and a
 * manual override can't fight.
 */
export function buildOrderTracking(input: {
  order: ShipmentSource;
  dhl: DhlTracking | null;
  /** Warehouse address and opening hours for pickups (server config). */
  pickupDefaults?: { location: string | null; hours: string | null };
}): OrderTrackingView {
  const { order } = input;
  const carrierCode = carrierCodeOf(order.shippingCarrier);
  const method = methodOf(carrierCode);
  const stage = stageOf(order.shipmentStage, order.status);
  const checkpoints = parseShipmentEvents(order.shipmentEvents);
  const dhl = method === "DHL" ? input.dhl : null;

  const own = stepperFor(method, stage);
  const fromDhl = dhl ? reachedFromDhl(dhl.statusCode) : null;
  const reached = Math.max(own.reached, fromDhl ?? 0);
  const labels = fromDhl && fromDhl > own.reached ? stepperFor(method, fromDhl === 4 ? "DELIVERED" : fromDhl === 3 ? "IN_TRANSIT" : "DISPATCHED").labels : own.labels;

  const firstAt = (position: number) => checkpoints.find((e) => positionOf(method, e.stage) === position)?.at ?? null;
  const latestDhl = dhl?.events[0]?.timestamp ?? dhl?.timestamp ?? null;

  const steps: TimelineStep[] = STEP_KEYS.map((key, idx) => {
    const position = idx + 1;
    const state: TimelineStepState = position < reached ? "done" : position === reached ? (reached === 4 ? "done" : "current") : "upcoming";
    const timestamp = position === 1 ? order.createdAt : state === "upcoming" ? null : (firstAt(position) ?? (position === reached ? latestDhl : null));
    return { key, label: labels[idx], state, timestamp };
  });

  const ownEvents: TrackingEvent[] = checkpoints.map((e) => ({ timestamp: e.at, description: null, stage: e.stage, location: e.location ?? null, note: e.note ?? null }));
  const events: TrackingEvent[] = dhl?.events.length
    ? dhl.events.map((e) => ({ timestamp: e.timestamp, description: e.description, stage: null, location: e.location, note: null }))
    : [...ownEvents].reverse();

  return {
    live: Boolean(dhl),
    method,
    carrierCode,
    stage: reached === 4 ? "DELIVERED" : stage,
    steps,
    events,
    estimatedDelivery: dhl?.estimatedDelivery ?? order.estimatedDelivery,
    carrier:
      method === "DHL" || method === "FREIGHT"
        ? {
            name: carrierDisplayName(carrierCode, order.carrierName),
            trackingNumber: order.trackingNumber,
            trackingUrl: resolveTrackingUrl(carrierCode, order.trackingNumber, order.trackingUrl),
          }
        : null,
    fleet: method === "OWN_FLEET" ? { vehiclePlate: order.vehiclePlate, driverName: order.driverName, driverPhone: order.driverPhone } : null,
    pickup: method === "PICKUP" ? { location: input.pickupDefaults?.location ?? null, hours: input.pickupDefaults?.hours ?? null } : null,
    notes: order.deliveryNotes?.trim() || null,
  };
}
