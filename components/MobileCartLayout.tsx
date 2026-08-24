"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ChevronLeft, Minus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { MOBILE_CART_ITEMS, calculateMobileCartTotals } from "@/lib/mobileCart";
import { useCartCount } from "./CartCountProvider";

export default function MobileCartLayout() {
  const t = useTranslations("Cart");
  const format = useFormatter();
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const [items, setItems] = useState(MOBILE_CART_ITEMS);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const { setCartCount } = useCartCount();

  const bump = (id: number, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, qty: Math.max(1, Math.min(20, item.qty + delta)) } : item
      )
    );
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const applyPromo = () => {
    if (promo.trim()) setPromoApplied(true);
  };

  const { count, subtotal, discount, tax, total } = calculateMobileCartTotals(items, promoApplied);
  const countLine = count === 0 ? t("noItemsYet") : t("cylinderCountShort", { count });

  // Keep the persistent global nav badge in sync with this page's own cart contents.
  useEffect(() => {
    setCartCount(count);
  }, [count, setCartCount]);

  return (
    <div className="relative w-full min-h-screen bg-white dark:bg-slate-950">
      {/* Sticky header */}
      <div className="sticky top-0 z-[80] border-b border-slate-900/[.06] bg-white/85 px-5 pb-4 pt-6 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.06] dark:bg-slate-950/85">
        <div className="flex items-center gap-2">
          <Link
            href="/cylinders"
            aria-label={t("backAria")}
            className="-ml-2.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-900 transition-colors hover:bg-slate-900/[.06] dark:text-slate-50 dark:hover:bg-white/10"
          >
            <ChevronLeft size={21} strokeWidth={2} />
          </Link>
          <div className="flex-1">
            <div className="text-[17px] font-semibold tracking-[-.03em]">{t("yourCart")}</div>
            <div className="text-[11.5px] text-slate-400 dark:text-slate-500">{countLine}</div>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setItems([])}
              className="text-[12.5px] font-semibold text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50"
            >
              {t("clear")}
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content — the global <main> wrapper already clears the
          persistent bottom nav; this adds the extra clearance for the
          checkout panel that sits directly above it. */}
      <div className="px-5 pb-[calc(160px+env(safe-area-inset-bottom))] pt-5">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="mb-4.5 text-[13.5px] text-slate-400 dark:text-slate-500">{t("cartEmptyShort")}</p>
            <Link
              href="/cylinders"
              className="rounded-full bg-blue-700 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-800"
            >
              {t("browseCylinders")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-[18px] border border-slate-900/[.08] bg-white p-3 dark:border-white/[.08] dark:bg-slate-900"
              >
                <div className="relative h-[64px] w-[64px] flex-none overflow-hidden rounded-[13px] bg-slate-50 dark:bg-white/5">
                  <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.035)_0_1px,transparent_1px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.03)_0_1px,transparent_1px_9px)]" />
                  <div className="absolute left-1/2 top-1/2 h-[64%] w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-t-[52px] rounded-b-[10px] border border-dashed border-slate-900/20 bg-white/80 dark:border-white/20 dark:bg-white/10" />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold tracking-[-.02em]">{item.name}</div>
                      <div className="mt-[3px] truncate text-[11.5px] text-slate-400 dark:text-slate-500">
                        {item.variant}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={t("removeAria", { item: item.name })}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-full border border-slate-900/[.1] p-0.5 dark:border-white/[.12]">
                      <button
                        type="button"
                        onClick={() => bump(item.id, -1)}
                        aria-label={t("decreaseQtyAria", { item: item.name })}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-900/[.06] dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        <Minus size={13} strokeWidth={2.2} />
                      </button>
                      <span className="w-5 text-center text-[12.5px] font-semibold tabular-nums">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => bump(item.id, 1)}
                        aria-label={t("increaseQtyAria", { item: item.name })}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-900/[.06] dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        <Plus size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                    <span className="text-[13.5px] font-semibold tracking-[-.02em]">
                      {formatEur(item.unit * item.qty)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* Promo code */}
            <div className="mt-5 flex items-center gap-2">
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder={t("promoCodePlaceholder")}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-900/[.13] bg-white px-3.5 text-[13px] text-slate-900 focus:outline-none dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={applyPromo}
                className="h-11 flex-none rounded-xl border border-slate-900/[.14] px-4 text-[12.5px] font-semibold tracking-[-.01em] transition-colors hover:border-slate-900/[.36] dark:border-white/[.14] dark:text-slate-50 dark:hover:border-white/30"
              >
                {t("apply")}
              </button>
            </div>
            {promoApplied && (
              <p className="mt-2 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                {t("b2bDiscountApplied")}
              </p>
            )}

            {/* Order summary */}
            <div className="mt-5 rounded-[18px] border border-slate-900/[.08] bg-slate-50 p-4 dark:border-white/[.08] dark:bg-white/[.03]">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-slate-500 dark:text-slate-400">{t("subtotal")}</span>
                <span className="font-medium tabular-nums">{formatEur(subtotal)}</span>
              </div>
              {promoApplied && (
                <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-slate-500 dark:text-slate-400">{t("b2bDiscountLabel")}</span>
                  <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    −{formatEur(discount)}
                  </span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-slate-500 dark:text-slate-400">{t("shipping")}</span>
                <span className="font-medium text-slate-500 dark:text-slate-400">{t("calculatedAtNextStep")}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-slate-500 dark:text-slate-400">{t("vat21")}</span>
                <span className="font-medium tabular-nums">{formatEur(tax)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 text-[11.5px] leading-[1.5] text-slate-400 dark:text-slate-500">
              <ShieldCheck size={14} className="mt-[1px] flex-none" strokeWidth={2} />
              <span>{t("hazmatNote")}</span>
            </div>
          </>
        )}
      </div>

      {/* Bottom mesh glow — sits behind the checkout panel + nav */}
      {items.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-[320px] [mask-image:linear-gradient(to_top,#000_0%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,#000_0%,transparent_100%)]">
          <div className="absolute -bottom-[120px] left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.28] blur-[90px] [animation:hc-float_26s_ease-in-out_infinite] dark:opacity-[.4]" />
        </div>
      )}

      {/* Checkout panel — fixed directly above the bottom nav */}
      {items.length > 0 && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-0 z-[90] w-full border-t border-white/60 bg-white/75 px-5 py-3.5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/75">
          <button
            type="button"
            className="flex h-13 w-full items-center justify-between rounded-[15px] bg-blue-700 px-5 text-white shadow-[0_16px_34px_-14px_rgba(29,78,216,0.7)] transition-colors hover:bg-blue-800"
          >
            <span className="flex flex-col items-start">
              <span className="text-[10.5px] font-medium uppercase tracking-[.06em] text-blue-100">{t("total")}</span>
              <span className="text-[16px] font-semibold tracking-[-.02em] tabular-nums">{formatEur(total)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold tracking-[-.01em]">
              {t("checkout")}
              <ArrowRight size={16} strokeWidth={2.3} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
