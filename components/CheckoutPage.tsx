"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FlaskConical, Landmark, Loader2, Lock, MapPin, Package, Pencil, Phone, Plus, Truck } from "lucide-react";
import CheckoutAddressForm from "./CheckoutAddressForm";
import QuoteCartBanner from "./QuoteCartBanner";
import { FgasVerifiedLine } from "./FgasGateAlert";
import { EYEBROW, MicroBadge, PRIMARY, ROW_ACTION_GHOST, SUMMARY_CARD, SURFACE, safetyTone } from "@/components/home/ui";
import type { SavedAddress } from "@/lib/actions/address";
import { updateBillingDetails } from "@/lib/actions/checkout";
import { calculateCartTotals, lineUnitPrice, pricingLineFor } from "@/lib/cart";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { usePackLabel } from "@/lib/hooks/usePackLabel";
import { imagePathForProduct } from "@/lib/productMedia";
import type { StoreProduct, UserAddress } from "@/lib/data";
import type { FgasSummary } from "@/lib/fgas";
import { requiresFgasCertificate } from "@/lib/fgasSubstances";

/**
 * /checkout — step 2 of 3, in the cart's language: the single-row header
 * with the step indicator, then 8 + 4 — one divided surface (delivery
 * address + delivery/PO note, payer details for the invoice, the lines being
 * reserved) beside the cart's summary card. Payment is always a bank
 * transfer: nothing is charged here, the next page is the requisites.
 */

/** Every code POST /api/checkout can answer with, mapped to a message. */
const ERROR_KEY: Record<string, string> = {
  UNAUTHENTICATED: "errorGeneric",
  FGAS_UNVERIFIED: "errorFgas",
  FGAS_EXPIRED: "errorFgasExpired",
  INVALID_INPUT: "errorGeneric",
  ADDRESS_NOT_FOUND: "errorAddress",
  PRODUCT_NOT_FOUND: "errorGeneric",
  OUT_OF_STOCK: "errorOutOfStock",
  QUOTE_INVALID: "errorQuote",
  ORDER_FAILED: "errorGeneric",
};

const TRUST = [
  { icon: FlaskConical, short: "trustCoa", long: "assuranceCoa" },
  { icon: Truck, short: "trustAdr", long: "assuranceFreight" },
  { icon: Lock, short: "trustFgas", long: "assuranceFgas" },
] as const;

export interface CheckoutPayer {
  name: string | null;
  email: string;
  companyName: string | null;
  vatNumber: string | null;
  billingEmail: string | null;
}

interface CheckoutPageProps {
  addresses: UserAddress[];
  /** Live catalog — each line's deposit, badges and pack. */
  products: StoreProduct[];
  /** The buyer's certificate (effective status). */
  fgas: FgasSummary | null;
  payer: CheckoutPayer;
  /** Receiving bank, for the payment-method row. */
  bankName: string;
}

const INPUT = "h-10 w-full rounded-[12px] border border-slate-900/[.12] bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-blue-600/50 focus:outline-none dark:border-white/[.14] dark:bg-white/[.04] dark:text-white";

function SectionHead({ n, title, action }: { n: number; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="m-0 flex items-center gap-2.5 text-[15px] font-semibold tracking-[-.02em]">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#0B1020] text-[12px] font-semibold text-white dark:bg-white dark:text-slate-900">{n}</span>
        {title}
      </h2>
      {action}
    </div>
  );
}

export default function CheckoutPage({ addresses: savedAddresses, products, fgas, payer: initialPayer, bankName }: CheckoutPageProps) {
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const tDash = useTranslations("ProfileDashboard");
  const format = useFormatter();
  const router = useRouter();
  const packLabel = usePackLabel();
  const [placing, setPlacing] = useState(false);
  const fgasCleared = fgas?.status === "VERIFIED";

  // Addresses created here, before the server component has caught up; the
  // refresh below takes over once the same row arrives from the server.
  const [createdAddresses, setCreatedAddresses] = useState<SavedAddress[]>([]);
  const addresses = useMemo(() => {
    const fromServer = new Set(savedAddresses.map((a) => a.id));
    return [...savedAddresses, ...createdAddresses.filter((a) => !fromServer.has(a.id))];
  }, [savedAddresses, createdAddresses]);
  const [addressId, setAddressId] = useState<string | null>(savedAddresses.find((a) => a.isDefault)?.id ?? savedAddresses[0]?.id ?? null);
  // With nothing saved, the form IS the address block.
  const [addingAddress, setAddingAddress] = useState(savedAddresses.length === 0);
  const hasAddresses = addresses.length > 0;
  const [note, setNote] = useState("");

  const handleAddressSaved = (address: SavedAddress) => {
    setCreatedAddresses((current) => [...current, address]);
    setAddressId(address.id);
    setAddingAddress(false);
    toast.success(t("adrFormSaved"));
    router.refresh();
  };

  // ── Payer (invoice) details, editable in place ──
  const [payer, setPayer] = useState(initialPayer);
  const [editingPayer, setEditingPayer] = useState(false);
  const [draft, setDraft] = useState({ companyName: payer.companyName ?? "", vatNumber: payer.vatNumber ?? "", billingEmail: payer.billingEmail ?? "" });
  const [payerError, setPayerError] = useState<string | null>(null);
  const [savingPayer, startSavePayer] = useTransition();
  const savePayer = () =>
    startSavePayer(async () => {
      setPayerError(null);
      const result = await updateBillingDetails(draft);
      if (!result.ok) {
        setPayerError(result.field === "vatNumber" ? t("payerErrorVat") : result.field === "billingEmail" ? t("payerErrorEmail") : t("payerError"));
        return;
      }
      setPayer((p) => ({ ...p, companyName: result.companyName, vatNumber: result.vatNumber, billingEmail: result.billingEmail }));
      setEditingPayer(false);
      toast.success(t("payerSaved"));
    });

  // ── Basket ──
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);
  const quote = useCartStore((s) => s.quote);
  const dropQuote = useCartStore((s) => s.dropQuote);
  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  // An F-Gas basket without a certificate in force goes back to the cart,
  // which explains why and owns the upload. prepareOrder enforces the same rule.
  const needsFgas = shownItems.some((i) => {
    const p = bySku.get(i.sku);
    return p ? requiresFgasCertificate(p) : true;
  });
  useEffect(() => {
    if (hydrated && needsFgas && !fgasCleared) router.replace("/cart");
  }, [hydrated, needsFgas, fgasCleared, router]);
  const totalLines = shownItems.map((i) => pricingLineFor(i, quote ? null : bySku.get(i.sku)));
  const { count, subtotal, depositUnits, deposit, shipping, vat, total } = calculateCartTotals(totalLines);

  // Selection is only real if the row still exists.
  const addressSelected = addressId !== null && addresses.some((a) => a.id === addressId);
  const canPlace = shownItems.length > 0 && addressSelected && !placing && !editingPayer;

  const submitting = useRef(false);
  const submitOrder = async () => {
    // Synchronous latch: `placing` only disables the button on the next render.
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
          ...(quote ? { quoteId: quote.id } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const result = (await response.json()) as { ok: true; orderId: string; orderNumber: string } | { ok: false; code?: string };
      if (!response.ok || !result.ok) {
        submitting.current = false;
        setPlacing(false);
        const code = "code" in result ? result.code : undefined;
        if (code === "QUOTE_INVALID") dropQuote();
        toast.error(t(ERROR_KEY[code ?? ""] ?? "errorGeneric"));
        return;
      }
      // The order is committed and the stock reserved — the basket is spent.
      clearCart();
      toast.success(t("toastOrderPlaced"));
      router.push({ pathname: "/checkout/success", query: { orderId: result.orderId } });
    } catch {
      submitting.current = false;
      setPlacing(false);
      toast.error(t("errorGeneric"));
    }
  };

  const steps = [
    { n: 1, label: t("step1"), state: "done" as const },
    { n: 2, label: t("step2"), state: "current" as const },
    { n: 3, label: t("step3"), state: "next" as const },
  ];

  return (
    <div className="relative overflow-x-clip">
      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-checkout>
        {/* ── Header bar: title left, steps + way back right ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-checkout-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("title")}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-checkout-meta>
              {t("lead")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:flex-none lg:pt-1">
            <ol className="m-0 flex list-none items-center gap-1 p-0" aria-label={t("stepsLabel")} data-checkout-steps>
              {steps.map((s, i) => (
                <li key={s.n} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="h-px w-3 bg-slate-900/[.15] dark:bg-white/[.2]" />}
                  {s.state === "done" ? (
                    <Link href="/cart" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300" data-step="done">
                      <Check size={12} strokeWidth={3} />
                      {s.n}. {s.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={s.state === "current" ? "step" : undefined}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold ${s.state === "current" ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border border-slate-900/[.12] text-slate-500 dark:border-white/[.14] dark:text-ink-muted"}`}
                      data-step={s.state}
                    >
                      {s.state === "current" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
                      {s.n}. {s.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <Link href="/cart" className="inline-flex h-8 items-center gap-1 px-1.5 text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" data-back-to-cart>
              <ArrowLeft size={13} strokeWidth={2.4} />
              {t("backToCart")}
            </Link>
          </div>
        </div>

        {shownItems.length === 0 ? (
          <div className={`${SURFACE} px-5 py-14 text-center`} data-checkout-empty>
            <p className="m-0 mb-4 text-[14px] text-slate-500 dark:text-ink-muted">{tCart("cartEmpty")}</p>
            <Link href="/products" className="text-[13.5px] font-semibold text-blue-700 dark:text-blue-400">
              {tCart("browseCylinders")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* ── Left: one divided surface ── */}
            <div className={`min-w-0 lg:col-span-8 ${SURFACE} divide-y divide-slate-900/[.06] dark:divide-white/[.06]`} data-checkout-surface>
              {/* 1 · Delivery address */}
              <section className="px-5 py-5" data-shipping-block>
                <SectionHead
                  n={1}
                  title={t("sectionAddress")}
                  action={
                    hasAddresses && !addingAddress ? (
                      <div className="flex items-center gap-2">
                        <Link href="/profile?tab=addresses" className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" data-change-addresses>
                          {t("changeAddresses")}
                        </Link>
                        <button type="button" onClick={() => setAddingAddress(true)} className={ROW_ACTION_GHOST} data-add-address>
                          <Plus size={14} strokeWidth={2.4} />
                          {t("adrFormAddNew")}
                        </button>
                      </div>
                    ) : null
                  }
                />
                <div role="radiogroup" aria-label={t("sectionAddress")} className="mt-4 flex flex-col gap-2 empty:hidden">
                  {addresses.map((address) => {
                    const selected = address.id === addressId;
                    const site = "siteType" in address ? (address as UserAddress).siteType : null;
                    return (
                      <button
                        key={address.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAddressId(address.id)}
                        data-address-card={address.id}
                        className={`flex items-start gap-3 rounded-[16px] border p-3.5 text-left transition-colors ${selected ? "border-blue-700 bg-blue-600/[.04] ring-2 ring-blue-600/15 dark:border-blue-400 dark:bg-blue-400/[.06]" : "border-slate-900/[.1] hover:bg-slate-900/[.02] dark:border-white/[.12] dark:hover:bg-white/[.03]"}`}
                      >
                        <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${selected ? "border-blue-700 bg-blue-700 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-900" : "border-slate-300 text-transparent dark:border-white/25"}`}>
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[14px] font-semibold tracking-[-.015em]">{address.title}</span>
                            {site && <MicroBadge data-address-site={site}>{tDash(`adrSite_${site}`)}</MicroBadge>}
                            {address.isDefault && <MicroBadge tone="info">{t("defaultBadge")}</MicroBadge>}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                            <span>{address.recipientName}</span>
                            {address.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone size={11} strokeWidth={2.2} />
                                {address.phone}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex items-start gap-1 text-[12.5px] text-slate-500 dark:text-ink-muted">
                            <MapPin size={11} strokeWidth={2.2} className="mt-[3px] flex-none" />
                            {address.fullAddress}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <AnimatePresence initial={false}>
                  {addingAddress && (
                    <div className="mt-4">
                      <CheckoutAddressForm key="address-form" canCancel={hasAddresses} onCancel={() => setAddingAddress(false)} onSaved={handleAddressSaved} />
                    </div>
                  )}
                </AnimatePresence>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">{t("noteLabel")}</span>
                  <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} maxLength={280} placeholder={t("notePlaceholder")} className={INPUT} data-checkout-note />
                </label>
              </section>

              {/* 2 · Payer for the invoice + how it's paid */}
              <section className="px-5 py-5" data-payer-block>
                <SectionHead
                  n={2}
                  title={t("sectionPayer")}
                  action={
                    !editingPayer ? (
                      <button type="button" onClick={() => setEditingPayer(true)} className={ROW_ACTION_GHOST} data-payer-edit>
                        <Pencil size={13} strokeWidth={2.2} />
                        {t("payerEdit")}
                      </button>
                    ) : null
                  }
                />
                {editingPayer ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3" data-payer-form>
                    {(["companyName", "vatNumber", "billingEmail"] as const).map((k) => (
                      <label key={k} className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-slate-300">{t(`payer_${k}`)}</span>
                        <input value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} type={k === "billingEmail" ? "email" : "text"} placeholder={k === "billingEmail" ? payer.email : undefined} className={INPUT} data-payer-input={k} />
                      </label>
                    ))}
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                      <button type="button" onClick={savePayer} disabled={savingPayer} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-60" data-payer-save>
                        {savingPayer && <Loader2 size={13} className="animate-spin" />}
                        {t("payerSave")}
                      </button>
                      <button type="button" onClick={() => { setEditingPayer(false); setPayerError(null); }} className={ROW_ACTION_GHOST}>
                        {t("payerCancel")}
                      </button>
                      {payerError && <span className="text-[12.5px] font-semibold text-red-600 dark:text-red-400" data-payer-error>{payerError}</span>}
                    </div>
                  </div>
                ) : (
                  <dl className="m-0 mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3" data-payer-view>
                    {[
                      { k: "companyName", v: payer.companyName },
                      { k: "vatNumber", v: payer.vatNumber },
                      { k: "billingEmail", v: payer.billingEmail || payer.email },
                    ].map(({ k, v }) => (
                      <div key={k} className="min-w-0" data-payer-field={k}>
                        <dt className="text-[12px] text-slate-500 dark:text-ink-muted">{t(`payer_${k}`)}</dt>
                        <dd className={`m-0 mt-0.5 truncate text-[13.5px] font-semibold ${v ? "" : "font-normal text-slate-400"}`}>{v || t("payerNotSet")}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-slate-900/[.08] bg-slate-50/80 px-3.5 py-2.5 text-[12.5px] dark:border-white/[.08] dark:bg-white/[.03]" data-bank-pill>
                  <Landmark size={15} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                  <span className="min-w-0">{t("bankPill", { bank: bankName })}</span>
                </div>
              </section>

              {/* 3 · Lines being reserved */}
              <section data-items-block>
                <div className="px-5 pt-5">
                  <SectionHead n={3} title={t("sectionItems")} />
                </div>
                <div className="mt-3 divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
                  {shownItems.map((item) => {
                    const p = bySku.get(item.sku);
                    const pricing = pricingLineFor(item, quote ? null : p);
                    const unit = lineUnitPrice(pricing);
                    const perKg = p ? p.pricedPerKg : pricing.weightKg !== 1;
                    const image = p ? imagePathForProduct(p) : null;
                    const safety = p?.gwpClass && p.gwpClass !== "n/a" ? p.gwpClass : null;
                    return (
                      <div key={item.sku} className="flex items-center gap-3.5 px-5 py-3.5" data-checkout-item={item.sku}>
                        <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-[14px] border border-slate-900/[.08] bg-slate-50 dark:border-white/[.1] dark:bg-white/[.04]">
                          {image ? <Image src={image} alt="" width={48} height={48} sizes="48px" className="h-full w-full object-contain p-1" /> : <Package size={18} strokeWidth={1.8} className="text-slate-400" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold tracking-[-.015em]">{item.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                            <span data-line-pack>{packLabel(pricing.weightKg, p?.containerType, perKg)}</span>
                            {safety && <MicroBadge tone={safetyTone(safety)}>{safety}</MicroBadge>}
                            {p?.gwp != null && <MicroBadge>GWP {format.number(p.gwp)}</MicroBadge>}
                          </div>
                          {(pricing.deposit ?? 0) > 0 && <div className="mt-0.5 text-[11.5px] text-emerald-700 dark:text-emerald-400">{tCart("depositEach", { amount: eur(pricing.deposit ?? 0) })}</div>}
                        </div>
                        <div className="flex-none text-right">
                          <div className="text-[14px] font-semibold tabular-nums" data-line-total>{eur(unit * item.qty)}</div>
                          <div className="text-[12px] text-slate-500 tabular-nums dark:text-ink-muted">
                            {item.qty} × {eur(unit)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* ── Right: the cart's summary card ── */}
            <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-checkout-summary>
              <div className={SUMMARY_CARD}>
                <h2 className={EYEBROW}>{tCart("orderSummary")}</h2>
                <QuoteCartBanner className="mt-4" />
                <dl className="m-0 mt-4 flex flex-col gap-2.5 text-[13.5px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{tCart("subtotal")} · {tCart("cylinderCountShort", { count })}</dt>
                    <dd className="m-0 font-semibold tabular-nums" data-summary-subtotal>{eur(subtotal)}</dd>
                  </div>
                  {deposit > 0 && (
                    <div className="flex items-baseline justify-between gap-3" data-summary-deposit>
                      <dt className="text-slate-600 dark:text-ink-muted">
                        {tCart("cylinderDeposit")}
                        <span className="ml-1.5 text-[11.5px] text-slate-400">· {tCart("depositUnitsShort", { count: depositUnits })}</span>
                      </dt>
                      <dd className="m-0 font-semibold tabular-nums">{eur(deposit)}</dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{tCart("estimatedShipping")}</dt>
                    <dd className="m-0 font-semibold tabular-nums" data-summary-shipping>{shipping === 0 ? tCart("free") : eur(shipping)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{tCart("vat20")}</dt>
                    <dd className="m-0 font-semibold tabular-nums" data-summary-vat>{eur(vat)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3" data-summary-payment="bank_transfer">
                    <dt className="text-slate-600 dark:text-ink-muted">{tCart("paymentMethodTitle")}</dt>
                    <dd className="m-0 text-right font-semibold">{t("bankTransferShort")}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-slate-900/[.08] pt-4 dark:border-white/[.08]">
                  <span className="text-[15px] font-semibold tracking-[-.02em]">{tCart("total")}</span>
                  <span className="text-[28px] font-semibold tracking-[-.04em] tabular-nums" data-summary-total>{eur(total)}</span>
                </div>

                {fgasCleared && (
                  <div className="mt-4">
                    <FgasVerifiedLine fgas={fgas} />
                  </div>
                )}

                <button type="button" disabled={!canPlace} onClick={submitOrder} className={`${PRIMARY} mt-4 whitespace-nowrap px-4`} data-pay-cta data-pay-locked={addressSelected ? undefined : "true"} title={addressSelected ? undefined : t("adrFormRequiredHint")}>
                  {placing ? <Loader2 size={17} strokeWidth={2.2} className="animate-spin" /> : !addressSelected ? <Lock size={15} strokeWidth={2.2} /> : null}
                  {placing ? t("placing") : t("confirmCta")}
                  {!placing && addressSelected && <ArrowRight size={17} strokeWidth={2.2} />}
                </button>
                {!addressSelected && (
                  <p className="m-0 mt-2.5 text-center text-[12px] text-amber-700 dark:text-amber-400" data-pay-locked-hint>
                    {t("adrFormRequiredHint")}
                  </p>
                )}
                <p className="m-0 mt-3 text-center text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted" data-bank-transfer-note>
                  {t("bankTransferNote")}
                </p>
                <p className="m-0 mt-2 text-center text-[11px] leading-[1.5] text-slate-400 dark:text-ink-muted/80" data-legal-note>
                  {t("legalNote")}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-900/[.07] pt-3.5 dark:border-white/[.07]" data-checkout-trust-chips>
                  {TRUST.map(({ icon: Icon, short, long }) => (
                    <span key={short} title={tCart(long)} className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium leading-tight text-slate-500 dark:text-ink-muted">
                      <Icon size={12} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                      {tCart(short)}
                    </span>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
