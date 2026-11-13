"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isValidCompanyId } from "@/lib/profilePrefs";
import { notifyAdmin } from "@/lib/telegram";
import { buildPaymentReportedMessage } from "@/lib/orderNotification";

/**
 * The two writes the checkout flow makes besides placing the order.
 *
 *  • updateBillingDetails — the payer block on /checkout: company, VAT /
 *    ЄДРПОУ and billing email, edited in place before the invoice is issued
 *    (the invoice and its email read them from the user row). Same rules as
 *    the profile editor (lib/actions/profile), without its required name.
 *
 *  • reportPaymentSent — "I've sent the transfer" on /checkout/success. It
 *    records when (and the bank's reference, if given) and tells logistics.
 *    It is a report, not a settlement: paymentStatus changes only when the
 *    money is matched on the statement (markOrderPaid).
 */

const BillingInput = z.object({
  companyName: z.string().trim().max(120),
  vatNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.\-]/g, "").toUpperCase())
    .refine((v) => v === "" || isValidCompanyId(v), "vatNumber"),
  billingEmail: z.string().trim().toLowerCase().max(254).email("billingEmail").or(z.literal("")),
});

export type BillingResult =
  | { ok: true; companyName: string | null; vatNumber: string | null; billingEmail: string | null }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "FAILED"; field?: string };

export async function updateBillingDetails(raw: unknown): Promise<BillingResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = BillingInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const { companyName, vatNumber, billingEmail } = parsed.data;
  try {
    const saved = await prisma.user.update({
      where: { id: userId },
      data: { companyName: companyName || null, vatNumber: vatNumber || null, billingEmail: billingEmail || null },
      select: { companyName: true, vatNumber: true, billingEmail: true },
    });
    revalidatePath("/[locale]/profile", "page");
    return { ok: true, ...saved };
  } catch (error) {
    console.error("updateBillingDetails failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

const ReportInput = z.object({
  orderId: z.string().min(1).max(64),
  // The bank's transaction / end-to-end reference, if the buyer has it. Optional.
  reference: z.string().trim().max(80).optional().or(z.literal("")),
});

export type ReportResult =
  | { ok: true; reportedAt: string; reference: string | null }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "NOT_FOUND" | "ALREADY_PAID" | "FAILED" };

export async function reportPaymentSent(raw: unknown): Promise<ReportResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = ReportInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  // Scoped by userId: an order id is not authorisation to touch someone else's order.
  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, userId },
    select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true, paymentReportedAt: true, paymentReportedRef: true, user: { select: { name: true, companyName: true, email: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (order.paymentStatus === "PAID") return { ok: false, code: "ALREADY_PAID" };

  // Idempotent: a second press keeps the first timestamp and only fills in a reference given later.
  const reference = parsed.data.reference?.trim() || order.paymentReportedRef || null;
  try {
    const saved = await prisma.order.update({
      where: { id: order.id },
      data: { paymentReportedAt: order.paymentReportedAt ?? new Date(), paymentReportedRef: reference },
      select: { paymentReportedAt: true, paymentReportedRef: true },
    });
    if (!order.paymentReportedAt || reference !== order.paymentReportedRef) {
      const customer = [order.user.companyName, order.user.name, order.user.email].filter(Boolean).join(" · ") || null;
      await notifyAdmin(
        buildPaymentReportedMessage({ orderNumber: order.orderNumber, orderId: order.id, totalAmount: Number(order.totalAmount), customer, bankReference: reference }),
        `payment reported ${order.orderNumber}`
      );
    }
    return { ok: true, reportedAt: saved.paymentReportedAt!.toISOString(), reference: saved.paymentReportedRef };
  } catch (error) {
    console.error("reportPaymentSent failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
