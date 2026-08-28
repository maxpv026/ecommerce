"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  Download,
  FileText,
  Lock,
  PackageSearch,
  Plus,
  RefreshCw,
  ScanBarcode,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { QUICK_ACTIONS } from "@/lib/mobileHome";
import { getTimeOfDayGreeting } from "@/lib/greeting";
import { askHomeAssistant, type HomeAssistantResult } from "@/lib/actions/homeAssistant";
import { useCartStore, selectCartCount } from "@/lib/store/cart";
import type { QuickActionIconKey } from "@/lib/types";
import type { MarketAlertData, ProfileDashboardData, StoreProduct, UserOrder, UserProfileData } from "@/lib/data";
import { useCartCount } from "./CartCountProvider";
import ProductScanSheet from "./ProductScanSheet";
import ThemeToggle from "./ThemeToggle";
import HeaderLanguageSwitcher from "./HeaderLanguageSwitcher";

const BarcodeScannerModal = dynamic(() => import("./BarcodeScannerModal"), { ssr: false });

const QUICK_ACTION_ICONS: Record<QuickActionIconKey, typeof RefreshCw> = {
  refresh: RefreshCw,
  "package-search": PackageSearch,
  "file-text": FileText,
  "scan-barcode": ScanBarcode,
};
// Per-action icon tints from the design (cyan / blue / violet / emerald).
const QUICK_ACTION_TINTS: Record<string, string> = {
  reorder: "#22d3ee",
  track: "#60a5fa",
  sds: "#a78bfa",
  scan: "#34d399",
};

// Reason pill derived from real product facts (no invented copy).
const REC_TINTS: Record<string, string> = { A2L: "#34d399", A1: "#22d3ee" };

interface MobileAppLayoutProps {
  featuredProducts: StoreProduct[];
  marketAlerts: MarketAlertData[];
  dashboard: ProfileDashboardData | null;
  orders: UserOrder[];
  certificate: UserProfileData["certificate"];
  jobTitle: string | null;
}

export default function MobileAppLayout({
  featuredProducts,
  marketAlerts,
  dashboard,
  orders,
  certificate,
  jobTitle,
}: MobileAppLayoutProps) {
  const t = useTranslations("Dashboard");
  const tm = useTranslations("HomeMobile");
  const format = useFormatter();
  const { setCartCount } = useCartCount();
  const { data: session, status } = useSession();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const [aiQuery, setAiQuery] = useState("");
  const [aiState, setAiState] = useState<"idle" | "thinking" | "done" | "error">("idle");
  const [aiAnswer, setAiAnswer] = useState("");
  const [tickerOpen, setTickerOpen] = useState(false);
  const [reordered, setReordered] = useState<string[]>([]);

  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const realCartCount = useCartStore(selectCartCount);

  // The shared bottom-nav badge follows the real persisted cart while the
  // home page is mounted (the cart page does the same).
  useEffect(() => {
    setCartCount(realCartCount);
  }, [realCartCount, setCartCount]);

  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const isAuthenticated = status === "authenticated";
  const firstName = (session?.user?.name ?? "").split(" ")[0] || session?.user?.email || "";
  const greeting = t(getTimeOfDayGreeting());
  const initials = (session?.user?.name ?? session?.user?.email ?? "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const subtitleParts = [session?.user?.companyName, jobTitle].filter(Boolean);

  const scannedSource = featuredProducts[0];
  const SCANNED_PRODUCT = scannedSource
    ? { name: scannedSource.name, variant: scannedSource.weightLabel, price: formatEur(scannedSource.price) }
    : { name: "", variant: "", price: "" };

  const handleScanSuccess = () => {
    setScannerOpen(false);
    setAddedToCart(false);
    setFavorited(false);
    setSheetOpen(true);
  };

  const handleAddScannedToCart = () => {
    if (scannedSource) {
      addItem(
        { sku: scannedSource.sku, name: scannedSource.name, variant: scannedSource.weightLabel, price: scannedSource.price },
        1
      );
    }
    setAddedToCart(true);
  };

  const runAi = async (query?: string) => {
    const text = (query ?? aiQuery).trim();
    if (!text || aiState === "thinking") return;
    setAiQuery(text);
    setAiState("thinking");
    let result: HomeAssistantResult;
    try {
      result = await askHomeAssistant(text);
    } catch {
      result = { ok: false, code: "UNAVAILABLE" };
    }
    if (!result.ok) {
      setAiAnswer("");
      setAiState("error");
      return;
    }
    setAiAnswer(result.answer);
    setAiState("done");
  };

  const addProduct = (product: StoreProduct) => {
    addItem({ sku: product.sku, name: product.name, variant: product.weightLabel, price: product.price }, 1);
  };

  const reorder = (order: UserOrder) => {
    for (const item of order.items) {
      addItem({ sku: item.sku, name: item.productName, variant: item.variant, price: item.priceAtPurchase }, item.quantity);
    }
    setReordered((prev) => [...prev, order.id]);
  };

  const recReason = (p: StoreProduct) => {
    if (p.stockLevel === "low") return tm("reasonLowStock");
    if (p.stockLevel === "order") return tm("reasonMadeToOrder");
    if (p.gwpClass === "A2L") return tm("reasonLowGwp");
    return tm("reasonInStock");
  };

  const orderSummary = (order: UserOrder) => {
    const first = order.items[0];
    if (!first) return order.orderNumber;
    const head = `${first.quantity}× ${first.productName}`;
    return order.items.length > 1 ? `${head} +${order.items.length - 1}` : head;
  };

  const thinking = aiState === "thinking";
  const chips = [tm("chip1"), tm("chip2"), tm("chip3"), tm("chip4")];
  const marquee = [...marketAlerts, ...marketAlerts];

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-white dark:bg-canvas">
      {/* ambient orb field from the design */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[170px] left-[-30%] h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-[.32] blur-[92px] [animation:hc-breathe_10s_ease-in-out_infinite]" />
        <div className="absolute -top-[120px] right-[-28%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.28] blur-[88px] [animation:hc-breathe_13s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-[6%] top-[330px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-20 blur-[88px] [animation:hc-breathe_15s_ease-in-out_infinite]" />
        <div className="absolute -bottom-[120px] right-[-18%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,#34d399,rgba(52,211,153,0)_68%)] opacity-[.18] blur-[84px] [animation:hc-breathe_12s_ease-in-out_infinite_reverse]" />
      </div>

      {/* ── sticky glass header: logo · language · theme · bell · avatar ── */}
      <div className="sticky top-0 z-[80] bg-white/80 px-[18px] pb-2.5 pt-3 backdrop-blur-xl backdrop-saturate-150 dark:bg-[#090A0C]/80">
        <div className="flex items-center gap-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="block h-[13px] w-[13px] flex-none rounded-full border-[3px] border-slate-900 dark:border-slate-50" />
            <span className="truncate text-[17px] font-semibold tracking-[-.035em]">My Energy</span>
          </span>
          {/* No motion wrapper here: a transform on an ancestor would re-anchor
              the switcher's fixed bottom sheet to this 38px box. The trigger
              button carries its own active:scale tap feedback instead. */}
          <div className="flex flex-none" data-header-lang>
            <HeaderLanguageSwitcher />
          </div>
          <motion.div whileTap={{ scale: 0.95 }} className="flex flex-none" data-header-theme>
            <ThemeToggle
              iconSize={16}
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-slate-900/[.12] bg-white text-slate-600 transition-colors dark:border-white/[.14] dark:bg-white/5 dark:text-slate-300"
            />
          </motion.div>
          {isAuthenticated && (
            <motion.div whileTap={{ scale: 0.95 }} className="flex flex-none">
              <Link
                href="/notifications"
                aria-label={tm("notificationsAria")}
                className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full border border-slate-900/[.12] bg-white text-slate-600 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-300"
              >
                <Bell size={17} strokeWidth={1.8} />
                <span className="absolute right-[9px] top-[8px] h-[7px] w-[7px] rounded-full border-2 border-white bg-red-500 dark:border-canvas" />
              </Link>
            </motion.div>
          )}
          <motion.div whileTap={{ scale: 0.95 }} className="flex flex-none">
            {isAuthenticated ? (
              <Link
                href="/profile"
                aria-label={tm("profileAria")}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[linear-gradient(140deg,#2563eb,#7c3aed)] text-[12.5px] font-semibold text-white"
                data-header-avatar
              >
                {initials || "•"}
              </Link>
            ) : (
              <Link
                href="/auth"
                className="flex h-[38px] items-center rounded-full bg-blue-700 px-4 text-[12.5px] font-semibold text-white"
              >
                {tm("signIn")}
              </Link>
            )}
          </motion.div>
        </div>
      </div>

      <div className="relative pb-[calc(120px+env(safe-area-inset-bottom))]">
        {/* ── greeting glass card with quick actions ── */}
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="px-[18px] pt-3.5"
        >
          <div className="relative overflow-hidden rounded-[28px] border border-slate-900/[.12] bg-white/70 p-[22px] shadow-[0_30px_66px_-44px_rgba(2,4,10,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline-strong dark:bg-glass">
            <span className="pointer-events-none absolute -top-[110%] right-[-30%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#2563eb,transparent_68%)] opacity-30 blur-[70px]" />

            <div className="relative">
              <div className="mb-[9px] text-[10.5px] uppercase tracking-[.09em] text-slate-400 dark:text-ink-muted" suppressHydrationWarning>
                {greeting}
              </div>
              <div className="text-[27px] font-semibold leading-[1.1] tracking-[-.045em]" suppressHydrationWarning>
                {isAuthenticated ? firstName : tm("guestTitle")}
              </div>
              <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                {isAuthenticated && subtitleParts.length > 0 ? subtitleParts.join(" · ") : tm("guestSubtitle")}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {isAuthenticated && certificate ? (
                  <span className="inline-flex items-center gap-[7px] rounded-full border border-[rgba(16,185,129,.32)] bg-[rgba(16,185,129,.15)] py-1.5 pl-[9px] pr-3 text-[11px] font-semibold text-[#047857] shadow-[0_0_18px_-6px_#34d399] dark:text-[#34d399]">
                    <span className="h-[5px] w-[5px] flex-none rounded-full bg-[#34d399] shadow-[0_0_7px_1px_#34d399]" />
                    {tm("certPill", { type: certificate.certType })}
                  </span>
                ) : !isAuthenticated ? (
                  <Link
                    href="/auth"
                    className="inline-flex items-center gap-[7px] rounded-full border border-slate-900/[.12] bg-slate-100 py-1.5 pl-[9px] pr-3 text-[11px] font-semibold text-slate-600 dark:border-hairline-strong dark:bg-surface-3 dark:text-ink-muted"
                  >
                    <Lock size={11} strokeWidth={2.2} />
                    {t("signInToViewEpa")}
                  </Link>
                ) : null}
                {isAuthenticated && dashboard && dashboard.activeShipments > 0 && (
                  <Link
                    href="/profile/orders?tab=active"
                    className="inline-flex items-center gap-[7px] rounded-full border border-blue-700/[.32] bg-blue-50 py-1.5 pl-[9px] pr-3 text-[11px] font-semibold text-blue-700 dark:bg-blue-600/[.16] dark:text-blue-400"
                  >
                    <Truck size={13} strokeWidth={2} />
                    {tm("inTransitPill", { count: dashboard.activeShipments })}
                  </Link>
                )}
              </div>

              {/* quick actions 2×2 */}
              <div className="mt-[18px] grid grid-cols-2 gap-[9px]">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = QUICK_ACTION_ICONS[action.icon];
                  const tint = QUICK_ACTION_TINTS[action.id] ?? "#60a5fa";
                  const content = (
                    <>
                      <span
                        className="flex h-[34px] w-[34px] items-center justify-center rounded-xl border"
                        style={{ background: `${tint}22`, borderColor: `${tint}44` }}
                      >
                        <Icon size={16} strokeWidth={1.9} style={{ color: tint }} />
                      </span>
                      <span className="mt-[9px] block text-xs font-semibold tracking-[-.02em]">{t(action.label)}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-ink-muted">{t(action.note)}</span>
                    </>
                  );
                  const cls =
                    "block min-h-11 rounded-[18px] border border-slate-900/[.08] bg-slate-100/80 p-[13px] text-left dark:border-hairline dark:bg-surface-3";
                  return action.href ? (
                    <motion.div key={action.id} whileTap={{ scale: 0.95 }}>
                      <Link href={action.href} className={cls} data-quick-action={action.id}>
                        {content}
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.button
                      key={action.id}
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setScannerOpen(true)}
                      className={`w-full ${cls}`}
                      data-quick-action={action.id}
                    >
                      {content}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── AI hub ── */}
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.07 }}
          className="px-[18px] pt-3.5"
          data-ai-hub
        >
          <div
            className="relative overflow-hidden rounded-[22px] p-[1.5px]"
            style={
              thinking
                ? {
                    background: "linear-gradient(90deg,#2563eb,#22d3ee,#7c3aed,#2563eb)",
                    backgroundSize: "300% 100%",
                    animation: "hc-sweep 2.4s linear infinite",
                  }
                : { background: "var(--hc-cat-border, rgba(15,23,42,.12))" }
            }
          >
            <div className="rounded-[20.5px] bg-white/95 p-[13px] backdrop-blur-xl backdrop-saturate-150 dark:bg-[#141518]/95">
              <div className="flex items-center gap-[11px]">
                <motion.span
                  animate={thinking ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                  transition={thinking ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_12px_24px_-12px_rgba(37,99,235,.8)]"
                >
                  <Sparkles size={18} strokeWidth={2} className="text-white" />
                </motion.span>
                <input
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runAi()}
                  placeholder={tm("aiPlaceholder")}
                  data-ai-input
                  className="h-10 min-w-0 flex-1 border-0 bg-transparent text-[13.5px] tracking-[-.015em] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => runAi()}
                  aria-label={tm("aiSendAria")}
                  data-ai-send
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-blue-700 shadow-[0_12px_24px_-12px_#2563eb] transition-colors hover:bg-blue-800"
                >
                  <Send size={15} strokeWidth={2} className="text-white" />
                </motion.button>
              </div>

              {thinking && (
                <div className="flex items-center gap-[5px] px-1 pb-0.5 pt-3">
                  {[0, 0.16, 0.32].map((d) => (
                    <span
                      key={d}
                      className="h-[5px] w-[5px] rounded-full bg-blue-700 dark:bg-blue-400"
                      style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }}
                    />
                  ))}
                  <span className="ml-1 text-[11.5px] text-slate-400 dark:text-ink-muted">{tm("aiThinking")}</span>
                </div>
              )}

              <AnimatePresence>
                {(aiState === "done" || aiState === "error") && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    data-ai-answer
                    className={`mt-3 flex items-start gap-[9px] rounded-[15px] border p-3 ${
                      aiState === "error"
                        ? "border-[rgba(245,158,11,.26)] bg-[rgba(245,158,11,.1)]"
                        : "border-blue-700/[.26] bg-blue-700/[.08] dark:bg-blue-600/[.12]"
                    }`}
                  >
                    <Check
                      size={14}
                      strokeWidth={2.4}
                      className={`mt-0.5 flex-none ${aiState === "error" ? "text-[#b45309] dark:text-[#fbbf24]" : "text-blue-700 dark:text-blue-400"}`}
                    />
                    <span className="min-w-0 flex-1 text-[11.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">
                      {aiState === "error" ? tm("aiError") : aiAnswer}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* prompt chips */}
          <div className="mt-[11px] flex snap-x snap-mandatory gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((chip) => (
              <motion.button
                key={chip}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => runAi(chip)}
                className="min-h-[34px] flex-none snap-start whitespace-nowrap rounded-full border border-slate-900/[.14] px-[13px] text-[11.5px] font-medium text-slate-500 dark:border-hairline-strong dark:text-ink-muted"
              >
                {chip}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ── AI recommended rail ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.14 }}
          className="mt-[22px]"
        >
          <div className="flex items-baseline justify-between gap-3 px-[18px] pb-3">
            <span className="text-[10.5px] uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
              {isAuthenticated ? tm("recommendedKicker") : t("trendingProducts")}
            </span>
            <Link href="/products" className="text-[11.5px] font-semibold text-blue-700 dark:text-blue-400">
              {t("seeAll")}
            </Link>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featuredProducts.map((product) => {
              const tint = REC_TINTS[product.gwpClass] ?? "#60a5fa";
              const inCart = cartItems.some((i) => i.sku === product.sku);
              return (
                <div
                  key={product.id}
                  data-rec-card={product.sku}
                  className="relative w-[186px] flex-none snap-start overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/70 shadow-[0_14px_34px_-30px_rgba(2,4,10,.8)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
                >
                  <span
                    className="pointer-events-none absolute -top-[56%] right-[-26%] h-[220px] w-[220px] rounded-full opacity-[.16] blur-[58px]"
                    style={{ background: `radial-gradient(circle,${tint},transparent 68%)` }}
                  />
                  <Link href={`/products/${product.id}`} className="block">
                    <span className="relative m-[11px] mb-0 flex h-[116px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-surface-3">
                      <span className="block h-[68px] w-[34px] rounded-t-[18px] rounded-b-[5px] border border-dashed border-slate-900/[.22] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.26] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))]" />
                      <span
                        className="absolute left-[9px] top-[9px] inline-flex items-center rounded-full border px-[9px] py-1 text-[9.5px] font-semibold"
                        style={{ background: `${tint}26`, borderColor: `${tint}55`, color: tint }}
                      >
                        {recReason(product)}
                      </span>
                    </span>
                    <span className="relative block p-[13px] pb-0">
                      <span className="block text-[13px] font-semibold tracking-[-.025em]">{product.name}</span>
                      <span className="mt-[3px] block text-[10.5px] text-slate-400 dark:text-ink-muted">
                        {product.weightLabel}
                        {product.gwp !== null ? ` · GWP ${product.gwp}` : ` · ${product.gwpClass}`}
                      </span>
                    </span>
                  </Link>
                  <span className="relative flex items-center justify-between gap-2 p-[13px] pt-3">
                    <span className="text-[14.5px] font-semibold tracking-[-.03em]">{formatEur(product.price)}</span>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => addProduct(product)}
                      disabled={!product.inStock}
                      aria-label={tm("addToCartAria", { name: product.name })}
                      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        inCart
                          ? "bg-green-600 shadow-[0_12px_24px_-12px_#16a34a]"
                          : "bg-blue-700 shadow-[0_12px_24px_-12px_#2563eb] hover:bg-blue-800"
                      }`}
                    >
                      {inCart ? <Check size={15} strokeWidth={2.4} /> : <Plus size={15} strokeWidth={2.4} />}
                    </motion.button>
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ── compliance card (signed-in with certificate) ── */}
        {isAuthenticated && certificate && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.21 }}
            className="px-[18px] pt-[22px]"
          >
            <div
              data-compliance-card
              className="relative overflow-hidden rounded-3xl border border-[rgba(16,185,129,.26)] bg-white/70 p-[18px] shadow-[0_0_28px_-16px_#34d399] backdrop-blur-xl backdrop-saturate-150 dark:bg-glass"
            >
              <span className="pointer-events-none absolute -bottom-[140%] left-[-24%] h-60 w-60 rounded-full bg-[radial-gradient(circle,#34d399,transparent_68%)] opacity-[.22] blur-[60px]" />
              <div className="relative flex items-start gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] border border-[rgba(16,185,129,.32)] bg-[rgba(16,185,129,.16)]">
                  <ShieldCheck size={18} strokeWidth={2} className="text-[#047857] dark:text-[#34d399]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1.5 block text-[9.5px] uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
                    {tm("complianceKicker")}
                  </span>
                  <span className="block text-sm font-semibold tracking-[-.025em]">{tm("certTitle")}</span>
                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-ink-muted">
                    {certificate.certId} · {tm("certIssued", { year: certificate.issuedYear })}
                  </span>
                </span>
                <motion.div whileTap={{ scale: 0.95 }} className="flex flex-none">
                  <Link
                    href="/profile/docs"
                    aria-label={tm("certDownloadAria")}
                    className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-slate-100 text-slate-700 dark:bg-white/[.07] dark:text-slate-100"
                  >
                    <Download size={17} strokeWidth={2} />
                  </Link>
                </motion.div>
              </div>
              <div className="relative mt-3.5 flex flex-wrap gap-[7px]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(16,185,129,.32)] bg-[rgba(16,185,129,.15)] py-[5px] pl-2 pr-[11px] text-[10.5px] font-semibold text-[#047857] shadow-[0_0_16px_-7px_#34d399] dark:text-[#34d399]">
                  <span className="h-[5px] w-[5px] flex-none rounded-full bg-[#34d399] shadow-[0_0_7px_1px_#34d399]" />
                  {tm("certValid")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/[.08] bg-slate-100 py-[5px] pl-2 pr-[11px] text-[10.5px] font-semibold text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                  {certificate.certType}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── quick re-order rail (signed-in with orders) ── */}
        {isAuthenticated && orders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.28 }}
            className="mt-[22px]"
          >
            <div className="flex items-baseline justify-between gap-3 px-[18px] pb-3">
              <span className="text-[10.5px] uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
                {tm("reorderKicker")}
              </span>
              <Link href="/profile/orders" className="text-[11.5px] font-semibold text-blue-700 dark:text-blue-400">
                {tm("historyLink")}
              </Link>
            </div>
            <div className="flex snap-x snap-mandatory gap-[11px] overflow-x-auto px-[18px] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {orders.map((order) => {
                const live = order.status === "IN_TRANSIT" || order.status === "PENDING";
                const again = reordered.includes(order.id);
                return (
                  <div
                    key={order.id}
                    data-reorder-card={order.orderNumber}
                    className="flex w-[214px] flex-none snap-start flex-col rounded-[20px] border border-slate-900/[.08] bg-white/70 p-[15px] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
                  >
                    <span className="flex items-center justify-between gap-2.5">
                      <span className="text-[11.5px] font-semibold tracking-[-.02em]">{order.orderNumber}</span>
                      <span
                        className={`inline-flex flex-none items-center rounded-full border px-[9px] py-[3px] text-[9.5px] font-semibold ${
                          live
                            ? "border-[rgba(56,189,248,.3)] bg-[rgba(56,189,248,.14)] text-[#0369a1] dark:text-[#38bdf8]"
                            : "border-slate-900/[.08] bg-slate-100 text-slate-500 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted"
                        }`}
                      >
                        {live ? t("inTransit") : t("delivered")}
                      </span>
                    </span>
                    <span className="mt-2.5 block text-[12.5px] font-semibold leading-[1.35] tracking-[-.025em]">
                      {orderSummary(order)}
                    </span>
                    <span className="mt-1 block text-[10.5px] text-slate-400 dark:text-ink-muted">
                      {format.dateTime(new Date(order.createdAt), { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    <span className="mt-auto flex items-center justify-between gap-2.5 pt-[13px]">
                      <span className="text-sm font-semibold tracking-[-.03em]">{formatEur(order.totalAmount)}</span>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => reorder(order)}
                        disabled={again}
                        className={`min-h-[34px] flex-none rounded-[11px] px-3.5 text-[11.5px] font-semibold tracking-[-.01em] transition-colors ${
                          again
                            ? "bg-green-600 text-white"
                            : "border border-slate-900/[.16] text-slate-900 dark:border-hairline-strong dark:text-slate-50"
                        }`}
                      >
                        {again ? tm("reorderedBtn") : tm("reorderBtn")}
                      </motion.button>
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── live market: marquee + collapsible news, from real alerts ── */}
        {marketAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
            className="px-[18px] pt-[22px]"
          >
            <div
              data-market-card
              className="overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
            >
              <button
                type="button"
                onClick={() => setTickerOpen((v) => !v)}
                data-market-toggle
                className="flex min-h-11 w-full items-center gap-[9px] px-[15px] text-left"
              >
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#34d399] shadow-[0_0_8px_1px_#34d399] [animation:hc-glow_2.2s_ease-in-out_infinite]" />
                <span className="min-w-0 flex-1 text-[10.5px] uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
                  {tm("marketKicker")}
                </span>
                <span className="max-w-[45%] truncate text-[11.5px] font-semibold text-[#047857] dark:text-[#34d399]">
                  {marketAlerts[0].eyebrow}
                </span>
                <motion.span animate={{ rotate: tickerOpen ? 180 : 0 }} transition={{ duration: 0.3 }} className="flex flex-none">
                  <ChevronDown size={14} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                </motion.span>
              </button>

              <div className="overflow-hidden pb-[13px] [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
                <div className="flex w-max pl-[15px] [animation:hc-marquee_22s_linear_infinite]">
                  {marquee.map((alert, i) => {
                    const warn = alert.tone === "warning";
                    return (
                      <span key={`${alert.id}-${i}`} className="flex flex-none items-center gap-[7px] pr-5">
                        {warn ? (
                          <ArrowUp size={12} strokeWidth={2.2} className="text-[#b45309] dark:text-[#fbbf24]" />
                        ) : (
                          <ArrowDown size={12} strokeWidth={2.2} className="text-[#047857] dark:text-[#34d399]" />
                        )}
                        <span className="text-[11.5px] font-semibold tracking-[-.015em]">{alert.eyebrow}</span>
                        <span
                          className={`text-[11.5px] font-semibold tracking-[-.015em] ${
                            warn ? "text-[#b45309] dark:text-[#fbbf24]" : "text-[#047857] dark:text-[#34d399]"
                          }`}
                        >
                          {alert.title}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {tickerOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                    data-market-news
                  >
                    <div className="px-[15px] pb-1.5">
                      {marketAlerts.map((alert) => (
                        <span
                          key={alert.id}
                          className="flex items-start gap-2.5 border-t border-slate-900/[.06] py-[11px] dark:border-hairline"
                        >
                          <span
                            className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                            style={{
                              background: alert.tone === "warning" ? "#fbbf24" : "#34d399",
                              boxShadow: `0 0 7px 1px ${alert.tone === "warning" ? "#fbbf24" : "#34d399"}`,
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold leading-[1.4] tracking-[-.02em]">
                              {alert.title}
                            </span>
                            <span className="mt-[3px] block text-[10.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">
                              {alert.body}
                            </span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>

      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onScanSuccess={handleScanSuccess} />

      <ProductScanSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        product={SCANNED_PRODUCT}
        addedToCart={addedToCart}
        onAddToCart={handleAddScannedToCart}
        favorited={favorited}
        onToggleFavorite={() => setFavorited((v) => !v)}
      />
    </div>
  );
}
