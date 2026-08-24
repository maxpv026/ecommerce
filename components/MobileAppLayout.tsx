"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import {
  Bell,
  Check,
  ChevronRight,
  FileText,
  Lock,
  PackageSearch,
  Plus,
  RefreshCw,
  ScanBarcode,
  Scale,
  TrendingUp,
  Truck,
  Zap,
} from "lucide-react";
import { ACTIVE_SHIPMENT, QUICK_ACTIONS } from "@/lib/mobileHome";
import { getTimeOfDayGreeting } from "@/lib/greeting";
import { openAiChat } from "@/lib/aiChatEvents";
import type { QuickActionIconKey } from "@/lib/types";
import type { MarketAlertData, StoreProduct } from "@/lib/data";
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

interface MobileAppLayoutProps {
  featuredProducts: StoreProduct[];
  marketAlerts: MarketAlertData[];
}

const ALERT_TONE_ICON = {
  warning: TrendingUp,
  success: Scale,
} as const;

export default function MobileAppLayout({ featuredProducts, marketAlerts }: MobileAppLayoutProps) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  const { bumpCartCount } = useCartCount();
  const { data: session, status } = useSession();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const isAuthenticated = status === "authenticated";
  const firstName = (session?.user?.name ?? "").split(" ")[0];
  const greeting = t(getTimeOfDayGreeting());

  const scannedSource = featuredProducts[0];
  const SCANNED_PRODUCT = scannedSource
    ? {
        name: scannedSource.name,
        variant: scannedSource.weightLabel,
        price: formatEur(scannedSource.price),
      }
    : { name: "", variant: "", price: "" };

  const handleScanSuccess = () => {
    setScannerOpen(false);
    setAddedToCart(false);
    setFavorited(false);
    setSheetOpen(true);
  };

  const handleAddScannedToCart = () => {
    bumpCartCount(1);
    setAddedToCart(true);
  };

  return (
    <div className="relative w-full min-h-screen bg-white dark:bg-slate-950">
      {/* Hero: mesh gradient masked to fade into white before the content below */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,transparent_100%)]">
          <div className="absolute -left-[100px] -top-[130px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.34] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.48]" />
          <div className="absolute -right-[90px] -top-[100px] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.32] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.42]" />
          <div className="absolute -top-[90px] left-[26%] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-45 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.14]" />
        </div>

        <div className="relative px-5 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="block h-[13px] w-[13px] rounded-full border-[3.2px] border-slate-900 dark:border-slate-50" />
              <span className="text-[17px] font-semibold tracking-[-.035em]">My Energy</span>
            </div>
            <div className="flex items-center gap-2">
              <HeaderLanguageSwitcher />
              <ThemeToggle
                iconSize={17}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-900 backdrop-blur-md transition-colors dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
              />
              {isAuthenticated && (
                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-900 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
                >
                  <Bell size={18} strokeWidth={1.8} />
                  <span className="absolute right-[9px] top-[9px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-red-500 dark:border-slate-950" />
                </Link>
              )}
            </div>
          </div>

          <div className="pt-5.5">
            <h1 className="m-0 text-[27px] font-semibold leading-[1.12] tracking-[-.04em]" suppressHydrationWarning>
              {isAuthenticated ? `${greeting}, ${firstName}` : greeting}
            </h1>
            {!isAuthenticated ? (
              <Link
                href="/auth"
                className="mt-2.5 flex items-center gap-1.5 text-[13px] text-slate-500 transition-colors hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400"
              >
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
                  <Lock size={9} strokeWidth={2.4} />
                </span>
                {t("signInToViewEpa")}
              </Link>
            ) : session?.user?.epaVerified ? (
              <div className="mt-2.5 flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-400">
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-400">
                  <Check size={10} strokeWidth={3.2} />
                </span>
                {t("epaActive")}
              </div>
            ) : null}
          </div>

          {/* Quick actions: glass cards, backdrop-blur-md */}
          <div className="mt-6 grid grid-cols-2 gap-2.5 pb-1">
            {QUICK_ACTIONS.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.icon];
              const active = action.id === "scan" && scannerOpen;
              const cardClassName = `flex flex-col items-start rounded-[18px] border bg-white/66 px-3.5 py-3.5 text-left backdrop-blur-md backdrop-saturate-150 transition-[border-color,box-shadow] duration-200 dark:bg-slate-900/55 ${
                active
                  ? "border-blue-700/35 shadow-[0_0_0_3px_rgba(29,78,216,0.08)] dark:border-blue-400/40"
                  : "border-white/80 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.4)] dark:border-white/10"
              }`;
              const cardContent = (
                <>
                  <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-900/[.07] bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-slate-50">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="text-[13.5px] font-semibold tracking-[-.015em]">
                    {t(action.label)}
                  </span>
                  <span className="mt-[3px] text-[11px] text-slate-400 dark:text-slate-500">
                    {t(action.note)}
                  </span>
                </>
              );

              if (action.href) {
                return (
                  <Link key={action.id} href={action.href} className={cardClassName}>
                    {cardContent}
                  </Link>
                );
              }

              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className={cardClassName}
                >
                  {cardContent}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Smart Insight / AI teaser */}
      <div className="px-5 pt-8">
        <button
          type="button"
          onClick={() => openAiChat()}
          className="flex w-full items-center gap-3.5 rounded-[20px] border border-blue-700/[.12] bg-[linear-gradient(135deg,rgba(239,246,255,0.9),rgba(238,242,255,0.75))] p-4 text-left shadow-[0_14px_32px_-26px_rgba(29,78,216,0.5)] dark:border-blue-400/[.16] dark:bg-[linear-gradient(135deg,rgba(30,58,138,0.28),rgba(49,46,129,0.22))]"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-white text-blue-700 shadow-[0_10px_22px_-10px_rgba(29,78,216,0.5)] dark:bg-slate-900 dark:text-blue-400">
            <Zap size={19} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold tracking-[-.02em]">{t("chargeCalculatorTitle")}</span>
            <span className="mt-[3px] block text-[12px] leading-[1.45] text-slate-500 dark:text-slate-400">
              {t("chargeCalculatorBody")}
            </span>
            <span className="mt-2.5 flex items-center gap-1 text-[12px] font-semibold text-blue-700 dark:text-blue-400">
              {t("tryNow")}
              <ChevronRight size={14} strokeWidth={2.4} />
            </span>
          </span>
        </button>
      </div>

      {/* Market Alerts & F-Gas News: horizontal scroll, no visible scrollbar */}
      {marketAlerts.length > 0 && (
        <div className="pt-8">
          <div className="mb-3.5 px-5">
            <h2 className="m-0 text-lg font-semibold tracking-[-.03em]">{t("marketAlerts")}</h2>
          </div>
          <div className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto px-5 pb-2 pt-1">
            {marketAlerts.map((alert) => {
              const warning = alert.tone === "warning";
              const Icon = ALERT_TONE_ICON[alert.tone];
              return (
                <div
                  key={alert.id}
                  className="mr-2.5 min-w-[220px] max-w-[240px] flex-none snap-start rounded-2xl border border-slate-900/[.06] bg-white p-3 shadow-sm dark:border-white/[.08] dark:bg-slate-900"
                >
                  <span
                    className={`flex items-center gap-1 text-[9.5px] font-semibold tracking-[.04em] ${
                      warning ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    <Icon size={11} strokeWidth={2.2} />
                    {alert.eyebrow}
                  </span>
                  <div className="mt-1 text-[12.5px] font-semibold leading-[1.3] tracking-[-.02em]">
                    {alert.title}
                  </div>
                  <p className="m-0 mt-1 line-clamp-2 text-xs leading-[1.4] text-slate-500 dark:text-slate-400">
                    {alert.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Featured products: native horizontal scroll with snap, no visible scrollbar */}
      <div className="pt-8">
        <div className="mb-3.5 flex items-baseline justify-between gap-4 px-5">
          <h2 className="m-0 text-lg font-semibold tracking-[-.03em]">
            {isAuthenticated && session?.user?.companyName
              ? t("recommendedFor", { company: session.user.companyName })
              : t("trendingProducts")}
          </h2>
          <Link href="/cylinders" className="text-[12.5px] font-medium text-blue-700 dark:text-blue-400">
            {t("seeAll")}
          </Link>
        </div>

        <div className="scrollbar-hide flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-2 pt-1">
          {featuredProducts.map((product) => (
            <div
              key={product.id}
              className="w-[168px] flex-none snap-start rounded-[20px] border border-slate-900/[.08] bg-white p-2.5 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.35)] dark:border-white/[.08] dark:bg-slate-900"
            >
              <div className="relative mb-3 aspect-square overflow-hidden rounded-[14px] bg-slate-50 dark:bg-white/5">
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.035)_0_1px,transparent_1px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.03)_0_1px,transparent_1px_9px)]" />
                <div className="absolute left-1/2 top-1/2 h-2/3 w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-t-[52px] rounded-b-[10px] border border-dashed border-slate-900/20 bg-white/80 dark:border-white/20 dark:bg-white/10" />
                <span
                  className={`absolute right-2 top-2 rounded-[7px] px-2 py-1 text-[10px] font-semibold backdrop-blur-[8px] ${
                    product.inStock
                      ? "bg-white/85 text-blue-700 dark:bg-slate-900/85 dark:text-blue-400"
                      : "bg-white/85 text-red-600 dark:bg-slate-900/85 dark:text-red-400"
                  }`}
                >
                  {product.inStock ? product.gwpClass : t("outOfStock")}
                </span>
              </div>
              <div className="text-sm font-semibold tracking-[-.02em]">{product.name}</div>
              <div className="mt-[3px] text-[11.5px] text-slate-400 dark:text-slate-500">
                {product.weightLabel}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2.5">
                <span className="text-base font-semibold tracking-[-.03em]">{formatEur(product.price)}</span>
                <button
                  type="button"
                  onClick={() => bumpCartCount(1)}
                  disabled={!product.inStock}
                  aria-label={`Add ${product.name} to cart`}
                  className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-blue-700 text-white shadow-[0_8px_18px_-8px_rgba(29,78,216,0.8)] transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active shipment — carries the critical bottom clearance so no
          section ends up hidden behind the fixed bottom nav */}
      <div className="px-5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-7">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-semibold tracking-[-.03em]">{t("activeShipment")}</h2>
          <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
            {ACTIVE_SHIPMENT.orderId}
          </span>
        </div>
        <div className="rounded-[20px] border border-slate-900/[.08] bg-slate-50 p-4.5 dark:border-white/[.08] dark:bg-white/[.03]">
          <div className="flex items-center justify-between gap-3.5">
            <div>
              <div className="text-sm font-semibold tracking-[-.02em]">
                {ACTIVE_SHIPMENT.summary}
              </div>
              <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {ACTIVE_SHIPMENT.status}
              </div>
            </div>
            <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400">
              <Truck size={18} strokeWidth={1.8} />
            </span>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-900/[.09] dark:bg-white/10">
            <div
              className="h-full rounded-full bg-blue-700"
              style={{ width: `${ACTIVE_SHIPMENT.progressPercent}%` }}
            />
          </div>
          <div className="mt-2.5 flex justify-between text-[10.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
            <span>{t("dispatched")}</span>
            <span>{t("inTransit")}</span>
            <span>{t("delivered")}</span>
          </div>
        </div>
      </div>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

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
