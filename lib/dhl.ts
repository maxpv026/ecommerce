import "server-only";
import type { DhlEvent, DhlStatusCode, DhlTracking, TrackingResult } from "@/lib/tracking";

// Client for the DHL "Shipment Tracking - Unified" API
// (https://developer.dhl.com/api-reference/shipment-tracking).
// Runs strictly server-side: the API key is read from the environment here
// and never serialized to the client — callers only ever see TrackingResult.

const DEFAULT_BASE = "https://api-eu.dhl.com";
const MAX_EVENTS = 5;

const KNOWN_CODES: DhlStatusCode[] = ["pre-transit", "transit", "delivered", "failure", "unknown"];

function normalizeStatusCode(raw: unknown): DhlStatusCode {
  return typeof raw === "string" && (KNOWN_CODES as string[]).includes(raw)
    ? (raw as DhlStatusCode)
    : "unknown";
}

/* eslint-disable @typescript-eslint/no-explicit-any -- upstream JSON is untyped */
function locationOf(node: any): string | null {
  const address = node?.location?.address;
  if (!address) return null;
  const parts = [address.addressLocality, address.countryCode].filter(
    (p: unknown): p is string => typeof p === "string" && p.length > 0
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function toEvent(node: any): DhlEvent {
  return {
    timestamp: typeof node?.timestamp === "string" ? node.timestamp : null,
    description:
      (typeof node?.description === "string" && node.description) ||
      (typeof node?.status === "string" && node.status) ||
      "",
    location: locationOf(node),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchDhlTracking(trackingNumber: string): Promise<TrackingResult> {
  const apiKey = process.env.DHL_API_KEY;
  if (!apiKey) return { ok: false, code: "NOT_CONFIGURED" };

  const base = process.env.DHL_API_BASE || DEFAULT_BASE;
  const url = `${base}/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "DHL-API-Key": apiKey, Accept: "application/json" },
      // DHL developer keys are tightly rate-limited (250 calls/day) — cache
      // each tracking number's answer for 5 minutes.
      next: { revalidate: 300 },
    });
  } catch (error) {
    console.error("DHL tracking request failed:", error);
    return { ok: false, code: "UPSTREAM_ERROR" };
  }

  if (response.status === 404) return { ok: false, code: "NOT_FOUND" };
  if (!response.ok) {
    console.error(`DHL tracking responded ${response.status} for ${trackingNumber}`);
    return { ok: false, code: "UPSTREAM_ERROR" };
  }

  try {
    const json = await response.json();
    const shipment = json?.shipments?.[0];
    if (!shipment) return { ok: false, code: "NOT_FOUND" };

    const events: DhlEvent[] = Array.isArray(shipment.events)
      ? shipment.events.slice(0, MAX_EVENTS).map(toEvent)
      : [];

    const tracking: DhlTracking = {
      trackingNumber,
      statusCode: normalizeStatusCode(shipment.status?.statusCode),
      description: toEvent(shipment.status ?? {}).description,
      location: locationOf(shipment.status),
      timestamp: typeof shipment.status?.timestamp === "string" ? shipment.status.timestamp : null,
      estimatedDelivery:
        typeof shipment.estimatedTimeOfDelivery === "string" ? shipment.estimatedTimeOfDelivery : null,
      events,
    };
    return { ok: true, tracking };
  } catch (error) {
    console.error("DHL tracking response could not be parsed:", error);
    return { ok: false, code: "UPSTREAM_ERROR" };
  }
}
