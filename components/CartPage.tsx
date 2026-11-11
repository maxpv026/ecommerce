"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
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
  Sparkles,
  Trash2,
  TriangleAlert,
  Truck,
  Wrench,
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
import { FREE_FREIGHT_THRESHOLD, calculateCartTotals, lineUnitPrice, pricingLineFor } from "@/lib/cart";
import { formatKg } from "@/lib/pricing";
import { isPurchasable } from "@/lib/waitlist";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { auditCart, type CartAuditResult, type CartAuditSuggestion } from "@/lib/actions/cartAudit";
import { createQuote, type QuoteErrorCode } from "@/lib/actions/quotes";
import type { StoreProduct } from "@/lib/data";

const ACCENT = "#1d4ed8";

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
  const [hovered, setHovered] = useState<string | null>(null);
  const [trashHover, setTrashHover] = useState<string | null>(null);

  const [auditPhase, setAuditPhase] = useState<AuditPhase>("idle");
  const [findings, setFindings] = useState<Array<{ tone: "ok" | "warn"; text: string }>>([]);
  const [suggestions, setSuggestions] = useState<CartAuditSuggestion[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

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

  // Entrance stagger applies to the first paint only; lines added later
  // (AI suggestions) rise immediately.
  const [initialStagger, setInitialStagger] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setInitialStagger(false), 900);
    return () => clearTimeout(id);
  }, []);

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
  const freeFreight = subtotal >= FREE_FREIGHT_THRESHOLD && subtotal > 0;
  // Goods subtotal against the free-freight threshold — the same rule
  // calculateCartTotals applies (deposit and VAT don't count towards it).
  const freightProgress = Math.min(1, subtotal / FREE_FREIGHT_THRESHOLD);

  const runAudit = async () => {
    if (empty || auditPhase === "thinking") return;
    setAuditPhase("thinking");
    setSuggestionsDismissed(false);
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
            <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.26] blur-[120px] [animation:hc-breathe_9s_ease-in-out_infinite]" />
            <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.22] blur-[120px] [animation:hc-breathe_12s_ease-in-out_infinite_reverse]" />
            <div className="absolute -bottom-[180px] right-[6%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),rgba(37,99,235,0)_68%)] opacity-20 blur-[110px] [animation:hc-float_34s_ease-in-out_infinite]" />
          </div>

          <motion.main
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto max-w-[1320px] px-8 pb-[120px] pt-11"
          >
            {/* head — on the same 7/5 grid as the content below, so "Clear
                cart" lands at the right edge of the item column and the
                freight progress sits over the summary. */}
            <div className={`mb-[30px] grid grid-cols-1 gap-5 ${empty ? "" : "lg:grid-cols-12"} lg:items-end`}>
              <div className={empty ? "mx-auto w-full max-w-3xl" : "min-w-0 lg:col-span-7"}>
                <div className="mb-3 text-xs tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("eyebrow")}</div>
                <h1 className="m-0 text-[40px] font-semibold leading-[1.05] tracking-[-.045em]">
                  {empty ? t("headEmpty") : t("yourCart")}
                </h1>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="m-0 text-[14.5px] leading-[1.6] text-slate-600 dark:text-ink-muted">
                    {empty ? t("sublineEmpty") : t("sublineCount", { count })}
                  </p>
                  {!empty && (
                    <button
                      type="button"
                      onClick={() => {
                        clear();
                        setAuditPhase("idle");
                        setFindings([]);
                        setSuggestions([]);
                      }}
                      data-clear-cart
                      className="flex-none text-[13px] font-medium text-slate-500 underline-offset-4 transition-colors hover:text-red-600 hover:underline dark:text-ink-muted dark:hover:text-red-400"
                    >
                      {t("clearCart")}
                    </button>
                  )}
                </div>
              </div>

              {/* Free ADR freight: how far this basket is from it, or that it applies. */}
              {!empty && (
                <div className="min-w-0 lg:col-span-5" data-freight-progress={Math.round(freightProgress * 100)}>
                  {freeFreight ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-600/25 bg-emerald-50 py-2 pl-3 pr-4 text-xs font-semibold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <Check size={14} strokeWidth={2.6} />
                      {t("badgeFreightFree")}
                    </span>
                  ) : (
                    <div className="rounded-[16px] border border-slate-900/[.08] bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-hairline dark:bg-glass">
                      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                          <Truck size={14} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
                          {t("freightToGo", { amount: eur(FREE_FREIGHT_THRESHOLD - subtotal) })}
                        </span>
                        <span className="flex-none text-[11.5px] text-slate-400 tabular-nums dark:text-ink-muted">
                          {eur(subtotal)} / {eur(FREE_FREIGHT_THRESHOLD)}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-900/[.07] dark:bg-white/[.08]"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(freightProgress * 100)}
                        aria-label={t("freightProgressAria")}
                      >
                        <span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${freightProgress * 100}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {empty ? (
              /* Empty: one centred workspace — the way back to the catalogue,
                 the fast track from a spec / BOM, and what every order comes
                 with. No summary of zeros, no audit of nothing. */
              <div className="mx-auto flex max-w-3xl flex-col gap-4" data-cart-empty>
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-[28px] border border-dashed border-slate-900/[.14] bg-white/70 px-7 py-12 text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass"
                >
                  <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-[28px] border border-slate-900/[.07] bg-slate-100 [animation:hc-bob_6s_ease-in-out_infinite] dark:border-hairline dark:bg-surface-3">
                    <span className="pointer-events-none absolute -inset-[30px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_68%)] opacity-50 blur-[34px] [animation:hc-breathe_5s_ease-in-out_infinite]" />
                    <ShoppingCart size={32} strokeWidth={1.7} className="relative text-blue-700 dark:text-blue-400" />
                  </span>
                  <div className="mt-5 text-[23px] font-semibold tracking-[-.04em]">{t("cartEmptyShort")}</div>
                  <p className="mx-auto mb-6 mt-2.5 max-w-[380px] text-[13.5px] leading-[1.62] text-slate-600 dark:text-ink-muted">{t("emptyBody")}</p>
                  <Link
                    href="/products"
                    className="inline-flex h-[50px] items-center justify-center gap-2.5 rounded-2xl bg-blue-700 px-[26px] text-[14.5px] font-semibold tracking-[-.02em] text-white shadow-[0_22px_46px_-18px_var(--glow-700),0_0_30px_-10px_var(--glow-700)] transition-colors hover:bg-blue-800"
                  >
                    {t("exploreProducts")}
                    <ArrowRight size={16} strokeWidth={2} />
                  </Link>
                </motion.div>
                <SmartOrderButton variant="panel" source="cart" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-cart-trust>
                  {[
                    { icon: FlaskConical, label: t("assuranceCoa") },
                    { icon: Truck, label: t("assuranceFreight") },
                    { icon: Lock, label: t("assuranceFgas") },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      className="flex items-center gap-2.5 rounded-[16px] border border-slate-900/[.07] bg-white/60 px-4 py-3 text-[12px] leading-[1.4] text-slate-600 backdrop-blur-xl dark:border-hairline dark:bg-glass dark:text-ink-muted"
                    >
                      <Icon size={15} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
              {/* ─── list column ─── */}
              <div className="min-w-0 lg:col-span-7">
                {!empty && (
                  <div className="flex flex-col gap-3.5">
                    <AnimatePresence mode="popLayout">
                      {shownItems.map((item, idx) => {
                        const product = bySku.get(item.sku);
                        const tint = tintFor(product);
                        const pricing = pricingLineFor(item, quote ? null : product);
                        const unit = lineUnitPrice(pricing);
                        // Equipment is priced per unit — no "€/kg × kg" story to tell.
                        const showBreakdown = product ? product.pricedPerKg : pricing.weightKg !== 1;
                        const on = hovered === item.sku;
                        const trashOn = trashHover === item.sku;
                        const chips = tagChips(product);
                        // This line's footprint, from the catalog GWP: net kg × qty × GWP.
                        const co2eT = product?.gwp && product.pricedPerKg ? (pricing.weightKg * item.qty * product.gwp) / 1000 : null;
                        return (
                          <motion.div
                            key={item.sku}
                            layout
                            initial={{ opacity: 0, y: 18, scale: 0.97 }}
                            animate={{
                              opacity: 1, y: 0, scale: 1,
                              transition: {
                                duration: 0.55,
                                ease: [0.16, 1, 0.3, 1],
                                delay: initialStagger ? idx * 0.06 : 0,
                              },
                            }}
                            exit={{ opacity: 0, x: 38, scale: 0.94, transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
                            data-cart-line={item.sku}
                            onMouseEnter={() => setHovered(item.sku)}
                            onMouseLeave={() => setHovered(null)}
                            whileHover={{ scale: 1.006 }}
                            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border bg-white/70 p-4 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:bg-glass"
                            style={{
                              borderColor: on ? "rgba(96,165,250,.44)" : "var(--hc-cat-border, rgba(15,23,42,.07))",
                              boxShadow: on
                                ? "0 38px 76px -44px rgba(2,4,10,.62), 0 0 26px -8px rgba(59,130,246,.44)"
                                : "0 16px 40px -36px rgba(2,4,10,.5)",
                            }}
                          >
                            {/* per-line tint aura */}
                            <span
                              className="pointer-events-none absolute -top-[120%] right-[-14%] h-[300px] w-[300px] rounded-full blur-[66px] transition-opacity duration-300"
                              style={{ background: `radial-gradient(circle,${tint},transparent 68%)`, opacity: on ? 0.24 : 0.09 }}
                            />

                            {/* thumbnail — the cylinder render; a gas-tinted tile when there is none */}
                            <span
                              className="relative h-16 w-16 flex-none overflow-hidden rounded-2xl border bg-slate-50 dark:bg-surface-3"
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

                            {/* name · spec · pills */}
                            <div className="relative min-w-0 flex-1">
                              <div className="truncate text-[15px] font-semibold tracking-[-.028em]">{item.name}</div>
                              <div className="mt-0.5 truncate text-[11.5px] text-slate-400 dark:text-ink-muted">
                                {t("skuLine", { variant: item.variant, sku: item.sku })}
                              </div>
                              {(chips.length > 0 || co2eT !== null) && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {chips.map((chip) => (
                                    <span key={chip.label} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${toneCls[chip.tone]}`}>
                                      {chip.label}
                                    </span>
                                  ))}
                                  {co2eT !== null && (
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${toneCls.muted}`} data-line-co2e>
                                      {t("co2eTonnes", { value: format.number(co2eT, { maximumFractionDigits: 2 }) })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* stepper · price · remove */}
                            <div className="relative flex flex-none items-center gap-4">
                              <div className="flex h-9 items-center gap-0.5 rounded-[12px] border border-slate-900/[.07] bg-slate-100 px-0.5 dark:border-hairline dark:bg-surface-3">
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => decrement(item.sku)}
                                  aria-label={t("decreaseQtyAria", { item: item.name })}
                                  className="flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-600 hover:bg-white dark:text-ink-muted dark:hover:bg-white/10"
                                >
                                  <Minus size={13} strokeWidth={2.2} />
                                </motion.button>
                                <span className="min-w-[26px] text-center text-sm font-semibold tabular-nums" data-line-qty>
                                  {item.qty}
                                </span>
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => increment(item.sku)}
                                  aria-label={t("increaseQtyAria", { item: item.name })}
                                  className="flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-600 hover:bg-white dark:text-ink-muted dark:hover:bg-white/10"
                                >
                                  <Plus size={13} strokeWidth={2.2} />
                                </motion.button>
                              </div>
                              <span className="w-[170px] text-right">
                                <span className="block text-[17px] font-semibold tracking-[-.035em] tabular-nums" data-line-total>
                                  {eur(unit * item.qty)}
                                </span>
                                {/* the maths behind the figure: €/kg × net kg = one cylinder, + deposit */}
                                <span className="block truncate text-[11px] leading-[1.45] text-slate-400 dark:text-ink-muted" data-line-breakdown>
                                  {showBreakdown
                                    ? t("lineBreakdownShort", { perKg: eur(pricing.pricePerKg), weight: formatKg(pricing.weightKg) })
                                    : `${eur(unit)} ${t("eachSuffix")}`}
                                </span>
                                {(pricing.deposit ?? 0) > 0 && (
                                  /* Wraps rather than clips: the deposit line runs to ~40 characters in some languages. */
                                  <span className="block text-[11px] leading-[1.35] text-emerald-700 dark:text-emerald-300/90" data-line-deposit>
                                    {t("depositEach", { amount: eur(pricing.deposit ?? 0) })}
                                  </span>
                                )}
                              </span>
                              {/* Revealed on hover/focus; always shown where there is no hover. */}
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => removeItem(item.sku)}
                                onMouseEnter={() => setTrashHover(item.sku)}
                                onMouseLeave={() => setTrashHover(null)}
                                aria-label={t("removeItemAria", { item: item.name })}
                                data-line-remove
                                className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] opacity-0 transition-[opacity,background-color,color] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${
                                  trashOn ? "bg-red-500/[.14] text-red-500" : "text-slate-400 dark:text-ink-muted"
                                }`}
                              >
                                <Trash2 size={15} strokeWidth={2} />
                              </motion.button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>

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
                )}

                {/* Foot of the list column, not a full-width band above it.
                    It used to sit above the line items on the argument that
                    pasting a message is how an order starts — but at full
                    width it pushed the cart itself below the fold, so the
                    page led with an input instead of with what the buyer came
                    to check. Here it reads as "add more to this cart", which
                    is what it actually does, and it inherits the column width
                    so it lines up with the items above it. */}
                <div className="mt-5">
                  <SmartOrderButton variant="panel" source="cart" />
                </div>
              </div>

              {/* ─── summary column ─── */}
              <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[94px] lg:col-span-5">
                {/* AI compliance & compatibility audit */}
                <div
                  data-cart-audit
                  className="relative w-full overflow-hidden rounded-[26px] p-[1.5px]"
                  style={
                    thinking
                      ? {
                          background: `linear-gradient(90deg,${ACCENT},#22d3ee,#7c3aed,${ACCENT})`,
                          backgroundSize: "300% 100%",
                          animation: "hc-sweep 2.4s linear infinite",
                        }
                      : {
                          background: optimised
                            ? "rgba(124,58,237,.34)"
                            : audited
                              ? "rgba(16,185,129,.3)"
                              : "var(--hc-cat-border, rgba(15,23,42,.07))",
                        }
                  }
                >
                  <div className="relative rounded-[24.5px] bg-white/90 p-[22px] backdrop-blur-xl backdrop-saturate-150 dark:bg-[#141518]/90">
                    <div className="flex items-start gap-[13px]">
                      <motion.span
                        animate={thinking ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                        transition={thinking ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                        className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,var(--glow-600),#7c3aed)] shadow-[0_14px_28px_-14px_rgba(37,99,235,.7)]"
                      >
                        <Sparkles size={19} strokeWidth={2} className="text-white" />
                      </motion.span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1.5 block text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                          {t("auditKicker")}
                        </span>
                        <span className="block text-sm font-semibold leading-[1.35] tracking-[-.025em]" data-audit-title>
                          {empty
                            ? t("auditTitleEmpty")
                            : optimised
                              ? t("auditTitleOptimised", { count: suggestions.length })
                              : auditPhase === "compliant"
                                ? t("auditTitleCompliant")
                                : auditPhase === "unavailable"
                                  ? t("auditUnavailable")
                                  : t("auditTitleIdle")}
                        </span>
                      </span>
                    </div>

                    {/* verdict pill (only after a real run) */}
                    {audited && !empty && (
                      <div
                        className={`mt-4 inline-flex items-center gap-2 rounded-full border py-[7px] pl-2.5 pr-[13px] text-[11.5px] font-semibold ${
                          optimised
                            ? "border-[rgba(167,139,250,.36)] bg-[rgba(124,58,237,.16)] text-[#6d28d9] shadow-[0_0_20px_-6px_#7c3aed] dark:text-[#c4b5fd]"
                            : "border-[rgba(16,185,129,.3)] bg-[rgba(16,185,129,.14)] text-[#047857] shadow-[0_0_20px_-6px_#34d399] dark:text-[#34d399]"
                        }`}
                        data-audit-pill
                      >
                        <span
                          className="h-1.5 w-1.5 flex-none rounded-full"
                          style={{
                            background: optimised ? "#a78bfa" : "#34d399",
                            boxShadow: `0 0 8px 1px ${optimised ? "#a78bfa" : "#34d399"}`,
                          }}
                        />
                        {optimised ? t("auditPillOptimised", { count: suggestions.length }) : t("auditPillVerified")}
                      </div>
                    )}

                    {/* thinking dots */}
                    {thinking && (
                      <div className="mt-4 flex items-center gap-1.5">
                        {[0, 0.16, 0.32].map((d) => (
                          <span
                            key={d}
                            className="h-[5px] w-[5px] rounded-full bg-blue-700 dark:bg-blue-400"
                            style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }}
                          />
                        ))}
                        <span className="ml-1 text-xs text-slate-400 dark:text-ink-muted">{t("auditThinkingNote")}</span>
                      </div>
                    )}

                    {/* findings from the live model run */}
                    {audited && findings.length > 0 && (
                      <div className="mt-4 flex flex-col gap-2.5" data-audit-findings>
                        {findings.map((f) => (
                          <span key={f.text} className="flex items-start gap-[9px]">
                            {f.tone === "warn" ? (
                              <TriangleAlert size={14} strokeWidth={2} className="mt-0.5 flex-none text-[#b45309] dark:text-[#fbbf24]" />
                            ) : (
                              <Check size={14} strokeWidth={2.4} className="mt-0.5 flex-none text-[#047857] dark:text-[#34d399]" />
                            )}
                            <span className="min-w-0 flex-1 text-xs leading-[1.55] text-slate-600 dark:text-ink-muted">
                              {f.text}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {!empty && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={runAudit}
                        disabled={thinking}
                        data-audit-run
                        className={`mt-[18px] flex h-[46px] w-full items-center justify-center gap-[9px] rounded-[15px] bg-slate-100 text-[13px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-200 dark:bg-white/[.06] dark:hover:bg-white/10 ${
                          thinking ? "opacity-70" : ""
                        }`}
                      >
                        <Sparkles size={15} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
                        {thinking ? t("auditAnalysing") : audited ? t("auditRerun") : t("auditRun")}
                      </motion.button>
                    )}
                  </div>
                </div>

                {/* order summary */}
                <div className="relative w-full overflow-hidden rounded-[28px] border border-slate-900/[.14] bg-white/70 p-[26px] shadow-[0_30px_70px_-46px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline-strong dark:bg-glass">
                  <h2 className="m-0 mb-5 text-[12.5px] font-semibold tracking-[.09em] text-slate-400 dark:text-ink-muted">
                    {t("orderSummary")}
                  </h2>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-3.5">
                      <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("subtotal")}</span>
                      <span className="text-[13.5px] font-semibold tracking-[-.02em]" data-summary-subtotal>
                        {eur(subtotal)}
                      </span>
                    </div>
                    {/* mandatory cylinder deposit — its own line, never blended into the gas price */}
                    {deposit > 0 && (
                      <div className="flex items-baseline justify-between gap-3.5" data-summary-deposit>
                        <span className="min-w-0 text-[13px] text-slate-600 dark:text-ink-muted">
                          {t("cylinderDeposit")}
                          <span className="mt-0.5 block text-[11px] leading-[1.4] text-slate-400 dark:text-ink-muted/80">
                            {t("cylinderDepositDetail", { count: depositUnits })}
                          </span>
                        </span>
                        <span className="flex-none text-[13.5px] font-semibold tracking-[-.02em]">{eur(deposit)}</span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-3.5">
                      <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("freightAdr")}</span>
                      <span
                        className={`text-[13.5px] font-semibold tracking-[-.02em] ${
                          shipping === 0 && subtotal > 0 ? "text-[#047857] dark:text-[#34d399]" : ""
                        }`}
                      >
                        {shipping === 0 && subtotal > 0 ? t("freightIncluded") : eur(shipping)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3.5">
                      <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("vat20")}</span>
                      <span className="text-[13.5px] font-semibold tracking-[-.02em]">{eur(vat)}</span>
                    </div>
                  </div>

                  <div className="mt-[18px] flex items-baseline justify-between gap-3.5 border-t border-slate-900/[.08] pt-[18px] dark:border-hairline">
                    <span className="text-[15px] font-semibold tracking-[-.02em]">{t("total")}</span>
                    <span className="text-[30px] font-semibold tracking-[-.045em]" data-summary-total>
                      {eur(total)}
                    </span>
                  </div>

                  <QuoteCartBanner className="mt-[18px]" />

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
                        className="relative mt-[18px] overflow-hidden rounded-[20px] border border-red-500/35 bg-red-500/[.10] p-4 shadow-[0_0_34px_-12px_rgba(239,68,68,.75)] backdrop-blur-xl backdrop-saturate-150"
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

                  {/* F-Gas gate — sits directly under the total */}
                  <AnimatePresence mode="wait" initial={false}>
                    {!empty && fgasGate && (
                      <div key={fgasGate} className="mt-[18px]">
                        <FgasGateAlert gate={fgasGate} fgas={fgas} onLogIn={() => openAuth("inline")} onUpload={openFgas} />
                      </div>
                    )}
                    {!empty && hasGasLines && fgasCleared && (
                      <div key="verified" className="mt-[18px]">
                        <FgasVerifiedLine fgas={fgas} />
                      </div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="button"
                    whileHover={checkoutLocked ? undefined : { y: -1 }}
                    whileTap={checkoutLocked ? undefined : { scale: 0.97 }}
                    disabled={checkoutLocked}
                    aria-disabled={checkoutLocked}
                    title={checkoutLocked && !empty ? t("fgasLockedAria") : undefined}
                    onClick={goToCheckout}
                    data-checkout-cta
                    data-checkout-locked={checkoutLocked ? "true" : undefined}
                    className={`mt-[22px] flex h-14 w-full items-center justify-center gap-2.5 rounded-[18px] bg-blue-700 text-[15.5px] font-semibold tracking-[-.022em] text-white transition-[background-color,box-shadow,opacity,filter] duration-300 ${
                      checkoutLocked
                        ? "cursor-not-allowed opacity-45 saturate-[.55] shadow-none"
                        : "shadow-[0_20px_42px_-18px_var(--glow-700)] hover:bg-blue-800 hover:shadow-[0_28px_56px_-18px_var(--glow-700),0_0_36px_-8px_var(--glow-700)]"
                    }`}
                  >
                    {t("proceedToCheckout")}
                    {checkoutLocked && !empty ? <Lock size={16} strokeWidth={2.2} /> : <ArrowRight size={17} strokeWidth={2} />}
                  </motion.button>

                  {/* Secondary: the same basket as a formal 48-hour quote. A
                      basket that already is a quote links back to it. */}
                  {!empty &&
                    (quote ? (
                      <Link
                        href={`/profile/quotes/${quote.id}`}
                        data-view-quote
                        className="mt-2.5 flex h-[46px] w-full items-center justify-center gap-2 rounded-[15px] border border-blue-700/30 text-[13px] font-semibold tracking-[-.015em] text-blue-700 transition-colors hover:bg-blue-700/[.05] dark:border-blue-400/30 dark:text-blue-400"
                      >
                        <FileText size={15} strokeWidth={2} />
                        {tQuotes("viewQuote", { number: quote.quoteNumber })}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={generateQuote}
                        disabled={quoteLocked || quoting}
                        title={quoteLocked && hasGasLines && !fgasCleared ? tQuotes("lockedFgas") : undefined}
                        data-generate-quote
                        className="mt-2.5 flex h-[46px] w-full items-center justify-center gap-2 rounded-[15px] border border-blue-700/30 text-[13px] font-semibold tracking-[-.015em] text-blue-700 transition-colors hover:bg-blue-700/[.05] disabled:cursor-not-allowed disabled:opacity-45 dark:border-blue-400/30 dark:text-blue-400"
                      >
                        {quoting ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} strokeWidth={2} />}
                        {quoting ? tQuotes("generating") : tQuotes("generate")}
                      </button>
                    ))}

                  <div className="mt-5 flex flex-col gap-[11px] border-t border-slate-900/[.08] pt-[18px] dark:border-hairline">
                    {[
                      { icon: FlaskConical, label: t("assuranceCoa") },
                      { icon: Truck, label: t("assuranceFreight") },
                      { icon: Lock, label: t("assuranceFgas") },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="flex items-center gap-[9px] text-[11.5px] text-slate-600 dark:text-ink-muted">
                        <Icon size={14} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
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
