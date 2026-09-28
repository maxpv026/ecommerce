"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, Loader2, Lock, MapPin, Package, Phone, Plus, ShieldCheck } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import CheckoutAddressForm from "./CheckoutAddressForm";
import type { SavedAddress } from "@/lib/actions/address";
import { calculateCartTotals, lineUnitPrice, pricingLineFor } from "@/lib/cart";
import { formatKg } from "@/lib/pricing";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { imagePathForProduct } from "@/lib/productMedia";
import type { StoreProduct, UserAddress } from "@/lib/data";

const ACCENT = "#1d4ed8";

/** Every code POST /api/checkout can answer with, mapped to a message. */
const ERROR_KEY: Record<string, string> = {
  UNAUTHENTICATED: "errorGeneric",
  FGAS_UNVERIFIED: "errorFgas",
  INVALID_INPUT: "errorGeneric",
  ADDRESS_NOT_FOUND: "errorAddress",
  PRODUCT_NOT_FOUND: "errorGeneric",
  OUT_OF_STOCK: "errorOutOfStock",
  ORDER_FAILED: "errorGeneric",
};

interface CheckoutPageProps {
  addresses: UserAddress[];
  /** Live catalog — supplies each line's cylinder deposit for the summary. */
  products: StoreProduct[];
}

export default function CheckoutPage({ addresses: savedAddresses, products }: CheckoutPageProps) {
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  // Addresses created here, before the server component has caught up. They
  // are merged in front of the props rather than replacing them, so the
  // router.refresh() below can take over silently: once the same row arrives
  // from the server it wins the dedupe and this list stops mattering.
  const [createdAddresses, setCreatedAddresses] = useState<SavedAddress[]>([]);
  const addresses = useMemo(() => {
    const fromServer = new Set(savedAddresses.map((a) => a.id));
    return [...savedAddresses, ...createdAddresses.filter((a) => !fromServer.has(a.id))];
  }, [savedAddresses, createdAddresses]);

  const [addressId, setAddressId] = useState<string | null>(
    savedAddresses.find((a) => a.isDefault)?.id ?? savedAddresses[0]?.id ?? null
  );
  // With nothing saved, the form IS the shipping block — there is no empty
  // state to dismiss and nothing else on the page the buyer could do.
  const [addingAddress, setAddingAddress] = useState(savedAddresses.length === 0);
  const hasAddresses = addresses.length > 0;

  /**
   * A new address is selected the moment it exists, which is what unlocks
   * the payment button — no second click, no reload. router.refresh() then
   * re-runs the server component so the rest of the app (and a later visit
   * to this page) sees the row without this local copy.
   */
  const handleAddressSaved = (address: SavedAddress) => {
    setCreatedAddresses((current) => [...current, address]);
    setAddressId(address.id);
    setAddingAddress(false);
    toast.success(t("adrFormSaved"));
    router.refresh();
  };

  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);
  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const totalLines = shownItems.map((i) => pricingLineFor(i, bySku.get(i.sku)));
  const { count, subtotal, depositUnits, deposit, shipping, vat, total } = calculateCartTotals(totalLines);

  // Selection is only real if the row still exists — a refresh that removed
  // an address elsewhere must re-lock the button rather than send a dead id.
  const addressSelected = addressId !== null && addresses.some((a) => a.id === addressId);
  const canPlace = shownItems.length > 0 && addressSelected && !placing;

  /**
   * Hands the basket to /api/checkout, which validates it, reserves the
   * stock and records the order as awaiting a bank transfer.
   *
   * Nothing is charged here, so unlike a redirect to a payment provider
   * there is no "cancel and come back" state: once the server confirms the
   * order exists, the basket has served its purpose and is emptied before
   * the confirmation page opens.
   */
  const submitting = useRef(false);

  const submitOrder = async () => {
    // Synchronous latch. `placing` is state, so it only disables the buttons
    // on the next render — a fast double tap, or one tap on each of the two
    // CTAs, could both get through in that window and place two orders.
    if (submitting.current) return;
    if (!addressId) {
      toast.error(t("errorAddress"));
      return;
    }
    if (shownItems.length === 0) return;

    submitting.current = true;
    setPlacing(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId,
          items: shownItems.map((i) => ({ sku: i.sku, qty: i.qty })),
        }),
      });
      const result = (await response.json()) as
        | { ok: true; orderId: string; orderNumber: string }
        | { ok: false; code?: string };

      if (!response.ok || !result.ok) {
        submitting.current = false;
        setPlacing(false);
        const code = "code" in result ? result.code : undefined;
        toast.error(t(ERROR_KEY[code ?? ""] ?? "errorGeneric"));
        return;
      }

      // The order is committed and the stock reserved — the basket is spent.
      clearCart();
      toast.success(t("toastOrderPlaced"));
      // `placing` stays true: the page is on its way out.
      router.push({ pathname: "/checkout/success", query: { orderId: result.orderId } });
    } catch {
      submitting.current = false;
      setPlacing(false);
      toast.error(t("errorGeneric"));
    }
  };

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      {/* Header is a desktop component — no responsive classes in it — so
          it is gated exactly as CartPage gates it. Below md the compact
          header inside the section is the page's chrome. */}
      <div className="hidden md:block">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />
      </div>

      {/* pb clears the fixed action bar (and the home indicator) on the
          single-column breakpoints; from lg the bar is gone and the original
          desktop rhythm is restored. */}
      <section className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-[calc(150px+env(safe-area-inset-bottom))] lg:block lg:gap-0 lg:px-8 lg:pt-13 lg:pb-[110px]">
        {/* Compact header for the stacked layout: a 44px back target and a
            title that fits one line. The desktop block below is unchanged. */}
        <div className="flex items-center gap-1 md:hidden">
          <Link
            href="/cart"
            aria-label={t("backToCart")}
            className="-ml-2.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-900/[.06] active:bg-slate-900/[.1] dark:text-slate-200 dark:hover:bg-white/[.08]"
          >
            <ChevronLeft size={21} strokeWidth={2.2} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[21px] font-semibold tracking-[-.035em]">{t("title")}</h1>
            <p className="m-0 mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
              {count === 0 ? tCart("noItemsYet") : tCart("cylinderCountShort", { count })}
            </p>
          </div>
        </div>

        <div className="mb-9.5 hidden items-end justify-between gap-6 md:flex">
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
            <Link href="/products" className="text-[13.5px] font-semibold text-blue-700 dark:text-blue-400">
              {tCart("browseCylinders")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.5fr_.85fr] lg:gap-14">
            <div className="flex flex-col gap-6 lg:gap-8">
              {/* Shipping address — selectable cards plus in-place creation.
                  A buyer with nothing saved never leaves this page: the form
                  is already open below. */}
              <div data-shipping-block>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em]">
                    {t("shippingAddress")}
                  </h2>
                  {hasAddresses && !addingAddress && (
                    <motion.button
                      type="button"
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setAddingAddress(true)}
                      data-add-address
                      className="hidden h-9 flex-none items-center gap-1.5 rounded-[12px] lg:inline-flex border border-cyan-500/40 bg-cyan-500/[.08] pl-2.5 pr-3.5 text-[12.5px] font-semibold tracking-[-.015em] text-cyan-700 shadow-[0_0_22px_-10px_rgba(6,182,212,.9)] transition-colors hover:bg-cyan-500/[.14] dark:text-cyan-300"
                    >
                      <Plus size={14} strokeWidth={2.4} />
                      {t("adrFormAddNew")}
                    </motion.button>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <div role="radiogroup" aria-label={t("shippingAddress")} className="flex flex-col gap-3 empty:hidden">
                  <AnimatePresence initial={false}>
                    {addresses.map((address) => {
                      const selected = address.id === addressId;
                      return (
                        <motion.button
                          key={address.id}
                          layout
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          type="button"
                          role="radio"
                          onClick={() => setAddressId(address.id)}
                          aria-checked={selected}
                          data-address-card={address.id}
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
                            {address.phone && (
                              <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                                <Phone size={12} strokeWidth={2} className="flex-none" />
                                {address.phone}
                              </span>
                            )}
                          </span>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                  </div>

                  {/* The header button is a small chip that only exists from
                      lg; on a phone the same action is a full-width target
                      under the address list, where a thumb already is. */}
                  {hasAddresses && !addingAddress && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setAddingAddress(true)}
                      data-add-address-mobile
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-cyan-500/50 bg-cyan-500/[.06] text-[13.5px] font-semibold tracking-[-.015em] text-cyan-700 lg:hidden dark:text-cyan-300"
                    >
                      <Plus size={16} strokeWidth={2.4} />
                      {t("adrFormAddNew")}
                    </motion.button>
                  )}

                  <AnimatePresence initial={false}>
                    {addingAddress && (
                      <CheckoutAddressForm
                        key="address-form"
                        canCancel={hasAddresses}
                        onCancel={() => setAddingAddress(false)}
                        onSaved={handleAddressSaved}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Items review */}
              <div>
                <h2 className="m-0 mb-4 text-[17px] font-semibold tracking-[-.025em]">{t("itemsTitle")}</h2>
                <div>
                  {shownItems.map((item, idx) => {
                    const catalogProduct = bySku.get(item.sku);
                    const pricing = pricingLineFor(item, catalogProduct);
                    const unit = lineUnitPrice(pricing);
                    const showBreakdown = catalogProduct ? catalogProduct.pricedPerKg : pricing.weightKg !== 1;
                    const image = catalogProduct ? imagePathForProduct(catalogProduct) : null;
                    return (
                      <div
                        key={item.sku}
                        data-checkout-item
                        className={`flex items-center gap-3 border-b border-slate-900/[.08] py-3.5 lg:gap-4 dark:border-white/[.08] ${
                          idx === 0 ? "border-t dark:border-t-white/[.08]" : ""
                        }`}
                      >
                        <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-[13px] border border-slate-900/[.06] bg-slate-100 lg:h-14 lg:w-14 dark:border-white/[.06] dark:bg-white/[.05]">
                          {image ? (
                            // See OrderDetailView: 768x768 sources in a 48-56px
                            // box, so the optimizer earns its keep here.
                            <Image
                              src={image}
                              alt=""
                              width={56}
                              height={56}
                              sizes="(min-width: 1024px) 56px, 48px"
                              className="h-full w-full object-contain p-1"
                            />
                          ) : (
                            <Package size={18} strokeWidth={1.8} className="text-slate-400 dark:text-slate-500" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-semibold tracking-[-.015em]">{item.name}</div>
                          <div className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
                            {item.variant}
                            <span className="lg:hidden"> · × {item.qty}</span>
                          </div>
                          <div className="mt-0.5 text-[11.5px] leading-[1.5] text-slate-400 dark:text-slate-500" data-line-breakdown>
                            {showBreakdown
                              ? tCart("lineBreakdown", { perKg: eur(pricing.pricePerKg), weight: formatKg(pricing.weightKg), cylinder: eur(unit) })
                              : `${eur(unit)} ${tCart("eachSuffix")}`}
                            {(pricing.deposit ?? 0) > 0 && (
                              <span className="block text-emerald-700 dark:text-emerald-300/90">
                                {tCart("depositEach", { amount: eur(pricing.deposit ?? 0) })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="hidden flex-none text-[13px] text-slate-500 lg:block dark:text-slate-400">
                          × {item.qty}
                        </span>
                        <span className="flex-none text-right text-[13.5px] font-semibold tracking-[-.015em] tabular-nums lg:w-[92px]">
                          {eur(unit * item.qty)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4.5 py-3.5 text-[12.5px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400">
                <ShieldCheck size={16} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                {tCart("hazmatNote")}
              </div>
            </div>

            {/* Order summary */}
            <div className="relative py-0 lg:sticky lg:top-24 lg:py-6.5">
              {/* Ambient mesh: desktop only. Two 100px-blur radial gradients
                  are a real compositing cost on a phone, behind a card that
                  fills the screen anyway. */}
              <div className="pointer-events-none absolute -left-[14%] -top-[4%] hidden aspect-square w-[118%] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.28] blur-[100px] lg:block [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.4]" />
              <div className="pointer-events-none absolute -bottom-[8%] -right-[16%] hidden aspect-square w-full rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.26] blur-[100px] lg:block [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.38]" />

              <div className="relative rounded-[22px] border border-white/75 bg-white/62 p-6 pt-6.5 shadow-[0_26px_60px_-26px_rgba(15,23,42,0.28)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_26px_60px_-26px_rgba(0,0,0,0.6)]">
                <div className="mb-5 text-[17px] font-semibold tracking-[-.025em]">
                  {tCart("orderSummary")}
                </div>

                <div className="flex flex-col gap-3.5">
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("subtotal")}</span>
                    <span className="font-medium">{eur(subtotal)}</span>
                  </div>
                  {deposit > 0 && (
                    <div className="flex justify-between gap-3 text-[13.5px]" data-summary-deposit>
                      <span className="min-w-0 text-slate-500 dark:text-slate-400">
                        {tCart("cylinderDeposit")}
                        <span className="mt-0.5 block text-[11px] leading-[1.4] text-slate-400 dark:text-slate-500">
                          {tCart("cylinderDepositDetail", { count: depositUnits })}
                        </span>
                      </span>
                      <span className="flex-none font-medium">{eur(deposit)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("estimatedShipping")}</span>
                    <span className="font-medium">{shipping === 0 ? tCart("free") : eur(shipping)}</span>
                  </div>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("vat20")}</span>
                    <span className="font-medium">{eur(vat)}</span>
                  </div>
                  {/* Says how this will be settled before the button is
                      pressed — nothing is charged at checkout. */}
                  <div className="flex justify-between gap-3 text-[13.5px]" data-summary-payment="bank_transfer">
                    <span className="text-slate-500 dark:text-slate-400">{tCart("paymentMethodTitle")}</span>
                    <span className="flex-none text-right font-medium">{t("bankTransferLabel")}</span>
                  </div>
                </div>

                <p
                  className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-[11.5px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400"
                  data-bank-transfer-note
                >
                  {t("bankTransferNote")}
                </p>

                <div className="my-5 h-px bg-slate-900/10 dark:bg-white/10" />

                <div className="mb-5 flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{tCart("total")}</span>
                  <span className="text-[26px] font-semibold tracking-[-.035em]">{eur(total)}</span>
                </div>

                {/* Locked until an address is selected — and unlocked the
                    instant one is saved, since handleAddressSaved selects it. */}
                {/* Hidden — not merely visually — below lg, so the fixed bar
                    is the only reachable Place Order at those widths. */}
                <motion.button
                  type="button"
                  disabled={!canPlace}
                  onClick={submitOrder}
                  animate={{
                    opacity: canPlace || placing ? 1 : 0.4,
                    filter: canPlace || placing ? "saturate(1)" : "saturate(.5)",
                  }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  whileTap={canPlace ? { scale: 0.99 } : undefined}
                  data-pay-cta
                  data-pay-locked={addressSelected ? undefined : "true"}
                  title={addressSelected ? undefined : t("adrFormRequiredHint")}
                  className="hidden h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] text-[15px] font-semibold tracking-[-.01em] text-white lg:flex disabled:cursor-not-allowed"
                  style={{ background: ACCENT, boxShadow: `0 14px 30px -12px ${ACCENT}a6` }}
                >
                  {placing && <Loader2 size={17} strokeWidth={2.2} className="animate-spin" />}
                  {placing ? t("placing") : t("placeOrderBankTransfer")}
                  {!placing && !addressSelected && <Lock size={15} strokeWidth={2.2} />}
                </motion.button>

                {/* Says WHY it's locked, rather than leaving a dead button. */}
                <AnimatePresence initial={false}>
                  {!addressSelected && (
                    <motion.p
                      key="address-hint"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      data-pay-locked-hint
                      className="m-0 hidden overflow-hidden text-center text-[11.5px] leading-[1.55] text-amber-700 lg:block dark:text-amber-400"
                    >
                      <span className="block pt-3">{t("adrFormRequiredHint")}</span>
                    </motion.p>
                  )}
                </AnimatePresence>

                <p className="mt-4 text-center text-[11.5px] leading-[1.55] text-slate-400 dark:text-slate-500">
                  {t("legalNote")}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Mobile action bar ──────────────────────────────────────────
          Only rendered with something to buy, and gone from lg where the
          summary card carries the CTA — so exactly one Place Order button
          is ever reachable. */}
      {shownItems.length > 0 && (
        <div
          data-checkout-bar
          className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-900/[.08] bg-white/80 backdrop-blur-xl backdrop-saturate-150 lg:hidden dark:border-hairline dark:bg-glass"
        >
          <div className="mx-auto flex max-w-[1240px] flex-col gap-2.5 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">{tCart("total")}</span>
              <span className="text-[22px] font-semibold tracking-[-.035em] tabular-nums">{eur(total)}</span>
            </div>

            <motion.button
              type="button"
              disabled={!canPlace}
              onClick={submitOrder}
              animate={{
                opacity: canPlace || placing ? 1 : 0.45,
                filter: canPlace || placing ? "saturate(1)" : "saturate(.5)",
              }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              whileTap={canPlace ? { scale: 0.99 } : undefined}
              data-pay-cta-mobile
              data-pay-locked={addressSelected ? undefined : "true"}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[15px] font-semibold tracking-[-.01em] text-white disabled:cursor-not-allowed"
              style={{ background: ACCENT, boxShadow: `0 14px 30px -12px ${ACCENT}a6` }}
            >
              {placing && <Loader2 size={17} strokeWidth={2.2} className="animate-spin" />}
              {placing ? t("placing") : t("placeOrderBankTransfer")}
              {!placing && !addressSelected && <Lock size={15} strokeWidth={2.2} />}
            </motion.button>

            {/* A disabled button with no explanation is a dead end. */}
            {!addressSelected && (
              <p data-pay-locked-hint-mobile className="m-0 text-center text-[11.5px] leading-[1.45] text-amber-700 dark:text-amber-400">
                {t("adrFormRequiredHint")}
              </p>
            )}
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} callbackUrl="/checkout" />
    </div>
  );
}
