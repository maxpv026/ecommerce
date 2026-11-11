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
  /**
   * "bar" for the order page's mobile action bar (icon-only on phones),
   * "toolbar" for its desktop header, "primary" as a full-width button,
   * "quiet" for rows in the order list.
   */
  variant?: "primary" | "bar" | "toolbar" | "quiet";
}) {
  const t = useTranslations("OrderDetail");
  if (!invoiceId) return null;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl font-medium tracking-[-.02em] transition-colors";
  const skin =
    variant === "primary"
      ? "h-12 w-full border border-slate-900/[.14] bg-white/70 px-5 text-[14px] text-slate-700 hover:bg-white md:w-auto md:flex-none dark:border-white/[.16] dark:bg-white/[.05] dark:text-slate-200 dark:hover:bg-white/[.1]"
      : variant === "bar"
        ? "h-12 w-12 flex-none rounded-[14px] border border-slate-900/[.14] bg-white/70 text-[14px] text-slate-700 hover:bg-white sm:w-auto sm:px-5 dark:border-white/[.16] dark:bg-white/[.05] dark:text-slate-200 dark:hover:bg-white/[.1]"
        : variant === "toolbar"
        ? "h-10 rounded-[12px] border border-slate-900/[.14] bg-white/70 px-4 text-[13.5px] text-slate-700 hover:bg-white dark:border-white/[.16] dark:bg-white/[.05] dark:text-slate-200 dark:hover:bg-white/[.1]"
        : "h-9 rounded-[12px] px-3 text-[12.5px] text-blue-700 hover:bg-blue-700/[.07] dark:text-blue-400 dark:hover:bg-blue-400/[.1]";

  return (
    <a
      href={`/api/invoices/${invoiceId}/download`}
      data-download-invoice
      title={variant === "bar" ? t("downloadInvoice") : undefined}
      className={`${base} ${skin}`}
    >
      <Download size={variant === "quiet" ? 14 : variant === "bar" ? 18 : 16} strokeWidth={2.2} />
      {variant === "bar" ? <span className="sr-only sm:not-sr-only">{t("downloadInvoice")}</span> : t("downloadInvoice")}
    </a>
  );
}
