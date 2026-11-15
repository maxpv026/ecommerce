import "server-only";

import prisma from "@/lib/prisma";
import { stageOf } from "@/lib/shipping/carriers";
import { labelForMark } from "@/lib/priceHistory";

/**
 * The /notifications feed — every item is a fact already in the database for
 * THIS user, never a sample: orders (placed, paid, current shipment stage,
 * cancelled), F-Gas verdicts (FgasAuditLog) and an expiring certificate,
 * triggered price alerts, back-in-stock notices, cylinder-return status.
 *
 * What it cannot say: when each shipment stage happened — orders keep only
 * their current stage, so that item is stamped with the order's last update.
 * There is no read/unread in the schema; the page marks "new since your last
 * visit" per device.
 */

export type FeedKind = "orderPlaced" | "orderPaid" | "orderStage" | "orderCancelled" | "fgasVerified" | "fgasRejected" | "fgasPending" | "fgasExpired" | "fgasExpiring" | "priceAlert" | "backInStock" | "returnStatus";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  /** ISO time the fact was recorded. */
  at: string;
  href: string;
  /** Values for the item's message (order number, totals, gas…). */
  v: Record<string, string | number>;
}

const EXPIRY_WARN_DAYS = 60;
const FGAS_KIND: Record<string, FeedKind | undefined> = { VERIFIED: "fgasVerified", REJECTED: "fgasRejected", PENDING_REVIEW: "fgasPending", EXPIRED: "fgasExpired" };

export async function getNotificationFeed(userId: string, limit = 40): Promise<FeedItem[]> {
  const [user, orders, audits, alerts, subs, returns] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, fGasStatus: true, fGasExpiresAt: true } }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, orderNumber: true, createdAt: true, updatedAt: true, paidAt: true, totalAmount: true, paymentStatus: true, status: true, shipmentStage: true, estimatedDelivery: true, _count: { select: { items: true } } },
    }),
    prisma.fgasAuditLog.findMany({ where: { userId, newStatus: { not: null } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, newStatus: true, reason: true, createdAt: true, certificateId: true } }),
    prisma.priceAlert.findMany({ where: { userId, triggeredAt: { not: null } }, orderBy: { triggeredAt: "desc" }, take: 10, select: { id: true, mark: true, targetPerKg: true, triggeredAt: true } }),
    prisma.stockSubscription.findMany({ where: { userId, notified: true, notifiedAt: { not: null } }, orderBy: { notifiedAt: "desc" }, take: 10, select: { id: true, notifiedAt: true, productId: true, product: { select: { name: true } } } }),
    prisma.cylinderReturnRequest.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, status: true, quantity: true, updatedAt: true } }),
  ]);
  if (!user) return [];

  const items: FeedItem[] = [];
  for (const o of orders) {
    const total = Number(o.totalAmount);
    items.push({ id: `o-${o.id}-placed`, kind: "orderPlaced", at: o.createdAt.toISOString(), href: `/profile/orders/${o.id}`, v: { number: o.orderNumber, total, lines: o._count.items } });
    if (o.paymentStatus === "FAILED") {
      items.push({ id: `o-${o.id}-cancelled`, kind: "orderCancelled", at: o.updatedAt.toISOString(), href: `/profile/orders/${o.id}`, v: { number: o.orderNumber } });
      continue;
    }
    if (o.paidAt) items.push({ id: `o-${o.id}-paid`, kind: "orderPaid", at: o.paidAt.toISOString(), href: `/profile/orders/${o.id}`, v: { number: o.orderNumber, total } });
    const stage = stageOf(o.shipmentStage, o.status);
    if (stage !== "ORDER_PLACED") {
      items.push({ id: `o-${o.id}-stage-${stage}`, kind: "orderStage", at: o.updatedAt.toISOString(), href: `/profile/orders/${o.id}`, v: { number: o.orderNumber, stage, eta: o.estimatedDelivery.toISOString() } });
    }
  }
  for (const a of audits) {
    const kind = a.newStatus ? FGAS_KIND[a.newStatus] : undefined;
    if (kind) items.push({ id: `f-${a.id}`, kind, at: a.createdAt.toISOString(), href: "/profile?tab=fgas", v: { reason: a.reason ?? "", certificate: a.certificateId ?? "" } });
  }
  if (user.fGasStatus === "VERIFIED" && user.fGasExpiresAt) {
    const days = Math.ceil((user.fGasExpiresAt.getTime() - Date.now()) / 86_400_000);
    if (days >= 0 && days <= EXPIRY_WARN_DAYS) items.push({ id: `f-expiring-${user.fGasExpiresAt.toISOString().slice(0, 10)}`, kind: "fgasExpiring", at: new Date().toISOString(), href: "/profile?tab=fgas", v: { date: user.fGasExpiresAt.toISOString(), days } });
  }
  for (const a of alerts) items.push({ id: `p-${a.id}`, kind: "priceAlert", at: a.triggeredAt!.toISOString(), href: "/hub", v: { gas: labelForMark(a.mark), target: Number(a.targetPerKg) } });
  for (const s of subs) items.push({ id: `s-${s.id}`, kind: "backInStock", at: s.notifiedAt!.toISOString(), href: `/products/${s.productId}`, v: { name: s.product.name } });
  for (const r of returns) items.push({ id: `r-${r.id}-${r.status}`, kind: "returnStatus", at: r.updatedAt.toISOString(), href: "/profile?tab=cylinders", v: { status: r.status, quantity: r.quantity } });

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
