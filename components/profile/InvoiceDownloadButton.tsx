"use client";

import { useTranslations } from "next-intl";
import { Download } from "lucide-react";

/**
 * "Download invoice" for one order.
 *
 * Renders nothing without an invoice id, which is the point: an invoice that
 * has not been issued cannot be downloaded, and a button that 404s is worse
 * than no button. `UserOrder.invoiceId` is null until issueInvoiceForOrder()
 * has run, so the control's presence is the honest signal that the order is
 * finalized — rather than inferring it from a status.
 *
 * A plain anchor, not next/link: /api is not locale-prefixed and a download
 * must not be intercepted by the client router.
 *
 * This replaces `window.print()`, which the order page previously ran behind
 * this same label — printing the web page is not the invoice, and calling it
 * one while /api/invoices/[id]/download existed was the disconnect.
 */
export default function InvoiceDownloadButton({
  invoiceId,
  variant = "primary",
}: {
  invoiceId: string | null;
  /** "primary" for the order page, "quiet" for rows in the order list. */
  variant?: "primary" | "quiet";
}) {
  const t = useTranslations("OrderDetail");
  if (!invoiceId) return null;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl font-medium tracking-[-.02em] transition-colors";
  const skin =
    variant === "primary"
      ? "h-12 w-full border border-slate-900/[.14] bg-white/70 px-5 text-[14px] text-slate-700 hover:bg-white md:w-auto md:flex-none dark:border-white/[.16] dark:bg-white/[.05] dark:text-slate-200 dark:hover:bg-white/[.1]"
      : "h-9 rounded-[12px] px-3 text-[12.5px] text-blue-700 hover:bg-blue-700/[.07] dark:text-blue-400 dark:hover:bg-blue-400/[.1]";

  return (
    <a
      href={`/api/invoices/${invoiceId}/download`}
      data-download-invoice
      className={`${base} ${skin}`}
    >
      <Download size={variant === "primary" ? 16 : 14} strokeWidth={2.2} />
      {t("downloadInvoice")}
    </a>
  );
}
