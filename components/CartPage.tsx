"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { Shield, Trash2 } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import MobileCartLayout from "./MobileCartLayout";
import { FREE_FREIGHT_THRESHOLD, calculateCartTotals } from "@/lib/cart";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";

const ACCENT = "#1d4ed8";

export default function CartPage() {
  const t = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const { status } = useSession();
  const [query, setQuery] = useState("");
  const [promo, setPromo] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const items = useCartStore((s) => s.items);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeItem = useCartStore((s) => s.removeItem);

  // The cart is rehydrated from localStorage on the client — until then,
  // render the server's empty-cart markup to keep hydration clean.
  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const { count, subtotal, shipping, vat, total } = calculateCartTotals(shownItems);
  const countLine = count === 0 ? t("noItemsYet") : t("cylinderCount", { count });
  const freightNote =
    subtotal >= FREE_FREIGHT_THRESHOLD
      ? t("freightNoteFree")
      : t("freightNoteAdd", { amount: eur(FREE_FREIGHT_THRESHOLD - subtotal) });

  const goToCheckout = () => {
    if (status === "authenticated") {
      router.push("/checkout");
    } else {
      setIsAuthModalOpen(true);
    }
  };

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <div className="hidden md:block">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <section className="mx-auto max-w-[1240px] px-8 pb-[110px] pt-13">
        <div className="mb-9.5 flex items-end justify-between gap-6">
          <div>
            <h1 className="m-0 text-[38px] font-semibold tracking-[-.04em]">{t("yourCart")}</h1>
            <p className="mt-2 text-[13.5px] text-slate-500 dark:text-slate-400">{countLine}</p>
          </div>
          <Link href="/" className="text-[13px] text-slate-600 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400">
            {t("continueShopping")}
          </Link>
        </div>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.5fr_.85fr] lg:gap-14">
          <div>
            {shownItems.length > 0 ? (
              shownItems.map((item, idx) => (
                <div
                  key={item.sku}
                  className={`flex flex-col items-start gap-5 border-b border-slate-900/[.08] py-5.5 sm:flex-row sm:items-center sm:gap-5 dark:border-white/[.08] ${
                    idx === 0 ? "border-t dark:border-t-white/[.08]" : ""
                  }`}
                >
                  <div className="relative h-24 w-24 flex-none overflow-hidden rounded-[14px] bg-slate-100 dark:bg-white/5">
                    <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.04)_0_1px,transparent_1px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.035)_0_1px,transparent_1px_9px)]" />
                    <div className="absolute left-1/2 top-1/2 h-2/3 w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-t-[40px] rounded-b-[8px] border border-dashed border-slate-900/20 bg-white/75 dark:border-white/20 dark:bg-white/10" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold tracking-[-.02em]">{item.name}</div>
                    <div className="mt-1 text-[13px] text-slate-400 dark:text-slate-500">{item.variant}</div>
                    <div className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</div>
                  </div>

                  <div className="flex flex-none items-center gap-0.5 rounded-xl border border-slate-900/[.12] px-1 h-10 dark:border-white/[.12]">
                    <button
                      type="button"
                      onClick={() => decrement(item.sku)}
                      aria-label={t("decreaseQtyAria", { item: item.name })}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-base text-slate-600 transition-colors hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-[13.5px] font-semibold">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => increment(item.sku)}
                      aria-label={t("increaseQtyAria", { item: item.name })}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-base text-slate-600 transition-colors hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>

                  <div className="w-full flex-none text-left sm:w-[104px] sm:text-right">
                    <div className="text-base font-semibold tracking-[-.02em]">
                      {eur(item.price * item.qty)}
                    </div>
                    <div className="mt-1 text-[11.5px] text-slate-400 dark:text-slate-500">
                      {eur(item.price)} {t("eachSuffix")}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.sku)}
                    aria-label={t("removeItemAria", { item: item.name })}
                    className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-50"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-17.5 text-center">
                <p className="m-0 mb-4.5 text-sm text-slate-400 dark:text-slate-500">{t("cartEmpty")}</p>
                <Link href="/#grid" className="text-[13.5px] font-semibold text-blue-700 dark:text-blue-400">
                  {t("browseCylinders")}
                </Link>
              </div>
            )}

            <div className="mt-8.5 flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4.5 py-3.5 text-[12.5px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400">
              <Shield size={16} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
              {t("sds608Note")}
            </div>
          </div>

          {/* Order summary, with a targeted mesh gradient glow behind the glass card */}
          <div className="relative py-6.5">
            <div className="pointer-events-none absolute -left-[14%] -top-[4%] aspect-square w-[118%] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.28] blur-[100px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.4]" />
            <div className="pointer-events-none absolute -bottom-[8%] -right-[16%] aspect-square w-full rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.26] blur-[100px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.38]" />

            <div className="relative rounded-[22px] border border-white/75 bg-white/62 p-6 pt-6.5 shadow-[0_26px_60px_-26px_rgba(15,23,42,0.28)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_26px_60px_-26px_rgba(0,0,0,0.6)]">
              <div className="mb-5 text-[17px] font-semibold tracking-[-.025em]">
                {t("orderSummary")}
              </div>

              <div className="flex flex-col gap-3.5">
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-slate-500 dark:text-slate-400">{t("subtotal")}</span>
                  <span className="font-medium">{eur(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-slate-500 dark:text-slate-400">{t("estimatedShipping")}</span>
                  <span className="font-medium">
                    {shipping === 0 ? t("free") : eur(shipping)}
                  </span>
                </div>
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-slate-500 dark:text-slate-400">{t("vat20")}</span>
                  <span className="font-medium">{eur(vat)}</span>
                </div>
              </div>

              <div className="my-5 h-px bg-slate-900/10 dark:bg-white/10" />

              <div className="mb-5 flex items-baseline justify-between">
                <span className="text-sm font-semibold">{t("total")}</span>
                <span className="text-[26px] font-semibold tracking-[-.035em]">
                  {eur(total)}
                </span>
              </div>

              <button
                type="button"
                disabled={shownItems.length === 0}
                onClick={goToCheckout}
                className="h-[52px] w-full rounded-[14px] text-[15px] font-semibold tracking-[-.01em] text-white transition-transform duration-200 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: ACCENT, boxShadow: `0 14px 30px -12px ${ACCENT}a6` }}
              >
                {t("proceedToCheckout")}
              </button>

              <div className="mt-3.5 flex gap-2">
                <input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder={t("promoCodePlaceholder")}
                  className="h-[42px] min-w-0 flex-1 rounded-[11px] border border-slate-900/[.14] bg-white/70 px-3.5 text-[13px] text-slate-900 focus:outline-none dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:placeholder:text-slate-500"
                />
                <button
                  type="button"
                  className="h-[42px] flex-none rounded-[11px] border border-slate-900/[.14] bg-white/70 px-4 text-[13px] font-medium transition-colors hover:border-slate-900/[.34] dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
                >
                  {t("apply")}
                </button>
              </div>

              <p className="mt-4 text-center text-[11.5px] leading-[1.55] text-slate-400 dark:text-slate-500">
                {freightNote}
              </p>
            </div>
          </div>
        </div>
      </section>
      </div>

      <div className="block md:hidden">
        <MobileCartLayout />
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} callbackUrl="/checkout" />
    </div>
  );
}
