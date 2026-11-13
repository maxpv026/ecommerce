"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Package,
  FileText,
  Loader2,
  FlaskConical,
  Lock,
  Minus,
  PackageX,
  Plus,
  RefreshCcw,
  ShoppingCart,
  ScanSearch,
  Sparkles,
  Trash2,
  TriangleAlert,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import MobileCartLayout from "./MobileCartLayout";
import SmartOrderButton from "./smartOrder/SmartOrderButton";
import FgasGateAlert, { FgasVerifiedLine, fgasGateFor } from "./FgasGateAlert";
import { useFgasModal } from "@/lib/fgasModalEvents";
import { requiresFgasCertificate } from "@/lib/fgasSubstances";
import type { FgasSummary } from "@/lib/fgas";
import QuoteCartBanner from "./QuoteCartBanner";
import ProductThumbnail from "./ProductThumbnail";
import { calculateCartTotals, lineUnitPrice, pricingLineFor } from "@/lib/cart";
import { formatKg } from "@/lib/pricing";
import { isPurchasable } from "@/lib/waitlist";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { auditCart, type CartAuditResult, type CartAuditSuggestion } from "@/lib/actions/cartAudit";
import { createQuote, type QuoteErrorCode } from "@/lib/actions/quotes";
import type { StoreProduct } from "@/lib/data";

/** The three assurances: short chip text in the summary, full sentence as its tooltip / empty-state card. */
const TRUST = [
  { icon: FlaskConical, short: "trustCoa", long: "assuranceCoa" },
  { icon: Truck, short: "trustAdr", long: "assuranceFreight" },
  { icon: Lock, short: "trustFgas", long: "assuranceFgas" },
] as const;

// Line tint mirrors the PDP brand mapping: A2L emerald, A1 cyan, rest blue.
const tintFor = (p?: StoreProduct) =>
  p?.gwpClass === "A2L" ? "#34d399" : p?.gwpClass === "A1" ? "#22d3ee" : "#60a5fa";

const SUGGEST_ICON: Record<string, typeof Wrench> = {
  equipment: Wrench,
  recovery: RefreshCcw,
  cylinders: FlaskConical,
  blends: FlaskConical,
};

type AuditPhase = "idle" | "thinking" | "compliant" | "optimised" | "unavailable";

interface CartPageProps {
  products: StoreProduct[];
  /**
   * The signed-in buyer's F-Gas standing, read from the database by the
   * route (lib/fgasAccount) with expiry applied. Null when signed out.
   */
  fgas?: FgasSummary | null;
}

export default function CartPage({ products, fgas = null }: CartPageProps) {
  const t = useTranslations("Cart");
  const tProducts = useTranslations("Products");
  const format = useFormatter();
  const router = useRouter();
  const { status } = useSession();
  const showFgas = useFgasModal((s) => s.show);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // "checkout" carries the buyer straight on after signing in; "inline"
  // (the gate alert's Log In) stays on the cart so the F-Gas rule can be
  // re-evaluated against the fresh session before anything moves.
  const [authIntent, setAuthIntent] = useState<"checkout" | "inline">("checkout");

  const [auditPhase, setAuditPhase] = useState<AuditPhase>("idle");
  const [findings, setFindings] = useState<Array<{ tone: "ok" | "warn"; text: string }>>([]);
  const [suggestions, setSuggestions] = useState<CartAuditSuggestion[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  // The audit result banner can be dismissed; a new run shows it again.
  const [auditCollapsed, setAuditCollapsed] = useState(false);

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);
  const cartQuote = useCartStore((s) => s.quote);
  const tQuotes = useTranslations("Quotes");

  // The cart is rehydrated from localStorage on the client — until then,
  // render the server's empty-cart markup to keep hydration clean.
  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];
  const empty = shownItems.length === 0;

  // Live catalog lookup for the persisted cart lines. Declared up here
  // because both the stock gate and the totals below depend on it.
  const bySku = new Map(products.map((p) => [p.sku, p]));

  // ─── F-Gas gate ───
  // Only a basket holding a fluorinated gas needs a certificate — decided by
  // the substance (lib/fgasSubstances), the same rule checkout and quotes
  // apply on the server; a line we can't find in the catalogue counts as
  // one (fail safe). When it does, the row-backed EFFECTIVE status must be
  // VERIFIED (an expired certificate is EXPIRED). Nothing the browser stores
  // counts: a hand-edited local store grants nothing.
  const signedIn = status === "loading" ? null : status === "authenticated";
  const fgasCleared = signedIn === true && fgas?.status === "VERIFIED";
  const hasGasLines = shownItems.some((i) => {
    const p = bySku.get(i.sku);
    return p ? requiresFgasCertificate(p) : true;
  });
  const fgasOk = !hasGasLines || fgasCleared;
  const openFgas = () => showFgas("cart");

  // A line can go out of stock after it was added (a CRM push, or someone
  // else buying the last cylinder). Checkout is blocked until it's removed;
  // placeOrder would refuse it server-side anyway, so catch it here with an
  // explanation instead of a failed order.
  const blockedLines = shownItems.filter((i) => {
    const product = bySku.get(i.sku);
    return product ? !isPurchasable(product) : false;
  });
  const hasBlockedLines = blockedLines.length > 0;
  const fgasGate = hasGasLines && !fgasCleared ? fgasGateFor(signedIn, fgas) : null;
  const checkoutLocked = empty || !fgasOk || hasBlockedLines;

  const openAuth = (intent: "checkout" | "inline") => {
    setAuthIntent(intent);
    setIsAuthModalOpen(true);
  };

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  // ─── 1-click reorder ───
  // The replenishment email links to /cart?reorder=<sku>&qty=<n>. The line is
  // added from the live catalog (today's price, only if it can be bought) —
  // the link carries a reference, never a price — and the query is then
  // dropped so a refresh doesn't add it twice. Nothing is ordered: the buyer
  // still reviews the cart and checks out.
  const reorderHandled = useRef(false);
  useEffect(() => {
    if (!hydrated || reorderHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const sku = params.get("reorder");
    if (!sku) return;
    reorderHandled.current = true;
    const qty = Math.min(99, Math.max(1, Math.trunc(Number(params.get("qty"))) || 1));
    const product = products.find((p) => p.sku === sku);
    if (product && isPurchasable(product) && product.pricePerKg > 0) {
      addItem(
        {
          sku: product.sku,
          name: product.name,
          variant: product.weightLabel,
          pricePerKg: product.pricePerKg,
          weightKg: product.weightKg,
          deposit: product.cylinderDeposit,
        },
        qty
      );
      toast.success(t("reorderAdded", { qty, name: product.name }));
    } else {
      toast.error(t("reorderUnavailable"));
    }
    router.replace("/cart");
  }, [hydrated, products, addItem, router, t]);

  // Per-kg rate, net weight and deposit come from the live catalog when the
  // product is known — a stale persisted line can't understate the price.
  // …except a basket loaded from a quote, which shows the quote's frozen
  // figures — the ones checkout will charge for it.
  const quote = hydrated ? cartQuote : null;
  const totalLines = shownItems.map((i) => pricingLineFor(i, quote ? null : bySku.get(i.sku)));
  const { count, subtotal, depositUnits, deposit, shipping, vat, total } = calculateCartTotals(totalLines);

  // This line's footprint, from the catalog GWP: net kg × qty × GWP.
  const lineCo2eT = (item: { qty: number }, product?: StoreProduct) =>
    product?.gwp && product.pricedPerKg ? (product.weightKg * item.qty * product.gwp) / 1000 : null;
  // Header metadata: items · net kg of gas · t CO₂e — gas lines only for the last two.
  const netKg = shownItems.reduce((n, i) => {
    const p = bySku.get(i.sku);
    return p?.pricedPerKg ? n + p.weightKg * i.qty : n;
  }, 0);
  const metaLine = [
    t("metaItems", { count }),
    netKg > 0 ? t("metaNetKg", { kg: formatKg(netKg) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const runAudit = async () => {
    if (empty || auditPhase === "thinking") return;
    setAuditPhase("thinking");
    setSuggestionsDismissed(false);
    setAuditCollapsed(false);
    let result: CartAuditResult;
    try {
      result = await auditCart(shownItems.map((i) => ({ sku: i.sku, qty: i.qty })));
    } catch {
      result = { ok: false, code: "UNAVAILABLE" };
    }
    if (!result.ok) {
      setFindings([]);
      setSuggestions([]);
      setAuditPhase("unavailable");
      return;
    }
    setFindings(result.findings);
    setSuggestions(result.suggestions);
    setAuditPhase(result.verdict === "optimisable" ? "optimised" : "compliant");
  };

  const addSuggestion = (sku: string) => {
    const product = bySku.get(sku);
    if (!product) return;
    addItem(
      {
        sku: product.sku,
        name: product.name,
        variant: product.weightLabel,
        pricePerKg: product.pricePerKg,
        weightKg: product.weightKg,
        deposit: product.cylinderDeposit,
      },
      1
    );
  };

  // ─── Quote ───
  // Signed-in only (a quote belongs to an account). Refrigerant lines need a
  // verified certificate, the same rule createQuote enforces server-side;
  // a buyer without one can still quote tools and equipment.
  const [quoting, startQuote] = useTransition();
  const quoteLocked = empty || hasBlockedLines || (status === "authenticated" && hasGasLines && !fgasCleared);
  const QUOTE_ERROR: Record<QuoteErrorCode, string> = {
    UNAUTHENTICATED: "errorSignIn",
    INVALID_INPUT: "errorGeneric",
    PRODUCT_NOT_FOUND: "errorUnavailable",
    PRICE_ON_REQUEST: "errorPriceOnRequest",
    OUT_OF_STOCK: "errorOutOfStock",
    FGAS_UNVERIFIED: "errorFgas",
    RATE_LIMITED: "errorRateLimited",
    FAILED: "errorGeneric",
  };
  const generateQuote = () => {
    if (quoteLocked || quoting) return;
    if (status !== "authenticated") {
      openAuth("inline");
      return;
    }
    startQuote(async () => {
      try {
        const result = await createQuote(shownItems.map((i) => ({ sku: i.sku, qty: i.qty })));
        if (!result.ok) {
          toast.error(tQuotes(QUOTE_ERROR[result.code], { items: (result.skus ?? []).join(", ") }));
          return;
        }
        toast.success(tQuotes("created", { number: result.quoteNumber }));
        router.push(`/profile/quotes/${result.id}`);
      } catch {
        toast.error(tQuotes("errorGeneric"));
      }
    });
  };

  const goToCheckout = () => {
    if (checkoutLocked) return;
    if (status === "authenticated") {
      router.push("/checkout");
    } else {
      openAuth("checkout");
    }
  };

  const thinking = auditPhase === "thinking";
  const optimised = auditPhase === "optimised";
  const audited = auditPhase === "compliant" || auditPhase === "optimised";
  const visibleSuggestions = optimised && !suggestionsDismissed ? suggestions : [];

  const tagChips = (product?: StoreProduct) => {
    if (!product) return [];
    const chips: Array<{ label: string; tone: "warn" | "ok" | "muted" }> = [];
    if (product.gwpClass === "A2L") chips.push({ label: "A2L", tone: "warn" });
    else if (product.gwpClass === "A1") chips.push({ label: "A1", tone: "ok" });
    if (product.gwp !== null) chips.push({ label: `GWP ${product.gwp}`, tone: "muted" });
    if (product.category === "equipment" || product.category === "recovery")
      chips.push({ label: product.type, tone: "muted" });
    return chips;
  };

  const toneCls = {
    warn: "border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.14)] text-[#b45309] dark:text-[#fbbf24]",
    ok: "border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] text-[#047857] dark:text-[#34d399]",
    muted: "border-slate-900/[.07] bg-slate-100 text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted",
  } as const;

  return (
    <div className="flex-1 bg-canvas">
      <div className="hidden md:block">
        <Header onSignInClick={() => openAuth("inline")} />

        <div className="relative overflow-x-clip">
          {/* Ambient glow field from the design: cyan / violet / blue orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
            <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.16] blur-[120px]" />
          </div>

          <motion.main
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto max-w-7xl px-8 pb-24 pt-9"
          >
            {/* ── Header bar: what is in the cart · the tools that act on it ── */}
            <div className={`mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${empty ? "mx-auto max-w-3xl" : ""}`}>
              <div className="min-w-0">
                <h1 className="m-0 text-[34px] font-semibold leading-[1.1] tracking-[-.04em]">{empty ? t("headEmpty") : t("yourCart")}</h1>
                <p className="m-0 mt-2 text-[14px] text-slate-500 tabular-nums dark:text-ink-muted" data-cart-meta>
                  {empty ? t("sublineEmpty") : metaLine}
                </p>
              </div>
              {!empty && (
                <div className="flex flex-wrap items-center gap-2" data-cart-toolbar>
                  <button
                    type="button"
                    onClick={runAudit}
                    disabled={thinking}
                    data-audit-run
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 text-[13px] font-semibold tracking-[-.01em] text-slate-800 transition-colors hover:bg-slate-900/[.04] disabled:opacity-70 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]"
                  >
                    {thinking ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} strokeWidth={2} />}
                    {thinking ? t("auditAnalysing") : audited ? t("auditRerun") : t("auditRun")}
                  </button>
                </div>
              )}
            </div>

            {empty ? (
              /* Empty: one centred workspace — back to the catalogue, the fast
                 track from a spec / BOM, and what every order comes with. */
              <div className="mx-auto flex max-w-3xl flex-col gap-4" data-cart-empty>
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-[24px] border border-dashed border-slate-900/[.14] bg-white/70 px-7 py-12 text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass"
                >
                  <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-[26px] border border-slate-900/[.07] bg-slate-100 dark:border-hairline dark:bg-surface-3">
                    <ShoppingCart size={32} strokeWidth={1.7} className="text-blue-700 dark:text-blue-400" />
                  </span>
                  <div className="mt-5 text-[22px] font-semibold tracking-[-.035em]">{t("cartEmptyShort")}</div>
                  <p className="mx-auto mb-6 mt-2.5 max-w-[380px] text-[13.5px] leading-[1.62] text-slate-600 dark:text-ink-muted">{t("emptyBody")}</p>
                  <Link
                    href="/products"
                    className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[14px] bg-blue-700 px-6 text-[14.5px] font-semibold tracking-[-.02em] text-white transition-colors hover:bg-blue-800"
                  >
                    {t("exploreProducts")}
                    <ArrowRight size={16} strokeWidth={2} />
                  </Link>
                </motion.div>
                <SmartOrderButton variant="panel" source="cart" />
                <div className="grid grid-cols-3 gap-3" data-cart-trust>
                  {TRUST.map(({ icon: Icon, short, long }) => (
                    <span
                      key={short}
                      title={t(long)}
                      className="flex items-center gap-2.5 rounded-[14px] border border-slate-900/[.07] bg-white/60 px-4 py-3 text-[12px] leading-[1.4] text-slate-600 backdrop-blur-xl dark:border-hairline dark:bg-glass dark:text-ink-muted"
                    >
                      <Icon size={15} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                      {t(long)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
                {/* ─── left: the lines ─── */}
                <div className="min-w-0 lg:col-span-8">
                  {/* AI audit result — only after a real run, dismissible */}
                  <AnimatePresence initial={false}>
                    {(audited || auditPhase === "unavailable") && !auditCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        data-cart-audit
                        className={`mb-4 rounded-[18px] border px-4 py-3.5 ${
                          optimised
                            ? "border-violet-500/30 bg-violet-500/[.07]"
                            : auditPhase === "unavailable"
                              ? "border-slate-900/[.1] bg-white/70 dark:border-white/[.1] dark:bg-white/[.04]"
                              : "border-emerald-500/30 bg-emerald-500/[.07]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Sparkles size={16} strokeWidth={2} className={`mt-0.5 flex-none ${optimised ? "text-violet-600 dark:text-violet-300" : "text-emerald-600 dark:text-emerald-400"}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-semibold tracking-[-.015em]" data-audit-title>
                              {optimised
                                ? t("auditTitleOptimised", { count: suggestions.length })
                                : auditPhase === "compliant"
                                  ? t("auditTitleCompliant")
                                  : t("auditUnavailable")}
                            </div>
                            {findings.length > 0 && (
                              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0" data-audit-findings>
                                {findings.map((f) => (
                                  <li key={f.text} className="flex items-start gap-2 text-[12.5px] leading-[1.5] text-slate-600 dark:text-ink-muted">
                                    {f.tone === "warn" ? (
                                      <TriangleAlert size={13} strokeWidth={2} className="mt-[3px] flex-none text-amber-600 dark:text-amber-400" />
                                    ) : (
                                      <Check size={13} strokeWidth={2.4} className="mt-[3px] flex-none text-emerald-600 dark:text-emerald-400" />
                                    )}
                                    {f.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setAuditCollapsed(true)}
                            aria-label={t("dismiss")}
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-slate-400 hover:bg-slate-900/[.06] dark:hover:bg-white/10"
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* One surface, one row per line: image · identity · quantity · price */}
                  <div className="overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/75 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.03]" data-cart-lines>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {shownItems.map((item) => {
                        const product = bySku.get(item.sku);
                        const tint = tintFor(product);
                        const pricing = pricingLineFor(item, quote ? null : product);
                        const unit = lineUnitPrice(pricing);
                        // Equipment is priced per unit — no "€/kg × kg" story to tell.
                        const showBreakdown = product ? product.pricedPerKg : pricing.weightKg !== 1;
                        const chips = tagChips(product);
                        const co2eT = lineCo2eT(item, product);
                        return (
                          <motion.div
                            key={item.sku}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: 30, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            data-cart-line={item.sku}
                            className="grid grid-cols-[64px_minmax(0,1fr)_auto_170px_36px] items-center gap-4 border-b border-slate-900/[.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-slate-900/[.02] dark:border-white/[.06] dark:hover:bg-white/[.03]"
                          >
                            {/* 1 · visual */}
                            <span
                              className="relative h-16 w-16 overflow-hidden rounded-2xl border bg-slate-50 dark:bg-white/[.04]"
                              style={{ borderColor: `${tint}55` }}
                              data-line-thumb
                            >
                              <ProductThumbnail
                                sku={item.sku}
                                name={item.name}
                                sizes="64px"
                                className="absolute inset-1.5"
                                fallback={
                                  <span className="flex h-full w-full items-center justify-center rounded-xl" style={{ background: `${tint}1f` }}>
                                    <Package size={22} strokeWidth={1.8} style={{ color: tint }} />
                                  </span>
                                }
                              />
                            </span>

                            {/* 2 · identity */}
                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-semibold tracking-[-.025em]">{item.name}</div>
                              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
                                {t("skuLine", { variant: item.variant, sku: item.sku })}
                              </div>
                              {(chips.length > 0 || co2eT !== null) && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {chips.map((chip) => (
                                    <span key={chip.label} className={`inline-flex items-center rounded-full border px-2 py-px text-[10.5px] font-semibold ${toneCls[chip.tone]}`}>
                                      {chip.label}
                                    </span>
                                  ))}
                                  {co2eT !== null && (
                                    <span className={`inline-flex items-center rounded-full border px-2 py-px text-[10.5px] font-semibold tabular-nums ${toneCls.muted}`} data-line-co2e>
                                      {t("co2eTonnes", { value: format.number(co2eT, { maximumFractionDigits: 2 }) })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 3 · quantity */}
                            <div className="flex h-9 items-center gap-0.5 rounded-full border border-slate-900/[.1] bg-slate-50 px-0.5 dark:border-white/[.12] dark:bg-white/[.05]">
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => decrement(item.sku)}
                                aria-label={t("decreaseQtyAria", { item: item.name })}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/[.07] dark:text-slate-300 dark:hover:bg-white/10"
                              >
                                <Minus size={13} strokeWidth={2.2} />
                              </motion.button>
                              <span className="min-w-[24px] text-center text-sm font-semibold tabular-nums" data-line-qty>
                                {item.qty}
                              </span>
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => increment(item.sku)}
                                aria-label={t("increaseQtyAria", { item: item.name })}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/[.07] dark:text-slate-300 dark:hover:bg-white/10"
                              >
                                <Plus size={13} strokeWidth={2.2} />
                              </motion.button>
                            </div>

                            {/* 4 · price — the maths behind it, and the deposit */}
                            <div className="text-right">
                              <div className="text-[16px] font-semibold tracking-[-.03em] tabular-nums" data-line-total>
                                {eur(unit * item.qty)}
                              </div>
                              <div className="truncate text-[11.5px] leading-[1.45] text-slate-500 dark:text-ink-muted" data-line-breakdown>
                                {showBreakdown
                                  ? t("lineBreakdownShort", { perKg: eur(pricing.pricePerKg), weight: formatKg(pricing.weightKg) })
                                  : `${eur(unit)} ${t("eachSuffix")}`}
                              </div>
                              {(pricing.deposit ?? 0) > 0 && (
                                // Wraps rather than clips: ~40 characters in some languages.
                                <div className="text-[11.5px] leading-[1.35] text-emerald-700 dark:text-emerald-400" data-line-deposit>
                                  {t("depositEach", { amount: eur(pricing.deposit ?? 0) })}
                                </div>
                              )}
                            </div>

                            {/* remove — always visible */}
                            <button
                              type="button"
                              onClick={() => removeItem(item.sku)}
                              aria-label={t("removeItemAria", { item: item.name })}
                              title={t("removeItemAria", { item: item.name })}
                              data-line-remove
                              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/[.1] hover:text-red-600 dark:text-ink-muted dark:hover:text-red-400"
                            >
                              <Trash2 size={15} strokeWidth={2} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>

                    {/* footer: back to the catalogue · bulk import · clear */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/[.06] bg-slate-900/[.015] px-5 py-3 dark:border-white/[.06] dark:bg-white/[.02]" data-cart-lines-footer>
                      <Link href="/products" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-ink-muted dark:hover:text-slate-100">
                        <ArrowLeft size={14} strokeWidth={2} />
                        {t("continueShopping")}
                      </Link>
                      <div className="flex flex-wrap items-center gap-3">
                        <SmartOrderButton variant="link" source="cart" label={t("bulkFormats")} className="text-[13px]" />
                      <button
                        type="button"
                        onClick={() => {
                          clear();
                          setAuditPhase("idle");
                          setFindings([]);
                          setSuggestions([]);
                        }}
                        data-clear-cart
                        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-red-500/[.08] hover:text-red-600 dark:text-ink-muted dark:hover:text-red-400"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                        {t("clearCart")}
                      </button>
                      </div>
                    </div>
                  </div>

                    {/* AI suggested additions — populated only by a real audit run */}
                    <AnimatePresence>
                      {visibleSuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 18, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                          data-ai-suggestions
                          className="mt-1.5 rounded-3xl border border-[rgba(124,58,237,.3)] bg-white/70 p-5 shadow-[0_0_30px_-14px_rgba(124,58,237,.5)] backdrop-blur-xl backdrop-saturate-150 dark:bg-glass"
                        >
                          <div className="mb-3.5 flex items-baseline justify-between gap-3.5">
                            <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                              {t("suggestKicker")}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSuggestionsDismissed(true)}
                              className="text-[11.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:text-ink-muted dark:hover:text-slate-300"
                            >
                              {t("dismiss")}
                            </button>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            {visibleSuggestions.map((s) => {
                              const product = bySku.get(s.sku);
                              if (!product) return null;
                              const Icon = SUGGEST_ICON[product.category] ?? Sparkles;
                              const inCart = shownItems.some((i) => i.sku === s.sku);
                              return (
                                <div
                                  key={s.sku}
                                  data-suggestion={s.sku}
                                  className="flex items-center gap-3 rounded-[18px] border border-slate-900/[.07] bg-slate-100 p-[13px] dark:border-hairline dark:bg-surface-3"
                                >
                                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[rgba(167,139,250,.34)] bg-[rgba(124,58,237,.16)]">
                                    <Icon size={16} strokeWidth={2} className="text-[#6d28d9] dark:text-[#c4b5fd]" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-semibold tracking-[-.02em]">{product.name}</span>
                                    <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-slate-400 dark:text-ink-muted">
                                      {s.reason}
                                    </span>
                                  </span>
                                  <span className="flex flex-none items-center gap-2.5">
                                    <span className="text-right">
                                      <span className="block text-[13px] font-semibold tracking-[-.02em]">{eur(product.cylinderPrice)}</span>
                                      {product.pricedPerKg && (
                                        <span className="block text-[10.5px] text-slate-400 dark:text-ink-muted">
                                          {eur(product.pricePerKg)} {tProducts("perKgSuffix")}
                                        </span>
                                      )}
                                    </span>
                                    <motion.button
                                      type="button"
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => addSuggestion(s.sku)}
                                      disabled={inCart}
                                      className={`h-[34px] flex-none rounded-[11px] px-3.5 text-xs font-semibold tracking-[-.01em] transition-colors ${
                                        inCart
                                          ? "bg-green-600 text-white"
                                          : "border border-slate-900/[.14] text-slate-900 hover:bg-slate-900/[.04] dark:border-hairline-strong dark:text-slate-50 dark:hover:bg-white/[.06]"
                                      }`}
                                    >
                                      {inCart ? t("added") : t("add")}
                                    </motion.button>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                </div>

                {/* ─── right: ONE summary card ─── */}
                <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-order-summary-card>
                  <div className="rounded-[22px] border border-slate-900/[.1] bg-white/80 p-5 shadow-[0_24px_60px_-44px_rgba(2,4,10,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.1] dark:bg-white/[.04]">
                    <h2 className="m-0 mb-4 text-[12px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-ink-muted">{t("orderSummary")}</h2>

                    {/* 1 · breakdown */}
                    <dl className="m-0 flex flex-col gap-2.5 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-slate-600 dark:text-ink-muted">{t("subtotal")}</dt>
                        <dd className="m-0 font-semibold tabular-nums" data-summary-subtotal>{eur(subtotal)}</dd>
                      </div>
                      {/* mandatory cylinder deposit — its own line, never blended into the gas price */}
                      {deposit > 0 && (
                        <div className="flex items-baseline justify-between gap-3" data-summary-deposit>
                          <dt className="min-w-0 text-slate-600 dark:text-ink-muted">
                            {t("cylinderDeposit")}
                            <span className="ml-1.5 text-[11.5px] text-slate-400 dark:text-ink-muted/80">· {t("depositUnitsShort", { count: depositUnits })}</span>
                          </dt>
                          <dd className="m-0 flex-none font-semibold tabular-nums">{eur(deposit)}</dd>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-slate-600 dark:text-ink-muted">{t("freightAdr")}</dt>
                        <dd className="m-0 font-semibold tabular-nums" data-summary-shipping>{eur(shipping)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-slate-600 dark:text-ink-muted">{t("vat20")}</dt>
                        <dd className="m-0 font-semibold tabular-nums">{eur(vat)}</dd>
                      </div>
                    </dl>

                    {/* 2 · total, one baseline */}
                    <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-slate-900/[.08] pt-4 dark:border-white/[.08]" data-summary-total-row>
                      <span className="text-[15px] font-semibold tracking-[-.02em]">{t("total")}</span>
                      <span className="text-[28px] font-semibold tracking-[-.04em] tabular-nums" data-summary-total>
                        {eur(total)}
                      </span>
                    </div>

                    <QuoteCartBanner className="mt-3" />

                  {/* A line that went out of stock after it was added blocks checkout */}
                  <AnimatePresence initial={false}>
                    {hasBlockedLines && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        role="alert"
                        data-cart-oos
                        className="relative mt-3 overflow-hidden rounded-[18px] border border-red-500/35 bg-red-500/[.10] p-4 shadow-[0_0_34px_-12px_rgba(239,68,68,.75)] backdrop-blur-xl backdrop-saturate-150"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,#f87171,transparent_68%)] opacity-40 blur-[40px]"
                        />
                        <div className="relative flex items-start gap-3">
                          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-[linear-gradient(140deg,#dc2626,#f87171)] text-white shadow-[0_12px_26px_-12px_rgba(239,68,68,.95)]">
                            <PackageX size={17} strokeWidth={2.2} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-[13px] font-semibold leading-[1.35] text-red-700 dark:text-red-300">
                              {tProducts("outOfStockNotice")}
                            </p>
                            <p className="mb-0 mt-1 text-[11.5px] leading-[1.5] text-slate-600 dark:text-ink-muted">
                              {t("cartOosBody", { items: blockedLines.map((l) => l.name).join(", ") })}
                            </p>
                            <button
                              type="button"
                              onClick={() => blockedLines.forEach((l) => removeItem(l.sku))}
                              data-cart-oos-remove
                              className="mt-2.5 inline-flex h-9 items-center justify-center rounded-[11px] bg-red-600 px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-500"
                            >
                              {t("cartOosRemove", { count: blockedLines.length })}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                    {/* 3 · F-Gas status — compact */}
                    <AnimatePresence mode="wait" initial={false}>
                      {fgasGate && (
                        <div key={fgasGate} className="mt-3">
                          <FgasGateAlert gate={fgasGate} fgas={fgas} compact onLogIn={() => openAuth("inline")} onUpload={openFgas} />
                        </div>
                      )}
                      {hasGasLines && fgasCleared && (
                        <div key="verified" className="mt-3">
                          <FgasVerifiedLine fgas={fgas} compact />
                        </div>
                      )}
                    </AnimatePresence>

                    {/* 4 · actions */}
                    <motion.button
                      type="button"
                      whileTap={checkoutLocked ? undefined : { scale: 0.98 }}
                      disabled={checkoutLocked}
                      aria-disabled={checkoutLocked}
                      title={checkoutLocked ? t("fgasLockedAria") : undefined}
                      onClick={goToCheckout}
                      data-checkout-cta
                      data-checkout-locked={checkoutLocked ? "true" : undefined}
                      className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[15px] font-semibold tracking-[-.02em] text-white transition-[background-color,opacity] ${
                        checkoutLocked ? "cursor-not-allowed opacity-45 saturate-[.55]" : "hover:bg-blue-800"
                      }`}
                    >
                      {t("proceedToCheckout")}
                      {checkoutLocked ? <Lock size={16} strokeWidth={2.2} /> : <ArrowRight size={17} strokeWidth={2} />}
                    </motion.button>

                    {/* Secondary: the same basket as a formal 48-hour quote. A
                        basket that already is a quote links back to it. */}
                    {quote ? (
                      <Link
                        href={`/profile/quotes/${quote.id}`}
                        data-view-quote
                        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-slate-900/[.12] text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]"
                      >
                        <FileText size={14} strokeWidth={2} />
                        {tQuotes("viewQuote", { number: quote.quoteNumber })}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={generateQuote}
                        disabled={quoteLocked || quoting}
                        title={quoteLocked && hasGasLines && !fgasCleared ? tQuotes("lockedFgas") : undefined}
                        data-generate-quote
                        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-slate-900/[.12] text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]"
                      >
                        {quoting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} strokeWidth={2} />}
                        {quoting ? tQuotes("generating") : tQuotes("generate")}
                      </button>
                    )}

                    {/* 5 · trust, one row inside the card */}
                    {/* Three fixed columns: always one row; a long translation takes a
                        second line inside its own cell instead of pushing a chip down. */}
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-900/[.07] pt-3.5 dark:border-white/[.07]" data-cart-trust-chips>
                      {TRUST.map(({ icon: Icon, short, long }) => (
                        <span key={short} title={t(long)} className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium leading-tight text-slate-500 dark:text-ink-muted">
                          <Icon size={12} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                          {t(short)}
                        </span>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </motion.main>
        </div>
      </div>

      <div className="block md:hidden">
        <MobileCartLayout
          products={products}
          onCheckout={goToCheckout}
          onGenerateQuote={generateQuote}
          quoteLocked={quoteLocked}
          quoting={quoting}
          fgasGate={fgasGate}
          checkoutLocked={checkoutLocked}
          fgasVerified={hasGasLines && fgasCleared}
          fgas={fgas}
          onLogIn={() => openAuth("inline")}
          onUploadCertificate={openFgas}
        />
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        callbackUrl={authIntent === "checkout" ? "/checkout" : undefined}
      />

    </div>
  );
}
