"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Check, MapPin, Package, Truck } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import BankTransferInstructions from "./BankTransferInstructions";
import type { BankTransferDetails } from "@/lib/bankTransfer";

/**
 * The moment after an order is placed.
 *
 * Nothing was charged, so this page has one job beyond reassurance: put the
 * bank details and the payment reference in front of the buyer while they
 * still have the order in mind.
 */

export interface PlacedOrderSummary {
  id: string;
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  estimatedDelivery: string;
  shippingAddress: string | null;
  items: Array<{ id: string; name: string; variant: string; quantity: number }>;
}

interface CheckoutSuccessPageProps {
  order: PlacedOrderSummary;
  bank: BankTransferDetails;
}

export default function CheckoutSuccessPage({ order, bank }: CheckoutSuccessPageProps) {
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const eta = format.dateTime(new Date(order.estimatedDelivery), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex-1 bg-slate-50 text-slate-900 dark:bg-[#0a0a0c] dark:text-slate-100">
      <div className="hidden md:block">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />
      </div>

      <div className="relative overflow-x-clip">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[220px] right-[-8%] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.12] blur-[120px] [animation:hc-breathe_9s_ease-in-out_infinite] dark:opacity-[.22]" />
          <div className="absolute left-[-10%] top-[180px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-[.1] blur-[120px] [animation:hc-float_30s_ease-in-out_infinite] dark:opacity-20" />
        </div>

        <motion.main
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto block max-w-[1080px] px-4 pt-5 pb-10 md:px-8 md:pb-[120px] md:pt-14"
          data-checkout-success
        >
          {/* ── Confirmation ── */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] bg-[linear-gradient(140deg,#059669,#0891b2)] text-white shadow-[0_18px_38px_-16px_rgba(5,150,105,.9)] md:mx-0 md:mb-6 md:h-14 md:w-14 md:rounded-[20px]"
          >
            <Check size={22} strokeWidth={2.6} className="md:hidden" />
            <Check size={26} strokeWidth={2.6} className="hidden md:block" />
          </motion.div>

          <h1 className="m-0 text-center text-[22px] font-semibold leading-[1.15] tracking-[-.035em] text-slate-900 md:text-left md:text-[38px] md:leading-[1.05] md:tracking-[-.045em] dark:text-white">
            {t("successTitle")}
          </h1>
          <p className="mx-auto mt-1.5 max-w-[560px] text-center text-[12.5px] leading-[1.5] text-slate-600 md:mx-0 md:mt-3 md:text-left md:text-[14.5px] md:leading-[1.6] dark:text-slate-400">
            {t("successBodyBankTransfer")}
          </p>

          {/* One line on a phone: these two pills were wrapping to a second
              row and costing 82px above the payment details. They scroll
              sideways instead; from md they wrap as before. The negative
              inset lets a scrolled pill reach the screen edge rather than
              stopping short at the container padding. */}
          <div className="-mx-4 mt-3 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:mt-6 md:flex-wrap md:gap-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
            <span
              data-order-number
              className="inline-flex flex-none snap-start items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-3 pr-3.5 text-[11.5px] font-semibold tracking-[-.015em] text-slate-700 backdrop-blur-md md:max-w-full md:gap-2 md:py-2 md:pl-3.5 md:pr-4 md:text-[13px] dark:border-white/10 dark:bg-white/[.05] dark:text-slate-200"
            >
              <Package size={14} strokeWidth={2.2} className="flex-none text-cyan-600 dark:text-cyan-300" />
              <span className="whitespace-nowrap md:truncate">
                {t("orderNumberLabel")}: {order.orderNumber}
              </span>
            </span>
            <span
              data-eta-pill
              className="inline-flex flex-none snap-start items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-3 pr-3.5 text-[11.5px] font-medium tracking-[-.015em] text-slate-600 backdrop-blur-md md:max-w-full md:gap-2 md:py-2 md:pl-3.5 md:pr-4 md:text-[13px] dark:border-white/10 dark:bg-white/[.05] dark:text-slate-300"
            >
              <Truck size={14} strokeWidth={2.2} className="flex-none text-cyan-600 dark:text-cyan-300" />
              {/* The truck icon already says "delivery", so the phone gets
                  the date alone — "ESTIMATED DELIVERY" is 18 characters that
                  pushed this pill off the edge of a 375px screen. */}
              <span className="whitespace-nowrap md:hidden">{eta}</span>
              <span className="hidden whitespace-nowrap md:inline md:truncate">
                {t("etaLabel")} {eta}
              </span>
            </span>
          </div>

          {/* Payment instructions come first in source order, so the stack
              puts them directly under the header — which is the one thing
              this page exists to deliver. */}
          <div className="mt-4 grid grid-cols-1 items-start gap-4 md:mt-9 md:gap-5 lg:grid-cols-[1.05fr_.95fr]">
            {/* ── How to pay ── */}
            <BankTransferInstructions
              details={bank}
              reference={order.orderNumber}
              amount={eur(order.totalAmount)}
            />

            {/* ── What was ordered, and where it's going ── */}
            <section className="rounded-[26px] border border-slate-200 bg-white/80 p-5 shadow-sm sm:p-6 backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/80 dark:shadow-none">
              <h2 className="m-0 mb-4 text-[17px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
                {t("itemsTitle")}
              </h2>

              <div className="flex flex-col" data-success-items>
                {order.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-4 py-3 ${
                      index > 0 ? "border-t border-slate-200 dark:border-white/10" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold tracking-[-.015em]">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-slate-500 dark:text-slate-400">
                        {item.variant}
                      </span>
                    </span>
                    <span className="flex-none text-[13px] text-slate-500 dark:text-slate-400">× {item.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4 dark:border-white/10">
                <span className="text-[13px] font-semibold">{tCart("total")}</span>
                <span className="text-[22px] font-semibold tracking-[-.035em]" data-success-total>
                  {eur(order.totalAmount)}
                </span>
              </div>

              {order.shippingAddress && (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10" data-success-address>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] tracking-[.06em] text-slate-500 dark:text-slate-400">
                    <MapPin size={12} strokeWidth={2} />
                    {t("shipTo")}
                  </div>
                  <p className="m-0 whitespace-pre-line text-[13px] leading-[1.6] text-slate-700 dark:text-slate-300">
                    {order.shippingAddress}
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 md:mt-8 md:flex-row md:flex-wrap md:gap-3">
            <Link
              href={`/profile/orders/${order.id}`}
              data-view-order
              className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[14px] font-semibold tracking-[-.015em] text-white shadow-[0_14px_30px_-12px_#1d4ed8] transition-colors hover:bg-blue-800 md:h-12 md:w-auto md:text-[13.5px]"
            >
              {t("viewOrder")}
              <ArrowRight size={15} strokeWidth={2.2} />
            </Link>
            <Link
              href="/products"
              className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-slate-200 bg-white px-5 text-[13.5px] font-semibold tracking-[-.015em] text-slate-700 shadow-sm md:w-auto transition-colors hover:border-cyan-500/40 hover:text-cyan-700 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/35 dark:hover:text-cyan-300"
            >
              {t("continueShopping")}
            </Link>
          </div>
        </motion.main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
