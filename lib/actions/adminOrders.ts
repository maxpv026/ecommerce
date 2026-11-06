"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requireAdmin, type ReviewErrorCode } from "@/lib/fgasReview";
import { markOrderPaid, releaseOrder } from "@/lib/orders";
import { ADMIN_ORDER_FILTERS, listAdminOrders, type AdminOrdersPage } from "@/lib/adminOrders";

/**
 * Admin order actions. Each re-checks the caller against the database
 * (role, ADMIN_EMAIL, enrolled 2FA): a server action is a public endpoint.
 *
 * Every write is a conditional update from a specific state — the `where`
 * names the state the order must still be in — so two admins clicking at
 * once, or a stale screen, can move an order at most once, and never along
 * a transition that isn't listed here.
 */

type Failure = { ok: false; error: string };
type Done = { ok: true } | Failure;

const ADMIN_ERRORS: Record<ReviewErrorCode, string> = {
  UNAUTHENTICATED: "Sign in again.",
  FORBIDDEN: "Not authorised.",
  TWO_FACTOR_REQUIRED: "Enable two-factor authentication to manage orders.",
  USER_NOT_FOUND: "Not authorised.",
  NOT_PENDING: "Not authorised.",
  FAILED: "Not authorised.",
};

async function admin(): Promise<{ ok: true; id: string } | Failure> {
  const session = await auth();
  const check = await requireAdmin(session?.user?.id);
  return check.ok ? { ok: true, id: check.value.id } : { ok: false, error: ADMIN_ERRORS[check.code] };
}

const STALE = "The order changed since this page loaded — refresh to see its current state.";

function refresh(orderId: string) {
  revalidatePath("/[locale]/admin/orders", "page");
  revalidatePath("/[locale]/profile", "page");
  revalidatePath(`/[locale]/profile/orders/${orderId}`, "page");
}

const OrderId = z.string().trim().min(1).max(64);

const ListInput = z.object({
  filter: z.enum(ADMIN_ORDER_FILTERS).catch("all"),
  query: z.string().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});

export async function getAdminOrders(input: unknown): Promise<({ ok: true } & AdminOrdersPage) | Failure> {
  const who = await admin();
  if (!who.ok) return who;
  return { ok: true, ...(await listAdminOrders(ListInput.parse(input ?? {}))) };
}

/**
 * Fulfilment moves. Forward: dispatch (needs the DHL tracking number the
 * customer's timeline reads) and delivery. Back one step: to correct a
 * mis-click. A cancelled order (payment FAILED) is frozen.
 */
const TRANSITIONS = {
  IN_TRANSIT: { from: ["PENDING", "DELIVERED"] },
  DELIVERED: { from: ["IN_TRANSIT"] },
  PENDING: { from: ["IN_TRANSIT"] },
} as const;

const StatusInput = z.object({
  orderId: OrderId,
  status: z.enum(["PENDING", "IN_TRANSIT", "DELIVERED"]),
  trackingNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => /^[A-Z0-9]{8,40}$/.test(v))
    .optional(),
});

export async function updateOrderStatus(
  orderId: string,
  newStatus: "PENDING" | "IN_TRANSIT" | "DELIVERED",
  trackingNumber?: string
): Promise<Done> {
  const who = await admin();
  if (!who.ok) return who;
  const parsed = StatusInput.safeParse({ orderId, status: newStatus, trackingNumber: trackingNumber || undefined });
  if (!parsed.success) return { ok: false, error: "Enter a valid tracking number (8-40 letters or digits)." };

  const { status } = parsed.data;
  const current = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { status: true, trackingNumber: true } });
  if (!current) return { ok: false, error: "That order no longer exists." };

  // Dispatching for the first time needs a tracking number; moving back to
  // "shipped" from "delivered" keeps the one already on the order.
  const tracking = parsed.data.trackingNumber ?? (current.status === "DELIVERED" ? current.trackingNumber : null);
  if (status === "IN_TRANSIT" && !tracking) return { ok: false, error: "Add the DHL tracking number to mark it shipped." };

  const { count } = await prisma.order.updateMany({
    where: {
      id: parsed.data.orderId,
      status: { in: [...TRANSITIONS[status].from] },
      paymentStatus: { not: "FAILED" },
    },
    data: { status, ...(status === "IN_TRANSIT" ? { trackingNumber: tracking } : {}) },
  });
  if (count === 0) return { ok: false, error: STALE };

  refresh(parsed.data.orderId);
  return { ok: true };
}

/** A bank transfer arrived: settle the order and its invoice. */
export async function markOrderPaidByAdmin(orderId: string): Promise<Done> {
  const who = await admin();
  if (!who.ok) return who;
  const parsed = OrderId.safeParse(orderId);
  if (!parsed.success) return { ok: false, error: "Unknown order." };

  const paidAt = new Date();
  if (!(await markOrderPaid(parsed.data, paidAt))) return { ok: false, error: STALE };
  await prisma.invoice.updateMany({ where: { orderId: parsed.data, status: "PENDING" }, data: { status: "PAID" } });

  refresh(parsed.data);
  return { ok: true };
}

/**
 * Cancels an order that was never paid and hasn't shipped.
 *
 * releaseOrder claims it (payment → FAILED) and puts the reserved stock
 * back, at most once. Then the paperwork follows: the invoice issued at
 * checkout is marked CANCELLED, and the cylinders checkout recorded as on
 * loan are booked back as RETURNED, so the account's deposit balance and
 * the F-Gas logbook (which already ignores FAILED orders) stay correct.
 *
 * A paid order is not cancellable here: that needs a refund and a credit
 * note, and neither exists in the app yet.
 */
export async function cancelUnpaidOrder(orderId: string): Promise<Done> {
  const who = await admin();
  if (!who.ok) return who;
  const parsed = OrderId.safeParse(orderId);
  if (!parsed.success) return { ok: false, error: "Unknown order." };

  const order = await prisma.order.findUnique({ where: { id: parsed.data }, select: { userId: true, paymentStatus: true, status: true } });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.paymentStatus === "PAID") return { ok: false, error: "Paid orders need a refund and credit note — that isn't supported here yet." };
  if (order.status !== "PENDING") return { ok: false, error: "This order has already shipped and can't be cancelled." };

  if (!(await releaseOrder(parsed.data))) return { ok: false, error: STALE };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoice.updateMany({ where: { orderId: parsed.data, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
      const ledger = await tx.cylinderTransaction.groupBy({
        by: ["type"],
        where: { orderId: parsed.data, type: { in: ["BORROWED", "RETURNED"] } },
        _sum: { quantity: true },
      });
      const sum = (t: string) => ledger.find((l) => l.type === t)?._sum.quantity ?? 0;
      const outstanding = sum("BORROWED") - sum("RETURNED");
      if (outstanding > 0) {
        await tx.cylinderTransaction.create({
          data: { userId: order.userId, orderId: parsed.data, type: "RETURNED", quantity: outstanding, notes: "Order cancelled before dispatch" },
        });
      }
    });
  } catch (error) {
    // The order is cancelled and restocked; only the paperwork failed.
    console.error(`[admin-orders] cancelled ${parsed.data} but could not update invoice/ledger:`, error);
    refresh(parsed.data);
    return { ok: false, error: "Order cancelled and restocked, but the invoice or cylinder ledger couldn't be updated. Check them." };
  }

  refresh(parsed.data);
  return { ok: true };
}
