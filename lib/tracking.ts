// Pure tracking domain types + timeline derivation. No server imports here:
// this module is shared by the server-only DHL client (lib/dhl.ts) and the
// client-side timeline UI, which needs the types.

import type { OrderStatus } from "@/lib/generated/prisma/enums";

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
// Timeline derivation
// ---------------------------------------------------------------------------

export type TimelineStepKey = "placed" | "shipped" | "inTransit" | "delivered";
export type TimelineStepState = "done" | "current" | "upcoming";

export interface TimelineStep {
  key: TimelineStepKey;
  state: TimelineStepState;
  /** ISO timestamp when known (order creation, latest carrier event, ...). */
  timestamp: string | null;
}

export interface OrderTrackingView {
  /** True when the timeline is backed by live DHL data (vs. order status). */
  live: boolean;
  steps: TimelineStep[];
  events: DhlEvent[];
  estimatedDelivery: string | null;
}

const STEP_KEYS: TimelineStepKey[] = ["placed", "shipped", "inTransit", "delivered"];

function reachedFromOrderStatus(status: OrderStatus): number {
  switch (status) {
    case "DELIVERED":
      return 4;
    case "IN_TRANSIT":
      return 3;
    default:
      return 1;
  }
}

function reachedFromDhl(code: DhlStatusCode): number | null {
  switch (code) {
    case "pre-transit":
      return 2;
    case "transit":
      return 3;
    case "delivered":
      return 4;
    default:
      // "failure"/"unknown" carry no positional information — fall back to
      // the order's own status.
      return null;
  }
}

/**
 * Collapses an order (+ optional live DHL data) into the 4-step timeline the
 * order page renders. DHL, when available and positional, wins over the
 * coarse Prisma status.
 */
export function buildOrderTracking(input: {
  orderStatus: OrderStatus;
  createdAt: string;
  estimatedDelivery: string;
  dhl: DhlTracking | null;
}): OrderTrackingView {
  const { orderStatus, createdAt, dhl } = input;

  const reached = (dhl && reachedFromDhl(dhl.statusCode)) ?? reachedFromOrderStatus(orderStatus);

  const latestEventTime = dhl?.events[0]?.timestamp ?? dhl?.timestamp ?? null;

  const steps: TimelineStep[] = STEP_KEYS.map((key, idx) => {
    const state: TimelineStepState =
      idx < reached - 1 ? "done" : idx === reached - 1 ? (reached === 4 ? "done" : "current") : "upcoming";
    let timestamp: string | null = null;
    if (key === "placed") timestamp = createdAt;
    else if (idx === reached - 1) timestamp = latestEventTime;
    return { key, state, timestamp };
  });

  return {
    live: Boolean(dhl),
    steps,
    events: dhl?.events ?? [],
    estimatedDelivery: dhl?.estimatedDelivery ?? input.estimatedDelivery,
  };
}
