import "server-only";

import prisma from "@/lib/prisma";
import { after } from "next/server";
import { markOrderPaid, releaseOrder } from "@/lib/orders";
import { sendPaymentReceivedEmail } from "@/lib/orderEmails";

/**
 * Order state changes shared by /admin/orders (lib/actions/adminOrders) and
 * the Telegram bot. The caller has checked "orders.manage"; these only do
 * the work, and say why they couldn't.
 */

type Done = { ok: true } | { ok: false; error: string };
const STALE = "The order changed since this page loaded — refresh to see its current state.";

/** A bank transfer arrived: settle the order and its invoice, and email the buyer. */
export async function settleOrderPayment(orderId: string): Promise<Done> {
  const paidAt = new Date();
  if (!(await markOrderPaid(orderId, paidAt))) return { ok: false, error: STALE };
  await prisma.invoice.updateMany({ where: { orderId: orderId, status: "PENDING" }, data: { status: "PAID" } });
  // The buyer hears about it (with the paid invoice) — after the response.
  after(() => sendPaymentReceivedEmail(orderId));
  return { ok: true };
}

/**
 * Cancels an order that was never paid and hasn't shipped: releaseOrder puts
 * the stock back (at most once), the invoice is cancelled, and cylinders
 * booked out at checkout are booked back. A paid order needs a refund and a
 * credit note, which the app doesn't do.
 */
export async function cancelOrderAndRelease(orderId: string): Promise<Done> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, paymentStatus: true, status: true } });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.paymentStatus === "PAID") return { ok: false, error: "Paid orders need a refund and credit note — that isn't supported here yet." };
  if (order.status !== "PENDING") return { ok: false, error: "This order has already shipped and can't be cancelled." };

  if (!(await releaseOrder(orderId))) return { ok: false, error: STALE };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoice.updateMany({ where: { orderId: orderId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
      const ledger = await tx.cylinderTransaction.groupBy({
        by: ["type"],
        where: { orderId: orderId, type: { in: ["BORROWED", "RETURNED"] } },
        _sum: { quantity: true },
      });
      const sum = (t: string) => ledger.find((l) => l.type === t)?._sum.quantity ?? 0;
      const outstanding = sum("BORROWED") - sum("RETURNED");
      if (outstanding > 0) {
        await tx.cylinderTransaction.create({
          data: { userId: order.userId, orderId: orderId, type: "RETURNED", quantity: outstanding, notes: "Order cancelled before dispatch" },
        });
      }
    });
  } catch (error) {
    // The order is cancelled and restocked; only the paperwork failed.
    console.error(`[admin-orders] cancelled ${orderId} but could not update invoice/ledger:`, error);
        return { ok: false, error: "Order cancelled and restocked, but the invoice or cylinder ledger couldn't be updated. Check them." };
  }

    return { ok: true };
}
