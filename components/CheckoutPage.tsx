"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Check, Loader2, MapPin, ShieldCheck } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import { calculateCartTotals } from "@/lib/cart";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { placeOrder, type PlaceOrderErrorCode } from "@/lib/actions/order";
import type { UserAddress } from "@/lib/data";

const ACCENT = "#1d4ed8";

const ERROR_KEY: Record<PlaceOrderErrorCode, string> = {
  UNAUTHENTICATED: "errorGeneric",
  INVALID_INPUT: "errorGeneric",
  ADDRESS_NOT_FOUND: "errorAddress",
  PRODUCT_NOT_FOUND: "errorGeneric",
  OUT_OF_STOCK: "errorOutOfStock",
  ORDER_FAILED: "errorGeneric",
};

interface CheckoutPageProps {
  addresses: UserAddress[];
}

export default function CheckoutPage({ addresses }: CheckoutPageProps) {
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null
  );
  const [placing, setPlacing] = useState(false);

  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const { count, subtotal, shipping, vat, total } = calculateCartTotals(shownItems);

  const canPlace = shownItems.length > 0 && addressId !== null && !placing;

  const submitOrder = async () => {
    if (!addressId) {
      toast.error(t("errorAddress"));
      return;
    }
    if (shownItems.length === 0) return;

    setPlacing(true);
    const result = await placeOrder({
      addressId,
      items: shownItems.map((i) => ({ sku: i.sku, qty: i.qty })),
    });

    if (!result.ok) {
      setPlacing(false);
      toast.error(t(ERROR_KEY[result.code]));
      return;
    }

    clear();
    toast.success(t("toastOrderPlaced"));
    router.push(`/profile/orders/${result.orderId}`);
  };

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <section className="mx-auto max-w-[1240px] px-8 pb-[110px] pt-13">
        <div className="mb-9.5 flex items-end justify-between gap-6">
          <div>
            <h1 className="m-0 text-[38px] font-semibold tracking-[-.04em]">{t("title")}</h1>
            <p className="mt-2 text-[13.5px] text-slate-500 dark:text-slate-400">
              {count === 0 ? tCart("noItemsYet") : tCart("cylinderCountShort", { count })}
            </p>
          </div>
          <Link href="/cart" className="text-[13px] text-slate-600 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400">
            {t("backToCart")}
          </Link>
        </div>

        {shownItems.length === 0 ? (
          <div className="py-17.5 text-center">
            <p className="m-0 mb-4.5 text-sm text-slate-400 dark:text-slate-500">{tCart("cartEmpty")}</p>
            <Link href="/#grid" className="text-[13.5px] font-semibold text-blue-700 dark:text-blue-400">
              {tCart("browseCylinders")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.5fr_.85fr] lg:gap-14">
            <div className="flex flex-col gap-8">
              {/* Shipping address */}
              <div>
                <h2 className="m-0 mb-4 text-[17px] font-semibold tracking-[-.025em]">
                  {t("shippingAddress")}
                </h2>
                {addresses.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4.5 py-4 text-[13px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400">
                    {t("noAddresses")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {addresses.map((address) => {
                      const selected = address.id === addressId;
                      return (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => setAddressId(address.id)}
                          aria-pressed={selected}
                          className="flex items-start gap-3.5 rounded-[18px] border bg-white/70 p-4.5 text-left backdrop-blur-md transition-[border-color,box-shadow] duration-200 dark:bg-white/[.04]"
                          style={{
                            borderColor: selected ? ACCENT : "rgba(100,116,139,.25)",
                            boxShadow: selected ? `0 0 0 3px ${ACCENT}1f` : "none",
                          }}
                        >
                          <span
                            className={`mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-2 transition-colors ${
                              selected
                                ? "border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-500"
                                : "border-slate-300 text-transparent dark:border-white/25"
                            }`}
                          >
                            <Check size={12} strokeWidth={3} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold tracking-[-.015em]">{address.title}</span>
                              {address.isDefault && (
                                <span className="rounded-full bg-blue-700/[.08] px-2 py-[3px] text-[10.5px] font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-400">
                                  {t("defaultBadge")}
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-[12.5px] text-slate-500 dark:text-slate-400">
                              {address.recipientName}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                              <MapPin size={12} strokeWidth={2} className="flex-none" />
                              {address.fullAddress}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Items review */}
              <div>
                <h2 className="m-0 mb-4 text-[17px] font-semibold tracking-[-.025em]">{t("itemsTitle")}</h2>
                <div>
                  {shownItems.map((item, idx) => (
                    <div
                      key={item.sku}
                      className={`flex items-center gap-4 border-b border-slate-900/[.08] py-3.5 dark:border-white/[.08] ${
                        idx === 0 ? "border-t dark:border-t-white/[.08]" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold tracking-[-.015em]">{item.name}</div>
                        <div className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">{item.variant}</div>
                      </div>
                      <span className="flex-none text-[13px] text-slate-500 dark:text-slate-400">× {item.qty}</span>
                      <span className="w-[92px] flex-none text-right text-[13.5px] font-semibold tracking-[-.015em]">
                        {eur(item.price * item.qty)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4.5 py-3.5 text-[12.5px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400">
                <ShieldCheck size={16} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                {tCart("hazmatNote")}
              </div>
            </div>

            {/* Order summary */}
            <div className="relative py-6.5">
              <div className="pointer-events-none absolute -left-[14%] -top-[4%] aspect-square w-[118%] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.28] blur-[100px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.4]" />
              <div className="pointer-events-none absolute -bottom-[8%] -right-[16%] aspect-square w-full rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.26] blur-[100px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.38]" />

              <div className="relative rounded-[22px] border border-white/75 bg-white/62 p-6 pt-6.5 shadow-[0_26px_60px_-26px_rgba(15,23,42,0.28)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_26px_60px_-26px_rgba(0,0,0,0.6)]">
                <div className="mb-5 text-[17px] font-semibold tracking-[-.025em]">
                  {tCart("orderSummary")}
                </div>

                <div className="flex flex-col gap-3.5">
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("subtotal")}</span>
                    <span className="font-medium">{eur(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("estimatedShipping")}</span>
                    <span className="font-medium">{shipping === 0 ? tCart("free") : eur(shipping)}</span>
                  </div>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("vat20")}</span>
                    <span className="font-medium">{eur(vat)}</span>
                  </div>
                </div>

                <div className="my-5 h-px bg-slate-900/10 dark:bg-white/10" />

                <div className="mb-5 flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{tCart("total")}</span>
                  <span className="text-[26px] font-semibold tracking-[-.035em]">{eur(total)}</span>
                </div>

                <button
                  type="button"
                  disabled={!canPlace}
                  onClick={submitOrder}
                  className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] text-[15px] font-semibold tracking-[-.01em] text-white transition-transform duration-200 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: ACCENT, boxShadow: `0 14px 30px -12px ${ACCENT}a6` }}
                >
                  {placing && <Loader2 size={17} strokeWidth={2.2} className="animate-spin" />}
                  {placing ? t("placing") : t("placeOrder")}
                </button>

                <p className="mt-4 text-center text-[11.5px] leading-[1.55] text-slate-400 dark:text-slate-500">
                  {t("legalNote")}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} callbackUrl="/checkout" />
    </div>
  );
}
