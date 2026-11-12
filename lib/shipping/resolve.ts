import "server-only";

import { fetchDhlTracking } from "@/lib/dhl";
import { buildOrderTracking, type OrderTrackingView, type ShipmentSource } from "@/lib/tracking";
import { carrierCodeOf, methodOf } from "@/lib/shipping/carriers";
import type { OrderStatus } from "@/lib/generated/prisma/enums";

/**
 * resolveOrderTracking — the one place an order becomes a tracking view.
 *
 *   DHL + tracking number  live DHL scan (cached 5 min upstream); the stage
 *                          set by the admin/CRM still counts, and a scan can
 *                          only move the stepper forward. No key, no scan yet
 *                          or an outage: the stage and checkpoints alone.
 *   freight carrier        stage + checkpoints; public link from the carrier
 *                          registry or the admin's override.
 *   own ADR fleet          stage + checkpoints; vehicle and driver instead of a link.
 *   warehouse pickup       stage + checkpoints; pickup labels, address, hours.
 *
 * Callers load the order scoped to its owner (or an admin) first: this does
 * no access control of its own.
 */

/** The columns the view needs — spread into a Prisma `select`. */
export const SHIPMENT_SELECT = {
  status: true,
  createdAt: true,
  estimatedDelivery: true,
  trackingNumber: true,
  shippingCarrier: true,
  carrierName: true,
  trackingUrl: true,
  driverName: true,
  driverPhone: true,
  vehiclePlate: true,
  deliveryNotes: true,
  shipmentStage: true,
  shipmentEvents: true,
} as const;

export interface ShipmentRow {
  status: OrderStatus;
  createdAt: Date | string;
  estimatedDelivery: Date | string;
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

const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

/**
 * Exactly the shipment columns, never the rest of the row. Callers pass the
 * whole order (with Decimal totals and line items): spreading it carried
 * those into every client component that got a `shipment` — Prisma Decimals
 * that React refuses to serialise ("Only plain objects can be passed to
 * Client Components"), one console error per order on /profile.
 */
export function shipmentSource(row: ShipmentRow): ShipmentSource {
  return {
    status: row.status,
    createdAt: iso(row.createdAt),
    estimatedDelivery: iso(row.estimatedDelivery),
    trackingNumber: row.trackingNumber,
    shippingCarrier: row.shippingCarrier,
    carrierName: row.carrierName,
    trackingUrl: row.trackingUrl,
    driverName: row.driverName,
    driverPhone: row.driverPhone,
    vehiclePlate: row.vehiclePlate,
    deliveryNotes: row.deliveryNotes,
    shipmentStage: row.shipmentStage,
    shipmentEvents: row.shipmentEvents,
  };
}

/**
 * Where pickups happen. Configuration, not code: unset means the page says
 * the logistics team will confirm it (and the admin's notes on the order
 * carry it), rather than printing an address nobody checked.
 */
export function pickupDefaults(): { location: string | null; hours: string | null } {
  return {
    location: process.env.WAREHOUSE_PICKUP_ADDRESS?.trim() || null,
    hours: process.env.WAREHOUSE_PICKUP_HOURS?.trim() || null,
  };
}

export async function resolveOrderTracking(row: ShipmentRow, options: { live?: boolean } = {}): Promise<OrderTrackingView> {
  const isDhl = methodOf(carrierCodeOf(row.shippingCarrier)) === "DHL";
  let dhl = null;
  if (options.live !== false && isDhl && row.trackingNumber) {
    try {
      const result = await fetchDhlTracking(row.trackingNumber);
      dhl = result.ok ? result.tracking : null;
    } catch (error) {
      // A DHL outage must never break an order page: the stage still renders.
      console.error("[shipping] DHL lookup failed:", error);
    }
  }
  return buildOrderTracking({ order: shipmentSource(row), dhl, pickupDefaults: pickupDefaults() });
}
