"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Building2, Check, Copy, FileText, MapPin, Package, Receipt, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { formatKg } from "@/lib/pricing";
import { cartLineFromOrderItem, useCartStore } from "@/lib/store/cart";
import OrderStatusBadge, { PaymentStatusBadge } from "./OrderStatusBadge";
import InvoiceDownloadButton from "./profile/InvoiceDownloadButton";
import TrackingTimeline from "./TrackingTimeline";
import BankTransferInstructions from "./BankTransferInstructions";
import OrderLifecycle from "./OrderLifecycle";
import type { BankTransferDetails } from "@/lib/bankTransfer";
import type { OrderBreakdown } from "@/lib/orderTotals";
import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import type { OrderTrackingView } from "@/lib/tracking";

/**
 * One order: what was bought, what it cost line by line, where it is going,
 * whether the money has moved, and the one action worth taking (buy again).
 *
 * Two compositions over ONE tree of cards, so nothing is rendered twice:
 *
 *   < lg   the compact stacked view, in the order a buyer on a phone needs
 *          it: summary card; tracking with the delivery address; payment
 *          instructions (while unpaid); items; money; compliance. The actions
 *          sit in a one-row bar fixed to the bottom of the screen.
 *   ≥ lg   a desktop workspace — a header toolbar carrying the actions, the
 *          order lifecycle across the top, then a 12-column grid: line items
 *          and payment instructions on the left (8), the money, delivery and
 *          compliance on the right (4).
 *
 * The two column wrappers are `display: contents` below lg, so on a phone
 * their cards become siblings and `max-lg:order-*` interleaves them into the
 * stacked reading order.
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
  /** GWP as recorded at purchase; null for equipment and pre-snapshot rows. */
  gwpAtPurchase: number | null;
  /** This line's recorded footprint in kg CO₂e (weight × quantity × GWP). */
  co2eKg: number;
  /** Whether a safety data sheet is held for this product's refrigerant. */
  sdsAvailable: boolean;
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
  paidAt: string | null;
  createdAt: string;
  estimatedDelivery: string;
  totalAmount: number;
  trackingNumber: string | null;
  /** Invoice id once issued; null means there is nothing to download yet. */
  invoiceId: string | null;
  tracking: OrderTrackingView;
  /** Goods, deposit, freight, VAT and total — the same figures the invoice prints. */
  breakdown: OrderBreakdown;
  /** The F-Gas certificate that authorised this sale, frozen at checkout. */
  certificate: { number: string; expiresAt: string | null } | null;
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

const CARD =
  "overflow-hidden rounded-[20px] border border-slate-900/[.07] bg-white/60 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]";

/** A titled card. */
function Group({
  title,
  icon: Icon,
  children,
  className = "",
  ...rest
}: {
  title: string;
  icon: typeof MapPin;
  children: ReactNode;
  className?: string;
} & { [data: `data-${string}`]: string | boolean | undefined }) {
  return (
    <section className={className} {...rest}>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-slate-400">
        <Icon size={13} strokeWidth={2.2} />
        {title}
      </h2>
      <div className={CARD}>{children}</div>
    </section>
  );
}

/** One money row of the financial summary. */
function MoneyRow({ label, note, value, name, amount }: { label: string; note?: string; value: string; name: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]" data-breakdown={name} data-amount={amount.toFixed(2)}>
      <span className="min-w-0 text-slate-600 dark:text-slate-300">
        {label}
        {note && <span className="mt-0.5 block text-[11px] leading-[1.4] text-slate-400 dark:text-slate-500">{note}</span>}
      </span>
      <span className="flex-none font-semibold tracking-[-.015em] tabular-nums">{value}</span>
    </div>
  );
}

const ITEM_COLUMNS = "lg:grid lg:grid-cols-[56px_minmax(0,1fr)_56px_112px_100px_96px] lg:items-center lg:gap-4";

export default function OrderDetailView({ order, bank }: OrderDetailViewProps) {
  const t = useTranslations("OrderDetail");
  const tCheckout = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [reordered, setReordered] = useState(false);
  const [copied, setCopied] = useState(false);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric" });
  const tonnes = (kg: number) => format.number(kg / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { breakdown } = order;
  const available = order.items.filter((item) => item.purchasable);
  const skipped = order.items.length - available.length;
  const awaitingPayment = order.paymentStatus === "PENDING";
  // Bank transfer is the checkout default (lib/payment); only card is named.
  const bankTransfer = order.paymentMethod !== "card";
  const addressLines = (order.shippingAddress ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  // F-Gas lines are the ones with a recorded GWP. The compliance card shows
  // when the order has any, or when a certificate was frozen on it.
  const fgasLines = order.items.filter((item) => item.gwpAtPurchase !== null);
  const orderCo2eKg = fgasLines.reduce((n, item) => n + item.co2eKg, 0);
  const showCompliance = fgasLines.length > 0 || order.certificate !== null;

  // One line per field, exactly as the carrier was given it; line one is the
  // recipient. Shown in the tracking card on mobile, its own card on desktop.
  const addressBlock =
    addressLines.length > 0 ? (
      <address className="text-[13px] leading-[1.6] not-italic text-slate-600 dark:text-slate-300">
        {addressLines.map((line, i) => (
          <div key={line + i} className={i === 0 ? "text-[14px] font-semibold tracking-[-.02em] text-slate-900 dark:text-slate-100" : ""}>
            {line}
          </div>
        ))}
      </address>
    ) : (
      <div className="text-[13px] text-slate-400 dark:text-slate-500">—</div>
    );

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

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the number is on screen and selectable anyway.
    }
  };

  const sdsLink = (item: OrderDetailItem, compact: boolean) =>
    item.sdsAvailable ? (
      // A plain <a>: /api is not locale-prefixed, and a download must not be
      // intercepted by the client router (same as the PDP's document rows).
      <a
        href={`/api/documents/sds/${encodeURIComponent(item.sku)}`}
        data-item-sds
        className={
          compact
            ? "inline-flex items-center gap-1 rounded-full border border-slate-900/[.1] px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 dark:border-white/[.12] dark:text-blue-400"
            : "inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-slate-900/[.1] px-2.5 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-700/[.06] dark:border-white/[.12] dark:text-blue-400 dark:hover:bg-blue-400/[.1]"
        }
      >
        <FileText size={compact ? 11 : 13} strokeWidth={2.2} />
        {t("sdsPdf")}
      </a>
    ) : compact ? null : (
      <span className="text-[12px] text-slate-400 dark:text-slate-500">{t("sdsOnRequest")}</span>
    );

  const orderAgainButton = (className: string) => (
    <motion.button type="button" onClick={orderAgain} whileTap={{ scale: 0.985 }} data-order-again className={className}>
      {reordered ? <Check size={17} strokeWidth={2.4} /> : <RotateCcw size={16} strokeWidth={2.2} />}
      {reordered ? t("orderAgainDone") : t("orderAgain")}
    </motion.button>
  );

  return (
    <div className="flex-1 bg-slate-50 dark:bg-canvas">
      {/* ── Mobile header: back + which order ──────────────────────────── */}
      {/* Sticky on mobile only: the app header is also `sticky top-0`, and two
          pinned bars on desktop overlapped as soon as the page scrolled. */}
      <header className="relative z-40 border-b border-slate-900/[.07] bg-white/80 backdrop-blur-xl backdrop-saturate-150 max-md:sticky max-md:top-0 lg:hidden print:hidden dark:border-hairline dark:bg-glass">
        <div className="mx-auto flex h-14 max-w-[880px] items-center gap-1 px-2 md:h-16 md:px-4">
          {/* An explicit destination, not router.back(): a buyer who opened
              this order from a Telegram link, an email, or a refresh has no
              history to go back to. 44px target, the iOS minimum. */}
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

      {/* Bottom padding clears the fixed mobile action bar plus the home indicator. */}
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 pb-[calc(96px+env(safe-area-inset-bottom))] md:gap-7 md:px-8 md:py-10 md:pb-[calc(104px+env(safe-area-inset-bottom))] lg:max-w-7xl lg:gap-6 lg:px-8 lg:pb-16">
        {/* Print-only masthead: a printed copy with no order number on it is
            not a copy of anything. */}
        <div className="hidden print:mb-2 print:block">
          <div className="text-[15px] font-semibold">{t("orderTitle", { number: order.orderNumber })}</div>
          <div className="mt-0.5 text-[11px]">
            {t("placedOn")}: {day(order.createdAt)}
          </div>
        </div>

        {/* ── Desktop header toolbar ─────────────────────────────────────── */}
        <div className="hidden lg:block print:hidden" data-order-toolbar>
          <Link
            href={{ pathname: "/profile", query: { tab: "orders" } }}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            {t("backToOrders")}
          </Link>
          <div className="mt-4 flex items-end justify-between gap-8">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="m-0 truncate text-[28px] font-semibold tracking-[-.035em] tabular-nums">
                  {t("orderTitle", { number: order.orderNumber })}
                </h1>
                <button
                  type="button"
                  onClick={copyNumber}
                  aria-label={copied ? t("copied") : t("copyNumber")}
                  title={copied ? t("copied") : t("copyNumber")}
                  data-copy-order-number
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-slate-400 transition-colors hover:bg-slate-900/[.06] hover:text-slate-700 dark:hover:bg-white/[.08] dark:hover:text-slate-200"
                >
                  {copied ? <Check size={15} strokeWidth={2.4} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={15} strokeWidth={2} />}
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <OrderStatusBadge status={order.status} size="sm" />
                <PaymentStatusBadge status={order.paymentStatus} size="sm" />
                <span className="ml-1 text-[13px] text-slate-500 dark:text-slate-400">
                  {t("placedAt", { date: format.dateTime(new Date(order.createdAt), { dateStyle: "long", timeStyle: "short" }) })}
                </span>
              </div>
            </div>
            <div className="flex flex-none items-center gap-2.5">
              <InvoiceDownloadButton invoiceId={order.invoiceId} variant="toolbar" />
              {orderAgainButton(
                "inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[13.5px] font-medium tracking-[-.015em] text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,.9)] transition-colors hover:bg-blue-700"
              )}
            </div>
          </div>
        </div>

        <div className="hidden lg:block print:hidden">
          <OrderLifecycle
            status={order.status}
            paymentStatus={order.paymentStatus}
            bankTransfer={bankTransfer}
            createdAt={order.createdAt}
            paidAt={order.paidAt}
            estimatedDelivery={order.estimatedDelivery}
            trackingNumber={order.trackingNumber}
            tracking={order.tracking}
          />
        </div>

        {/* ── Mobile summary card ────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          data-order-summary
          className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/50 p-5 shadow-[0_24px_60px_-32px_rgba(15,23,42,.35)] backdrop-blur-xl backdrop-saturate-150 md:p-7 lg:hidden dark:border-white/[.08] dark:bg-white/[.05] dark:shadow-[0_24px_60px_-32px_rgba(0,0,0,.7)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,var(--orb-blue),transparent_70%)] opacity-[.18] blur-[60px] print:hidden dark:opacity-[.26]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
            <div className="mt-4 text-[38px] font-semibold leading-[1.05] tracking-[-.045em] tabular-nums md:text-[44px]">
              {eur(order.totalAmount)}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-900/[.07] pt-4 dark:border-white/[.08]">
              <div>
                <dt className="text-[10.5px] font-medium tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">{t("placedOn")}</dt>
                <dd className="mt-1 text-[13.5px] font-semibold tracking-[-.015em]">{day(order.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-medium tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">{tCheckout("etaLabel")}</dt>
                <dd className="mt-1 text-[13.5px] font-semibold tracking-[-.015em]">{day(order.estimatedDelivery)}</dd>
              </div>
            </dl>
          </div>
        </motion.section>

        {/* ── Content grid ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 md:gap-7 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
          {/* Left (8): line items, payment instructions, live tracking */}
          <div className="max-lg:contents lg:col-span-8 lg:flex lg:flex-col lg:gap-6">
            <Group title={t("itemsInOrder")} icon={Package} className="max-lg:order-3">
              <div
                className={`hidden border-b border-slate-900/[.06] px-6 py-2.5 text-[10.5px] font-semibold tracking-[.07em] text-slate-400 uppercase dark:border-white/[.06] dark:text-slate-500 ${ITEM_COLUMNS}`}
                aria-hidden
              >
                <span />
                <span>{t("colProduct")}</span>
                <span className="text-center">{t("colQty")}</span>
                <span>{t("colFootprint")}</span>
                <span>{t("colSafetyData")}</span>
                <span className="text-right">{t("colSubtotal")}</span>
              </div>
              <ul className="m-0 list-none p-0">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    data-order-item
                    className={`flex items-center gap-3.5 border-b border-slate-900/[.06] px-4 py-3.5 last:border-b-0 md:gap-4 md:px-5 md:py-4 lg:px-6 dark:border-white/[.06] ${ITEM_COLUMNS}`}
                  >
                    <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-[14px] border border-slate-900/[.06] bg-slate-100 dark:border-white/[.06] dark:bg-white/[.05]">
                      {item.imageSrc ? (
                        // next/image: the source renders are 768×768 and this
                        // box is 56 CSS px — the optimizer serves a thumbnail.
                        <Image src={item.imageSrc} alt="" width={56} height={56} sizes="56px" className="h-full w-full object-contain p-1.5" />
                      ) : (
                        <Package size={20} strokeWidth={1.8} className="text-slate-400 dark:text-slate-500" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold tracking-[-.02em]">{item.name}</div>
                      <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
                        {item.variant}
                        <span className="lg:hidden"> · × {item.quantity}</span>
                      </div>
                      {item.pricePerKgAtPurchase > 0 && item.weightKgAtPurchase !== 1 && (
                        <div data-line-breakdown className="mt-0.5 truncate text-[11px] lg:whitespace-normal leading-[1.5] text-slate-400 dark:text-slate-500">
                          {tCart("lineBreakdown", {
                            perKg: eur(item.pricePerKgAtPurchase),
                            weight: formatKg(item.weightKgAtPurchase),
                            cylinder: eur(item.priceAtPurchase),
                          })}
                        </div>
                      )}
                      {/* Below lg the footprint and SDS ride as chips under the name. */}
                      {(item.gwpAtPurchase !== null || item.sdsAvailable) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                          {item.gwpAtPurchase !== null && (
                            <span className="rounded-full bg-slate-900/[.05] px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 tabular-nums dark:bg-white/[.07] dark:text-slate-300">
                              {t("co2eTonnes", { value: tonnes(item.co2eKg) })}
                            </span>
                          )}
                          {sdsLink(item, true)}
                        </div>
                      )}
                    </div>

                    <span className="hidden text-center lg:block">
                      <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-slate-900/[.05] px-2.5 py-1 text-[12px] font-semibold tabular-nums dark:bg-white/[.07]" data-item-qty>
                        × {item.quantity}
                      </span>
                    </span>

                    <span className="hidden min-w-0 lg:block" data-item-footprint>
                      {item.gwpAtPurchase !== null ? (
                        <>
                          <span className="block text-[13px] font-semibold tracking-[-.015em] tabular-nums">{t("co2eTonnes", { value: tonnes(item.co2eKg) })}</span>
                          <span className="block text-[11px] text-slate-400 tabular-nums dark:text-slate-500">{t("gwpValue", { gwp: format.number(item.gwpAtPurchase) })}</span>
                        </>
                      ) : (
                        <span className="text-[12px] text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </span>

                    <span className="hidden lg:block">{sdsLink(item, false)}</span>

                    <span className="flex-none text-right text-[14px] font-semibold tracking-[-.02em] tabular-nums">{eur(item.priceAtPurchase * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              {breakdown.deposit > 0 && (
                <div
                  className="flex items-baseline justify-between gap-4 border-t border-slate-900/[.06] px-4 py-3.5 text-[13px] md:px-5 lg:px-6 dark:border-white/[.06]"
                  data-summary-deposit
                >
                  <span className="min-w-0 text-slate-600 dark:text-slate-300">
                    {tCart("cylinderDeposit")}
                    <span className="mt-0.5 block text-[11px] leading-[1.4] text-slate-400 dark:text-slate-500">
                      {tCart("cylinderDepositDetail", { count: breakdown.depositUnits })}
                    </span>
                  </span>
                  <span className="flex-none font-semibold tracking-[-.015em] tabular-nums">{eur(breakdown.deposit)}</span>
                </div>
              )}
            </Group>

            {/* Everything needed to make the transfer — beneficiary, IBAN, BIC
                and the order number as the reference, each with a copy button —
                for as long as the transfer is outstanding. On mobile it comes
                straight after tracking, with the beneficiary block folded. */}
            {awaitingPayment && (
              <BankTransferInstructions details={bank} reference={order.orderNumber} amount={eur(order.totalAmount)} collapsible className="max-lg:order-2" />
            )}

            {/* Mobile: first thing under the summary — where the order is and
                where it is going, in one card. Desktop: the lifecycle bar covers
                progress, so this stays only for its live DHL scan log, and the
                address lives in the right column instead. */}
            <div className={`max-lg:order-1 print:hidden ${order.tracking.live ? "" : "lg:hidden"}`} data-tracking-card>
              <TrackingTimeline tracking={order.tracking} trackingNumber={order.trackingNumber}>
                <div className="mt-5 border-t border-slate-900/[.07] pt-4 lg:hidden dark:border-white/[.07]" data-mobile-delivery>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-slate-400">
                    <MapPin size={12} strokeWidth={2.2} />
                    {t("deliveryTitle")}
                  </div>
                  {addressBlock}
                </div>
              </TrackingTimeline>
            </div>
          </div>

          {/* Right (4): money, delivery, compliance */}
          <div className="max-lg:contents lg:col-span-4 lg:flex lg:flex-col lg:gap-6">
            <Group title={t("summaryTitle")} icon={Receipt} className="max-lg:order-4" data-order-totals>
              <div className="flex flex-col gap-3 px-4 py-4 md:px-5 lg:px-5">
                <MoneyRow name="subtotal" amount={breakdown.subtotal} label={t("itemsSubtotal")} value={eur(breakdown.subtotal)} />
                {breakdown.deposit > 0 && (
                  <MoneyRow name="deposit" amount={breakdown.deposit} label={t("depositRefundable")} note={t("depositNote")} value={eur(breakdown.deposit)} />
                )}
                <MoneyRow
                  name="shipping"
                  amount={breakdown.shipping}
                  label={t("shippingAdr")}
                  value={breakdown.shipping > 0 ? eur(breakdown.shipping) : t("shippingFree")}
                />
                <MoneyRow
                  name="vat"
                  amount={breakdown.vat}
                  label={t("vatLine", { rate: breakdown.vatRatePercent })}
                  note={t("vatNote")}
                  value={eur(breakdown.vat)}
                />
                <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-slate-900/[.08] pt-3.5 dark:border-white/[.08]" data-breakdown="total" data-amount={breakdown.total.toFixed(2)}>
                  <span className="text-[14px] font-semibold">{t("grandTotal")}</span>
                  <span className="text-[24px] font-semibold tracking-[-.035em] tabular-nums">{eur(breakdown.total)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-900/[.06] px-4 py-3 md:px-5 dark:border-white/[.06]">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                  <Building2 size={14} strokeWidth={2} className="flex-none text-slate-400" />
                  {bankTransfer ? tCheckout("bankTransferLabel") : t("paymentCard")}
                </span>
                <PaymentStatusBadge status={order.paymentStatus} size="sm" />
              </div>
            </Group>

            {/* Desktop and print only: on a phone the address sits inside the
                tracking card at the top, and that card is screen-only. */}
            <Group title={t("deliveryTitle")} icon={MapPin} className="max-lg:hidden print:block!">
              <div className="px-4 py-4 md:px-5">{addressBlock}</div>
            </Group>

            {showCompliance && (
              <Group title={t("complianceTitle")} icon={ShieldCheck} className="max-lg:order-5" data-order-compliance>
                <div className="flex flex-col gap-4 px-4 py-4 md:px-5">
                  <div>
                    <div className="text-[10.5px] font-medium tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">{t("authorizingCertificate")}</div>
                    {order.certificate ? (
                      <>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-mono text-[13.5px] font-semibold tracking-tight" data-certificate-number>
                            {order.certificate.number}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20 dark:text-emerald-400">
                            <Check size={10} strokeWidth={3} />
                            {t("certificateVerified")}
                          </span>
                        </div>
                        {order.certificate.expiresAt && (
                          <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                            {t("certificateValidTo", { date: day(order.certificate.expiresAt) })}
                          </div>
                        )}
                      </>
                    ) : (
                      // Orders placed before the snapshot existed: say so
                      // rather than show the buyer's current certificate.
                      <div className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">{t("certificateNotRecorded")}</div>
                    )}
                  </div>
                  {fgasLines.length > 0 && (
                    <div className="border-t border-slate-900/[.06] pt-3.5 dark:border-white/[.06]">
                      <div className="text-[10.5px] font-medium tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">{t("orderFootprint")}</div>
                      <div className="mt-1 text-[20px] font-semibold tracking-[-.03em] tabular-nums" data-order-co2e={(orderCo2eKg / 1000).toFixed(3)}>
                        {t("co2eTonnes", { value: tonnes(orderCo2eKg) })}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">{t("footprintNote")}</div>
                    </div>
                  )}
                </div>
              </Group>
            )}
          </div>
        </div>

        {/* Print-only provenance: the screen already says all of this; a
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

      {/* ── Mobile action bar (below lg; the desktop toolbar carries these) ── */}
      {/* One row, ~72px with the home indicator: the invoice is a square icon
          button on phones (labelled for screen readers, and in full from sm
          up, where every locale's wording fits), Order again takes the rest. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-900/[.08] bg-white/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden print:hidden dark:border-hairline dark:bg-glass" data-mobile-actions>
        <div className="mx-auto flex max-w-[880px] items-center gap-2.5 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] md:px-8">
          <InvoiceDownloadButton invoiceId={order.invoiceId} variant="bar" />
          {orderAgainButton(
            "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] bg-blue-600 text-[15px] font-medium tracking-[-.02em] text-white shadow-[0_12px_28px_-14px_rgba(37,99,235,.9)] transition-colors hover:bg-blue-700"
          )}
        </div>
      </div>
    </div>
  );
}
