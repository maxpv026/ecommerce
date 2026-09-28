"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Building2, Download, MapPin, Package, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { formatKg } from "@/lib/pricing";
import { cartLineFromOrderItem, useCartStore } from "@/lib/store/cart";
import OrderStatusBadge, { PaymentStatusBadge } from "./OrderStatusBadge";
import InvoiceDownloadButton from "./profile/InvoiceDownloadButton";
import TrackingTimeline from "./TrackingTimeline";
import BankTransferInstructions from "./BankTransferInstructions";
import type { BankTransferDetails } from "@/lib/bankTransfer";
import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import type { OrderTrackingView } from "@/lib/tracking";

/**
 * One order, built mobile-first.
 *
 * The screen it replaced was the post-checkout confirmation reused verbatim
 * for history — a "✓ Order confirmed" hero and a "Continue shopping" button,
 * which is the wrong thing to say to someone opening a six-week-old order.
 * This is a detail view: what you bought, where it is going, whether the
 * money has moved, and the one action worth taking (buy it again).
 *
 * Layout: a single column that stays a single column. `md:` only widens the
 * measure and puts delivery/payment side by side — it never re-flows into a
 * different design, so the mobile composition is the one being maintained.
 */

export interface OrderDetailItem {
  id: string;
  /** Live catalog SKU, needed to put the line back in the cart. */
  sku: string;
  name: string;
  variant: string;
  quantity: number;
  /** Gas price of one cylinder at purchase time. */
  priceAtPurchase: number;
  /** Per-kg rate / net kg behind it; 0 on lines placed before weight-based pricing. */
  pricePerKgAtPurchase: number;
  weightKgAtPurchase: number;
  /** Per-cylinder deposit charged on this line (0 for equipment). */
  depositAtPurchase: number;
  /**
   * Thumbnail path, resolved on the server from the live Product row
   * (lib/productMedia). Null when the product has no render — equipment,
   * or a refrigerant we have no artwork for.
   */
  imageSrc: string | null;
  /**
   * Whether this product can be bought again right now, re-read from the
   * catalog. A discontinued or out-of-stock line is still shown — it is part
   * of the order's history — but reordering quietly skips it.
   */
  purchasable: boolean;
}

export interface OrderDetailData {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  createdAt: string;
  estimatedDelivery: string;
  totalAmount: number;
  trackingNumber: string | null;
  /** Invoice id once issued; null means there is nothing to download yet. */
  invoiceId: string | null;
  tracking: OrderTrackingView;
  /**
   * The delivery address as it read at checkout, one line per field. Frozen
   * at order time, so editing or deleting the address book entry afterwards
   * cannot rewrite where these cylinders actually went.
   */
  shippingAddress: string | null;
  items: OrderDetailItem[];
}

interface OrderDetailViewProps {
  order: OrderDetailData;
  /** Where to wire the money, for as long as the transfer is outstanding. */
  bank: BankTransferDetails;
}

/** iOS-settings-style group: a titled block of glass. */
function Group({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon: typeof MapPin;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-slate-400">
        <Icon size={13} strokeWidth={2.2} />
        {title}
      </h2>
      <div className="overflow-hidden rounded-[20px] border border-slate-900/[.07] bg-white/60 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]">
        {children}
      </div>
    </section>
  );
}

export default function OrderDetailView({ order, bank }: OrderDetailViewProps) {
  const t = useTranslations("OrderDetail");
  const tCheckout = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [reordered, setReordered] = useState(false);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric" });

  // Deposit rides inside totalAmount but is shown on its own: it comes back
  // when the cylinders are returned, and a buyer checking an invoice against
  // a bank statement needs to see why the two differ.
  const deposit = order.items.reduce((n, i) => n + i.depositAtPurchase * i.quantity, 0);
  const depositUnits = order.items.reduce((n, i) => n + (i.depositAtPurchase > 0 ? i.quantity : 0), 0);

  const available = order.items.filter((item) => item.purchasable);
  const skipped = order.items.length - available.length;
  const awaitingPayment = order.paymentStatus === "PENDING";
  const addressLines = (order.shippingAddress ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  const orderAgain = () => {
    // Nothing here is trusted as a price: cartLineFromOrderItem carries the
    // snapshot for display, and the cart re-reads the live catalog before
    // anything is charged. Unavailable lines are dropped rather than added
    // and rejected later at checkout.
    if (available.length === 0) {
      toast.error(t("allUnavailable"));
      return;
    }
    for (const item of available) {
      addItem(
        cartLineFromOrderItem({
          sku: item.sku,
          productName: item.name,
          variant: item.variant,
          priceAtPurchase: item.priceAtPurchase,
          pricePerKgAtPurchase: item.pricePerKgAtPurchase,
          weightKgAtPurchase: item.weightKgAtPurchase,
          depositAtPurchase: item.depositAtPurchase,
        }),
        item.quantity
      );
    }
    setReordered(true);
    if (skipped > 0) toast.warning(t("unavailableNote", { count: skipped }));
    else toast.success(t("orderAgainDone"));
    router.push("/cart");
  };

  return (
    <div className="flex-1 bg-slate-50 dark:bg-canvas">
      {/* ── Sticky header: back + which order ─────────────────────────── */}
      {/* Sticky on mobile only. The app header is also `sticky top-0` (z-50),
          so leaving this pinned on desktop put two bars in the same place and
          they overlapped as soon as the page scrolled. On desktop it scrolls
          away and the app header owns the top of the window. */}
      <header className="relative z-40 border-b border-slate-900/[.07] bg-white/80 backdrop-blur-xl backdrop-saturate-150 max-md:sticky max-md:top-0 print:hidden dark:border-hairline dark:bg-glass">
        <div className="mx-auto flex h-14 max-w-[880px] items-center gap-1 px-2 md:h-16 md:px-4">
          {/* 44px target, the iOS minimum — the icon is 20px, the tap area is not. */}
          {/* An explicit destination, not router.back(): a buyer who opened
              this order from a Telegram link, an email, or a refresh has no
              history to go back to, and back() would strand them. */}
          <Link
            href={{ pathname: "/profile", query: { tab: "orders" } }}
            aria-label={t("back")}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-900/[.06] active:bg-slate-900/[.1] dark:text-slate-200 dark:hover:bg-white/[.08]"
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </Link>
          <h1 className="m-0 min-w-0 truncate text-[16px] font-semibold tracking-[-.03em] md:text-[17px]">
            {t("orderTitle", { number: order.orderNumber })}
          </h1>
        </div>
      </header>

      {/* Bottom padding clears the fixed footer plus the home indicator. */}
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 pb-[calc(128px+env(safe-area-inset-bottom))] md:gap-7 md:px-8 md:py-10 md:pb-[calc(140px+env(safe-area-inset-bottom))]">
        {/* Print-only masthead. The order number lives in the sticky header,
            which is screen chrome — a printed copy with no order number on it
            is not a copy of anything. */}
        <div className="hidden print:mb-2 print:block">
          <div className="text-[15px] font-semibold">{t("orderTitle", { number: order.orderNumber })}</div>
          <div className="mt-0.5 text-[11px]">
            {t("placedOn")}: {day(order.createdAt)}
          </div>
        </div>

        {/* ── 1. Summary ─────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          data-order-summary
          className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/50 p-5 shadow-[0_24px_60px_-32px_rgba(15,23,42,.35)] backdrop-blur-xl backdrop-saturate-150 md:p-7 dark:border-white/[.08] dark:bg-white/[.05] dark:shadow-[0_24px_60px_-32px_rgba(0,0,0,.7)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,#2563eb,transparent_70%)] opacity-[.18] blur-[60px] print:hidden dark:opacity-[.26]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>

            {/* The number is the headline: tabular figures so it doesn't
                shimmer between locales, tight tracking for the display face. */}
            <div className="mt-4 text-[38px] font-semibold leading-[1.05] tracking-[-.045em] tabular-nums md:text-[44px]">
              {eur(order.totalAmount)}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-900/[.07] pt-4 dark:border-white/[.08]">
              <div>
                <dt className="text-[10.5px] font-medium tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">
                  {t("placedOn")}
                </dt>
                <dd className="mt-1 text-[13.5px] font-semibold tracking-[-.015em]">{day(order.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-medium tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">
                  {tCheckout("etaLabel")}
                </dt>
                <dd className="mt-1 text-[13.5px] font-semibold tracking-[-.015em]">{day(order.estimatedDelivery)}</dd>
              </div>
            </dl>
          </div>
        </motion.section>

        {/* ── 2. Items ───────────────────────────────────────────────── */}
        <Group title={t("itemsInOrder")} icon={Package}>
          <ul className="m-0 list-none p-0">
            {order.items.map((item) => (
                <li
                  key={item.id}
                  data-order-item
                  className="flex items-center gap-3.5 border-b border-slate-900/[.06] px-4 py-3.5 last:border-b-0 md:gap-4 md:px-5 md:py-4 dark:border-white/[.06]"
                >
                  <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-[14px] border border-slate-900/[.06] bg-slate-100 dark:border-white/[.06] dark:bg-white/[.05]">
                    {item.imageSrc ? (

                      // next/image, not a plain <img>: the source renders are
                      // 768x768 (~50 KB each) and this box is 56 CSS px, so a
                      // plain tag downloads roughly 16x the pixels it paints.
                      // The optimizer serves a thumbnail-sized variant instead
                      // — a few KB — which on an order with several lines is
                      // most of the page's image weight.
                      <Image
                        src={item.imageSrc}
                        alt=""
                        width={56}
                        height={56}
                        sizes="56px"
                        className="h-full w-full object-contain p-1.5"
                      />
                    ) : (
                      <Package size={20} strokeWidth={1.8} className="text-slate-400 dark:text-slate-500" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold tracking-[-.02em]">{item.name}</div>
                    <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
                      {item.variant} · × {item.quantity}
                    </div>
                    {item.pricePerKgAtPurchase > 0 && item.weightKgAtPurchase !== 1 && (
                      <div
                        data-line-breakdown
                        className="mt-0.5 truncate text-[11px] leading-[1.5] text-slate-400 dark:text-slate-500"
                      >
                        {tCart("lineBreakdown", {
                          perKg: eur(item.pricePerKgAtPurchase),
                          weight: formatKg(item.weightKgAtPurchase),
                          cylinder: eur(item.priceAtPurchase),
                        })}
                      </div>
                    )}
                  </div>

                  <span className="flex-none text-right text-[14px] font-semibold tracking-[-.02em] tabular-nums">
                    {eur(item.priceAtPurchase * item.quantity)}
                  </span>
                </li>
            ))}
          </ul>

          <div className="border-t border-slate-900/[.06] px-4 py-3.5 md:px-5 dark:border-white/[.06]">
            {deposit > 0 && (
              <div className="flex items-baseline justify-between gap-4 text-[13px]" data-summary-deposit>
                <span className="min-w-0 text-slate-500 dark:text-slate-400">
                  {tCart("cylinderDeposit")}
                  <span className="mt-0.5 block text-[11px] leading-[1.4] text-slate-400 dark:text-slate-500">
                    {tCart("cylinderDepositDetail", { count: depositUnits })}
                  </span>
                </span>
                <span className="flex-none font-semibold tracking-[-.015em] tabular-nums">{eur(deposit)}</span>
              </div>
            )}
            <div
              className={`flex items-baseline justify-between gap-4 ${
                deposit > 0 ? "mt-3 border-t border-slate-900/[.06] pt-3 dark:border-white/[.06]" : ""
              }`}
            >
              <span className="text-[13.5px] font-semibold">{tCheckout("totalLabel")}</span>
              <span className="text-[19px] font-semibold tracking-[-.03em] tabular-nums">{eur(order.totalAmount)}</span>
            </div>
          </div>
        </Group>

        {/* ── 3. Delivery + payment ──────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-5">
          <Group title={t("deliveryTitle")} icon={MapPin}>
            <div className="px-4 py-4 md:px-5">
              {addressLines.length > 0 ? (
                /* One line per field, exactly as the carrier was given it.
                   Line one is the recipient — emphasised here rather than
                   printed a second time above, which read as a duplicate. */
                <address className="text-[13px] leading-[1.6] not-italic text-slate-600 dark:text-slate-300">
                  {addressLines.map((line, i) => (
                    <div key={line + i} className={i === 0 ? "text-[14px] font-semibold tracking-[-.02em] text-slate-900 dark:text-slate-100" : ""}>
                      {line}
                    </div>
                  ))}
                </address>
              ) : (
                <div className="text-[13px] text-slate-400 dark:text-slate-500">—</div>
              )}
            </div>
          </Group>

          <Group title={t("paymentTitle")} icon={Building2}>
            <div className="px-4 py-4 md:px-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold tracking-[-.02em]">{tCheckout("bankTransferLabel")}</span>
                <PaymentStatusBadge status={order.paymentStatus} size="sm" />
              </div>

              {/* No transfer instructions here on purpose. The block below
                  carries the reference, the IBAN and the BIC with copy
                  buttons; saying any of it twice is what made this screen
                  read as two order views stacked on top of each other. */}
            </div>
          </Group>
        </div>

        {/* The account details, in one place. The payment group above names
            the method and the reference; everything needed to actually make
            the transfer — IBAN, BIC, beneficiary, each with a copy button —
            is here and is deliberately NOT repeated up there. */}
        {awaitingPayment && (
          <BankTransferInstructions details={bank} reference={order.orderNumber} amount={eur(order.totalAmount)} />
        )}

        <div className="print:hidden">
          <TrackingTimeline tracking={order.tracking} trackingNumber={order.trackingNumber} />
        </div>

        {/* Print-only provenance. The screen already says all of this; a
            sheet of paper that leaves the building does not. */}
        <div className="hidden print:block print:mt-8 print:border-t print:border-black/20 print:pt-4 print:text-[11px] print:leading-[1.6]">
          <div className="font-semibold">{bank.beneficiary}</div>
          <div>{bank.beneficiaryAddress}</div>
          <div>
            {bank.registrationNumber} · {bank.contactEmail}
          </div>
          <div className="mt-2 italic">{t("printNote")}</div>
        </div>
      </div>

      {/* ── 5. Sticky action footer ────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-900/[.08] bg-white/80 backdrop-blur-xl backdrop-saturate-150 print:hidden dark:border-hairline dark:bg-glass">
        <div className="mx-auto flex max-w-[880px] flex-col gap-2.5 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:flex-row-reverse md:items-center md:px-8 md:pt-4 md:pb-[calc(16px+env(safe-area-inset-bottom))]">
          <motion.button
            type="button"
            onClick={orderAgain}
            whileTap={{ scale: 0.985 }}
            data-order-again
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-medium tracking-[-.02em] text-white shadow-[0_14px_34px_-14px_rgba(37,99,235,.9)] transition-colors hover:bg-blue-700 md:h-12 md:flex-1"
          >
            {reordered ? <Check size={18} strokeWidth={2.4} /> : <RotateCcw size={17} strokeWidth={2.2} />}
            {reordered ? t("orderAgainDone") : t("orderAgain")}
          </motion.button>

          {/* Was onClick={() => window.print()} under this same label: the
              browser print dialog is not the invoice, and the real generator
              already existed at /api/invoices/[id]/download. Renders only
              once an invoice has been issued. */}
          <InvoiceDownloadButton invoiceId={order.invoiceId} />
        </div>
      </div>
    </div>
  );
}
