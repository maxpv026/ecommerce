"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Receipt } from "lucide-react";
import Header from "./Header";
import InvoiceDownloadButton from "./profile/InvoiceDownloadButton";
import AuthModal from "./AuthModal";
import OrdersEmptyState from "./OrdersEmptyState";
import type { UserOrder } from "@/lib/data";
import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";

/**
 * Desktop order history for /profile/orders.
 *
 * The route used to render nothing above the `md` breakpoint — the page
 * existed but its only child was the mobile layout. This is the missing
 * half, in the same glass-and-glow language as the cart and product list.
 *
 * Fulfilment and settlement are shown as two separate badges on purpose:
 * a SEPA order is legitimately "Awaiting payment · Pending" for days, and
 * collapsing them into one word would hide which of the two is holding the
 * shipment up.
 */

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING:
    "border-amber-600/20 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400",
  IN_TRANSIT:
    "border-blue-700/20 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-400",
  DELIVERED:
    "border-slate-900/10 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "statusPending",
  IN_TRANSIT: "statusInTransit",
  DELIVERED: "statusDelivered",
};

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  PAID: "border-green-600/20 bg-green-50 text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-400",
  PENDING:
    "border-amber-600/20 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400",
  FAILED: "border-red-600/20 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-400",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  PAID: "paymentPaid",
  PENDING: "paymentPending",
  FAILED: "paymentFailed",
};

/** cuid → "cmtunw72…" — enough to quote in a support thread, short enough to sit in a row. */
function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

interface OrderHistoryPageProps {
  orders: UserOrder[];
}

export default function OrderHistoryPage({ orders }: OrderHistoryPageProps) {
  const t = useTranslations("OrderHistory");
  const tStatus = useTranslations("AccountProfile");
  const tPayment = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const empty = orders.length === 0;

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header onSignInClick={() => setIsAuthModalOpen(true)} />

      <div className="relative overflow-x-clip">
        {/* Ambient orb field, same treatment as the cart */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[220px] right-[-8%] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.22] blur-[120px] [animation:hc-breathe_9s_ease-in-out_infinite]" />
          <div className="absolute left-[-10%] top-[200px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-20 blur-[120px] [animation:hc-float_30s_ease-in-out_infinite]" />
        </div>

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto max-w-[1240px] px-8 pb-[120px] pt-11"
          data-order-history
        >
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mb-3 text-xs tracking-[.09em] text-slate-500 dark:text-slate-400">{t("eyebrow")}</div>
              <h1 className="m-0 text-[38px] font-semibold leading-[1.05] tracking-[-.045em]">{t("title")}</h1>
              <p className="mt-3 max-w-[520px] text-[14.5px] leading-[1.6] text-slate-600 dark:text-ink-muted">
                {empty ? t("subtitleEmpty") : t("subtitle")}
              </p>
            </div>
            {!empty && (
              <span className="inline-flex flex-none items-center gap-2 rounded-full border border-blue-700/[.28] bg-blue-50 py-[9px] pl-3 pr-[15px] text-xs font-semibold text-blue-700 dark:bg-blue-600/[.18] dark:text-blue-400">
                <Receipt size={15} strokeWidth={2} />
                {t("orderCount", { count: orders.length })}
              </span>
            )}
          </div>

          {empty ? (
            /* ── Empty state ── */
            <OrdersEmptyState />
          ) : (
            /* ── Order list ── */
            <div className="overflow-hidden rounded-[26px] border border-slate-900/[.08] bg-white/70 shadow-[0_30px_70px_-46px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
              {/* Column headers — the row grid below matches this exactly. */}
              <div className="grid grid-cols-[1.5fr_1fr_1.4fr_0.9fr_32px] items-center gap-4 border-b border-slate-900/[.08] px-6 py-3.5 text-[10.5px] tracking-[.08em] text-slate-500 dark:border-hairline dark:text-slate-400">
                <span>{t("colOrder")}</span>
                <span>{t("colDate")}</span>
                <span>{t("colStatus")}</span>
                <span className="text-right">{t("colTotal")}</span>
                <span />
              </div>

              {orders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.05, 0.4) }}
                  data-order-row={order.orderNumber}
                  className="group relative grid grid-cols-[1.5fr_1fr_1.4fr_0.9fr_auto] items-center gap-4 border-b border-slate-900/[.05] px-6 py-[18px] transition-colors last:border-b-0 hover:bg-slate-900/[.02] dark:border-hairline/60 dark:hover:bg-white/[.04]"
                >
                  {/* Stretched link rather than a row-shaped anchor.
                      The download control needs its own grid cell and its own
                      click; nesting an <a> in an <a> is invalid, and floating
                      it over the row put "Download invoice" on top of the
                      order total. So the row is a grid, this covers it for
                      navigation, and the button sits above it on z-10. */}
                  <Link
                    href={`/profile/orders/${order.id}`}
                    aria-label={order.orderNumber}
                    className="absolute inset-0 z-0"
                  />
                    <span className="pointer-events-none relative min-w-0">
                      <span className="block truncate text-[14px] font-semibold tracking-[-.02em] group-hover:text-blue-700 dark:group-hover:text-blue-400">
                        {order.orderNumber}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-ink-muted">
                        <span className="font-mono" title={order.id}>
                          #{shortId(order.id)}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{tCart("itemCountShort", { count: order.items.reduce((n, i) => n + i.quantity, 0) })}</span>
                      </span>
                    </span>

                    <span className="pointer-events-none relative text-[12.5px] text-slate-600 dark:text-ink-muted">
                      {format.dateTime(new Date(order.createdAt), { day: "numeric", month: "short", year: "numeric" })}
                    </span>

                    <span className="pointer-events-none relative flex flex-wrap items-center gap-1.5">
                      <span
                        data-order-status={order.status}
                        className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold tracking-[-.01em] ${STATUS_STYLES[order.status]}`}
                      >
                        {tStatus(STATUS_LABEL[order.status])}
                      </span>
                      <span
                        data-order-payment={order.paymentStatus}
                        className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold tracking-[-.01em] ${PAYMENT_STYLES[order.paymentStatus]}`}
                      >
                        {tPayment(PAYMENT_LABEL[order.paymentStatus])}
                      </span>
                    </span>

                    <span className="pointer-events-none relative text-right text-[14.5px] font-semibold tracking-[-.025em] tabular-nums">
                      {eur(order.totalAmount)}
                    </span>

                    <span className="relative z-10 justify-self-end">
                      {order.invoiceId ? (
                        <InvoiceDownloadButton invoiceId={order.invoiceId} variant="quiet" />
                      ) : (
                        <ChevronRight
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                          className="text-slate-300 transition-colors group-hover:text-blue-700 dark:text-ink-muted dark:group-hover:text-blue-400"
                        />
                      )}
                    </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
