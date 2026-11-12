"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendOrderStatusEmail } from "@/lib/orderEmails";
import { advanceShipment, revertShipment, saveFulfilment, type ShipmentErrorCode } from "@/lib/shipping/update";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { ReviewErrorCode } from "@/lib/fgasReview";
import { requirePermission } from "@/lib/admin/permissions";
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
  NO_DOCUMENT: "Not authorised.",
  DOCUMENT_EXPIRED: "Not authorised.",
  FAILED: "Not authorised.",
};

/** Reading the order list: orders.view. Changing an order: orders.manage (SUPER_ADMIN, ADMIN). */
async function admin(permission: "orders.view" | "orders.manage" = "orders.manage"): Promise<{ ok: true; id: string } | Failure> {
  const session = await auth();
  const check = await requirePermission(session?.user?.id, permission);
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
  const who = await admin("orders.view");
  if (!who.ok) return who;
  return { ok: true, ...(await listAdminOrders(ListInput.parse(input ?? {}))) };
}

// ── Fulfilment: lib/shipping/update is the engine (shared with the CRM webhook) ──

type ShipmentDone = { ok: true; stage?: string; email?: string | null } | { ok: false; error: string; code: ShipmentErrorCode | "AUTH" };

const SHIPMENT_ERRORS: Record<ShipmentErrorCode, string> = {
  NOT_FOUND: "That order no longer exists.",
  CANCELLED: "This order was cancelled.",
  INVALID: "Check the highlighted field.",
  STAGE_NOT_ALLOWED: "That stage doesn't apply to this delivery method.",
  STAGE_BEHIND: "The order is already further along.",
  UNCHANGED: "Nothing to record — add a location or a note for a checkpoint.",
  TRACKING_REQUIRED: "Add the DHL tracking number first.",
  CARRIER_NAME_REQUIRED: "Name the carrier.",
  METHOD_LOCKED: "Move the order back a stage before changing the delivery method.",
  STALE,
};

const shipmentFailure = (code: ShipmentErrorCode, detail?: string): ShipmentDone => ({
  ok: false,
  code,
  error: code === "INVALID" && detail ? `${SHIPMENT_ERRORS.INVALID} (${detail})` : SHIPMENT_ERRORS[code],
});

/** Carrier / method and the details the buyer sees. No stage change, no email. */
export async function saveOrderFulfilment(orderId: string, input: unknown): Promise<ShipmentDone> {
  const who = await admin();
  if (!who.ok) return { ok: false, error: who.error, code: "AUTH" };
  const id = OrderId.safeParse(orderId);
  if (!id.success) return shipmentFailure("NOT_FOUND");
  const result = await saveFulfilment(id.data, input);
  if (!result.ok) return shipmentFailure(result.code, result.detail);
  refresh(id.data);
  return { ok: true };
}

/**
 * Moves the delivery forward (or logs a checkpoint at the current stage) and
 * emails the buyer when the move calls for it — after the response, so a
 * mail outage can't fail the click.
 */
export async function advanceOrderShipment(orderId: string, input: unknown): Promise<ShipmentDone> {
  const who = await admin();
  if (!who.ok) return { ok: false, error: who.error, code: "AUTH" };
  const id = OrderId.safeParse(orderId);
  if (!id.success) return shipmentFailure("NOT_FOUND");
  const result = await advanceShipment(id.data, input, "admin");
  if (!result.ok) return shipmentFailure(result.code, result.detail);
  const email = result.value.email;
  if (email) after(() => sendOrderStatusEmail(id.data, email));
  refresh(id.data);
  return { ok: true, stage: result.value.stage, email };
}

/** One stage back, for a mis-click. Emails nothing. */
export async function revertOrderShipment(orderId: string): Promise<ShipmentDone> {
  const who = await admin();
  if (!who.ok) return { ok: false, error: who.error, code: "AUTH" };
  const id = OrderId.safeParse(orderId);
  if (!id.success) return shipmentFailure("NOT_FOUND");
  const result = await revertShipment(id.data);
  if (!result.ok) return shipmentFailure(result.code, result.detail);
  refresh(id.data);
  return { ok: true, stage: result.value.stage };
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
