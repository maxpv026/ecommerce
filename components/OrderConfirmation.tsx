"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, MapPin, Truck } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import TrackingTimeline from "./TrackingTimeline";
import type { OrderStatus } from "@/lib/generated/prisma/enums";
import type { OrderTrackingView } from "@/lib/tracking";

export interface OrderConfirmationData {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  estimatedDelivery: string;
  totalAmount: number;
  trackingNumber: string | null;
  tracking: OrderTrackingView;
  address: { title: string; recipientName: string; fullAddress: string } | null;
  items: Array<{
    id: string;
    name: string;
    variant: string;
    quantity: number;
    priceAtPurchase: number;
  }>;
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING:
    "bg-amber-50 text-amber-700 border-amber-600/20 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/25",
  IN_TRANSIT:
    "bg-blue-50 text-blue-700 border-blue-700/20 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/25",
  DELIVERED:
    "bg-slate-100 text-slate-600 border-slate-900/10 dark:bg-white/5 dark:text-slate-400 dark:border-white/10",
};

const STATUS_LABEL_KEYS: Record<OrderStatus, string> = {
  PENDING: "statusPending",
  IN_TRANSIT: "statusInTransit",
  DELIVERED: "statusDelivered",
};

interface OrderConfirmationProps {
  order: OrderConfirmationData;
}

export default function OrderConfirmation({ order }: OrderConfirmationProps) {
  const t = useTranslations("Checkout");
  const tProfile = useTranslations("AccountProfile");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const eta = format.dateTime(new Date(order.estimatedDelivery), {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <section className="relative mx-auto max-w-[760px] px-6 pb-[110px] pt-14 md:px-8">
        {/* Ambient mesh glow behind the confirmation card */}
        <div className="pointer-events-none absolute -left-[10%] top-[2%] aspect-square w-[68%] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.24] blur-[110px] [animation:hc-float_24s_ease-in-out_infinite] dark:opacity-[.36]" />
        <div className="pointer-events-none absolute -right-[12%] bottom-[6%] aspect-square w-[62%] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.22] blur-[110px] [animation:hc-float_30s_ease-in-out_infinite_reverse] dark:opacity-[.32]" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative rounded-[26px] border border-white/75 bg-white/68 p-8 shadow-[0_30px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-md backdrop-saturate-150 md:p-10 dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_30px_70px_-28px_rgba(0,0,0,0.65)]"
        >
          <div className="flex flex-col items-center text-center">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
              className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400"
            >
              <Check size={30} strokeWidth={2.6} />
            </motion.span>
            <h1 className="m-0 mt-5 text-[30px] font-semibold tracking-[-.04em]">{t("successTitle")}</h1>
            <p className="mt-2.5 max-w-[420px] text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
              {t("successBody")}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full border border-slate-900/[.12] bg-white/80 px-4 py-2 font-mono text-[12.5px] font-semibold tracking-[.02em] dark:border-white/[.14] dark:bg-white/5">
                #{order.orderNumber}
              </span>
              <span
                className={`rounded-full border px-3.5 py-2 text-[12px] font-semibold tracking-[-.01em] ${STATUS_STYLES[order.status]}`}
              >
                {tProfile(STATUS_LABEL_KEYS[order.status])}
              </span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[18px] border border-slate-900/[.08] bg-white/60 p-4.5 dark:border-white/[.08] dark:bg-white/[.03]">
              <div className="flex items-center gap-2 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
                <Truck size={13} strokeWidth={2} />
                {t("etaLabel")}
              </div>
              <div className="mt-2 text-[14.5px] font-semibold tracking-[-.015em]">{eta}</div>
            </div>
            <div className="rounded-[18px] border border-slate-900/[.08] bg-white/60 p-4.5 dark:border-white/[.08] dark:bg-white/[.03]">
              <div className="flex items-center gap-2 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
                <MapPin size={13} strokeWidth={2} />
                {t("shipTo")}
              </div>
              {order.address ? (
                <div className="mt-2">
                  <div className="text-[14.5px] font-semibold tracking-[-.015em]">{order.address.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                    {order.address.recipientName} · {order.address.fullAddress}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[13px] text-slate-400 dark:text-slate-500">—</div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <TrackingTimeline tracking={order.tracking} trackingNumber={order.trackingNumber} />
          </div>

          <div className="mt-7">
            <div className="mb-1 text-[13px] font-semibold tracking-[-.01em] text-slate-500 dark:text-slate-400">
              {t("itemsTitle")}
            </div>
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 border-b border-slate-900/[.07] py-3 last:border-b-0 dark:border-white/[.07]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold tracking-[-.015em]">{item.name}</div>
                  <div className="mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">{item.variant}</div>
                </div>
                <span className="flex-none text-[12.5px] text-slate-500 dark:text-slate-400">× {item.quantity}</span>
                <span className="w-[88px] flex-none text-right text-[13px] font-semibold tracking-[-.015em]">
                  {eur(item.priceAtPurchase * item.quantity)}
                </span>
              </div>
            ))}

            <div className="mt-4 flex items-baseline justify-between border-t border-slate-900/10 pt-4 dark:border-white/10">
              <span className="text-sm font-semibold">{t("totalLabel")}</span>
              <span className="text-[24px] font-semibold tracking-[-.035em]">{eur(order.totalAmount)}</span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/profile"
              className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-blue-700 text-[13.5px] font-semibold tracking-[-.01em] text-white transition-colors hover:bg-blue-800"
            >
              {t("viewDashboard")}
            </Link>
            <Link
              href="/"
              className="flex h-12 flex-1 items-center justify-center rounded-[14px] border border-slate-900/[.14] bg-white/80 text-[13.5px] font-semibold tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
            >
              {t("continueShopping")}
            </Link>
          </div>
        </motion.div>
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
