import "server-only";

import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import {
  carrierCodeOf,
  methodOf,
  parseShipmentEvents,
  resolveTrackingUrl,
  stageOf,
  type CarrierCode,
  type FulfilmentMethod,
  type ShipmentEvent,
  type ShipmentStage,
} from "@/lib/shipping/carriers";

/**
 * Admin order directory — read side. Writes live in lib/actions/adminOrders.
 *
 * An order has two independent lifecycles in this schema: payment
 * (paymentStatus PENDING/PAID/FAILED) and fulfilment (status
 * PENDING/IN_TRANSIT/DELIVERED + trackingNumber). The admin's five statuses
 * are derived from the pair rather than stored, so they can never disagree
 * with what checkout, invoicing and the compliance ledger read.
 */

export const ADMIN_ORDERS_PAGE_SIZE = 25;

export const ORDER_STAGES = ["awaiting_payment", "processing", "shipped", "delivered", "cancelled"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];
export const ADMIN_ORDER_FILTERS = ["all", ...ORDER_STAGES] as const;
export type AdminOrderFilter = (typeof ADMIN_ORDER_FILTERS)[number];

export function orderStage(status: OrderStatus, payment: PaymentStatus): OrderStage {
  if (payment === "FAILED") return "cancelled";
  if (status === "DELIVERED") return "delivered";
  if (status === "IN_TRANSIT") return "shipped";
  return payment === "PAID" ? "processing" : "awaiting_payment";
}

const STAGE_WHERE: Record<OrderStage, Prisma.OrderWhereInput> = {
  awaiting_payment: { paymentStatus: "PENDING", status: "PENDING" },
  processing: { paymentStatus: "PAID", status: "PENDING" },
  shipped: { paymentStatus: { not: "FAILED" }, status: "IN_TRANSIT" },
  delivered: { paymentStatus: { not: "FAILED" }, status: "DELIVERED" },
  cancelled: { paymentStatus: "FAILED" },
};

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  createdAt: string;
  stage: OrderStage;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  totalAmount: number;
  trackingNumber: string | null;
  estimatedDelivery: string;
  shippingAddress: string | null;
  /** Carrier-agnostic fulfilment (lib/shipping): what the admin panel edits. */
  shipment: {
    carrier: CarrierCode;
    method: FulfilmentMethod;
    stage: ShipmentStage;
    carrierName: string | null;
    /** The stored override only; `publicUrl` is what the buyer actually gets. */
    trackingUrl: string | null;
    publicUrl: string | null;
    driverName: string | null;
    driverPhone: string | null;
    vehiclePlate: string | null;
    deliveryNotes: string | null;
    /** Oldest first. */
    events: ShipmentEvent[];
  };
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    companyName: string | null;
    vatNumber: string | null;
    /** The account's resolved country (User.countryCode, lib/userCountry). */
    country: { code: string; city: string | null; source: string } | null;
  };
  invoice: { id: string; invoiceNumber: string; status: string } | null;
  items: Array<{ id: string; sku: string; name: string; quantity: number; unitPrice: number; deposit: number; weightKg: number }>;
}

export interface AdminOrdersPage {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: Record<AdminOrderFilter, number>;
}

function searchWhere(query: string): Prisma.OrderWhereInput {
  const q = query.trim();
  if (q.length < 2) return {};
  return {
    OR: [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { trackingNumber: { contains: q, mode: "insensitive" } },
      { carrierName: { contains: q, mode: "insensitive" } },
      { vehiclePlate: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { companyName: { contains: q, mode: "insensitive" } } },
    ],
  };
}

export async function listAdminOrders(options: { filter?: AdminOrderFilter; query?: string; page?: number }): Promise<AdminOrdersPage> {
  const filter = options.filter ?? "all";
  const search = searchWhere(options.query ?? "");
  const where: Prisma.OrderWhereInput = { AND: [filter === "all" ? {} : STAGE_WHERE[filter], search] };

  const [total, ...stageCounts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: search }),
    ...ORDER_STAGES.map((stage) => prisma.order.count({ where: { AND: [STAGE_WHERE[stage], search] } })),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * ADMIN_ORDERS_PAGE_SIZE,
    take: ADMIN_ORDERS_PAGE_SIZE,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      paidAt: true,
      totalAmount: true,
      trackingNumber: true,
      estimatedDelivery: true,
      shippingAddress: true,
      shippingCarrier: true,
      carrierName: true,
      trackingUrl: true,
      driverName: true,
      driverPhone: true,
      vehiclePlate: true,
      deliveryNotes: true,
      shipmentStage: true,
      shipmentEvents: true,
      user: { select: { id: true, name: true, email: true, companyName: true, vatNumber: true, countryCode: true, countryCity: true, countrySource: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          priceAtPurchase: true,
          depositAtPurchase: true,
          weightKgAtPurchase: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });

  const [all, ...rest] = stageCounts;
  return {
    rows: orders.map((o) => {
      const carrier = carrierCodeOf(o.shippingCarrier);
      return {
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt.toISOString(),
      stage: orderStage(o.status, o.paymentStatus),
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      paidAt: o.paidAt?.toISOString() ?? null,
      totalAmount: Number(o.totalAmount),
      trackingNumber: o.trackingNumber,
      estimatedDelivery: o.estimatedDelivery.toISOString(),
      shippingAddress: o.shippingAddress,
      shipment: {
        carrier,
        method: methodOf(carrier),
        stage: stageOf(o.shipmentStage, o.status),
        carrierName: o.carrierName,
        trackingUrl: o.trackingUrl,
        publicUrl: resolveTrackingUrl(carrier, o.trackingNumber, o.trackingUrl),
        driverName: o.driverName,
        driverPhone: o.driverPhone,
        vehiclePlate: o.vehiclePlate,
        deliveryNotes: o.deliveryNotes,
        events: parseShipmentEvents(o.shipmentEvents),
      },
      customer: {
        id: o.user.id,
        name: o.user.name,
        email: o.user.email,
        companyName: o.user.companyName,
        vatNumber: o.user.vatNumber,
        country: o.user.countryCode ? { code: o.user.countryCode, city: o.user.countryCity, source: o.user.countrySource ?? "ip" } : null,
      },
      invoice: o.invoice,
      items: o.items.map((i) => ({
        id: i.id,
        sku: i.product.sku,
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: Number(i.priceAtPurchase),
        deposit: Number(i.depositAtPurchase),
        weightKg: i.weightKgAtPurchase,
      })),
      };
    }),
    total,
    page,
    pageCount,
    counts: Object.fromEntries([["all", all], ...ORDER_STAGES.map((s, i) => [s, rest[i]])]) as Record<AdminOrderFilter, number>,
  };
}
