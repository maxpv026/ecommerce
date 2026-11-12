"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import StockNotifyModal from "./StockNotifyModal";
import HeroBackground from "./HeroBackground";
import HeroShowcase, { type ShowcaseItem } from "./home/HeroShowcase";
import OperationsSection from "./home/OperationsSection";
import PopularSection from "./home/PopularSection";
import EngineeringWorkbench from "./home/EngineeringWorkbench";
import type { GreetingKey } from "@/lib/greeting";
import { useGreeting } from "@/lib/hooks/useGreeting";
import type { FgasSummary } from "@/lib/fgas";
import type { MarketAlertData, ProfileDashboardData, StoreProduct, UserOrder } from "@/lib/data";

/**
 * The desktop home, in the Cart / Settings design language (components/home/ui):
 * max-w-7xl, 8 + 4 columns (803 / 389 px at 1440), 22 px surfaces, divided
 * rows, cart micro-badges and steppers, the emerald F-Gas banner, blue CTAs.
 *
 *   Hero         greeting + KPI micro-cards · 3D cylinder with a gas dock
 *   Operations   charge calculator + quick operations | market index & F-Gas
 *   Popular      category tabs, cart-density product cards with a stepper
 *   Workbench    P-T comparator | order & quota estimator
 *
 * No section calls a model on load or on interaction; the calculator calls
 * one only for a sentence the local parser can't read (lib/chargeFastPath).
 */

interface DesktopHomeProps {
  /** Products for the Popular grid (recommended first when signed in). */
  products: StoreProduct[];
  /** One catalog cylinder per showcase gas (lib/data getHomeShowcase). */
  showcase: Array<{ mark: string; product: StoreProduct | null }>;
  alerts: MarketAlertData[];
  dashboard: ProfileDashboardData | null;
  latestOrder: UserOrder | null;
  fgas: FgasSummary | null;
  /** Signed in, own figures still on the way: placeholders, not a stranger's zeros. */
  accountLoading: boolean;
  greetingKey: GreetingKey;
  sdsCount: number;
}

const Shimmer = ({ className }: { className: string }) => <span aria-hidden className={`block animate-pulse rounded-md bg-slate-900/[.07] dark:bg-white/[.08] ${className}`} />;

export default function DesktopHome({ products, showcase, alerts, dashboard, latestOrder, fgas, accountLoading, greetingKey, sdsCount }: DesktopHomeProps) {
  const t = useTranslations("HomeDesktop");
  const td = useTranslations("Dashboard");
  const format = useFormatter();
  const { data: session, status } = useSession();
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);

  const isAuthenticated = status === "authenticated";
  const heroName = session?.user?.name?.split(" ")[0] || session?.user?.email || null;
  const greeting = td(useGreeting(greetingKey));
  const ownDataLoading = isAuthenticated && accountLoading;
  const items: ShowcaseItem[] = showcase.flatMap((s) => (s.product ? [{ mark: s.mark, product: s.product }] : []));
  const fgasUntil = fgas?.status === "VERIFIED" && fgas.expiresAt ? format.dateTime(new Date(fgas.expiresAt), { month: "short", year: "numeric", timeZone: "UTC" }) : null;

  const kpis = dashboard
    ? [
        { key: "orders", value: String(dashboard.totalOrders), label: t("statOrders"), href: "/profile/orders" as const },
        { key: "transit", value: String(dashboard.activeShipments), label: t("statInTransit"), href: latestOrder ? (`/profile/orders/${latestOrder.id}` as const) : ("/profile/orders" as const) },
        { key: "purity", value: "99.9%", label: t("statPurity"), href: "/compliance/sds" as const },
      ]
    : null;

  return (
    <main className="mx-auto max-w-7xl px-8 pb-28" data-home>
      {/* ── Hero ── */}
      <section className="pt-8" data-home-section="hero">
        <HeroBackground>
          <div className="relative grid min-h-[var(--hero-h)] items-center gap-12 [--hero-h:clamp(500px,calc(100svh-300px),700px)] md:grid-cols-[1fr_1fr]">
            <motion.div initial={false} animate={{ opacity: 1 }}>
              <div className="mb-6 flex h-[30px] items-center">
                {isAuthenticated && session?.user?.epaVerified ? (
                  <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 py-1.5 pl-2.5 pr-3.5 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300" data-hero-fgas>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-600 dark:bg-emerald-400" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    </span>
                    {fgasUntil ? t("fgasBadgeLive", { date: fgasUntil }) : t("fgasBadgeShort")}
                  </div>
                ) : status === "unauthenticated" ? (
                  <Link href="/auth" className="inline-flex items-center gap-2 text-[12.5px] font-medium text-slate-500 hover:text-blue-700 dark:text-ink-muted dark:hover:text-blue-400">
                    {td("signInToViewEpa")}
                  </Link>
                ) : null}
              </div>

              <h1 className="text-5xl font-semibold leading-none tracking-[-0.048em] text-balance md:text-[60px]">
                {isAuthenticated && heroName ? (
                  <>
                    {greeting},
                    <br />
                    <span className="text-slate-400 dark:text-ink-muted">{heroName}.</span>
                  </>
                ) : (
                  greeting
                )}
              </h1>
              <p className="mt-6 max-w-[452px] text-[16.5px] leading-relaxed text-slate-600 text-pretty dark:text-ink-muted">{t("heroSubtitle")}</p>

              <div className="mt-8 flex items-center gap-2.5">
                <Link href="/products" className="flex h-12 items-center gap-2.5 rounded-[14px] bg-blue-700 px-6 text-[14.5px] font-semibold tracking-[-.02em] text-white transition-colors hover:bg-blue-800">
                  {t("browseCylinders")}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                </Link>
                <a href="#bento" className="flex h-12 items-center rounded-[14px] border border-slate-900/[.12] bg-white/80 px-5 text-[14.5px] font-semibold tracking-[-.02em] text-slate-800 transition-colors hover:bg-white dark:border-white/[.14] dark:bg-white/[.05] dark:text-slate-100 dark:hover:bg-white/[.09]">
                  {t("openCalculator")}
                </a>
              </div>

              {/* KPI micro-cards — each opens where its number comes from */}
              {ownDataLoading && !dashboard && (
                <div className="mt-10 grid max-w-[480px] grid-cols-3 gap-2.5" data-stats-loading>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-[16px] border border-slate-900/[.08] bg-white/60 px-4 py-3 dark:border-white/[.08] dark:bg-white/[.03]">
                      <Shimmer className="h-[26px] w-10" />
                      <Shimmer className="mt-1.5 h-3 w-20" />
                    </div>
                  ))}
                </div>
              )}
              {kpis && (
                <div className="mt-10 grid max-w-[480px] grid-cols-3 gap-2.5" data-hero-kpis>
                  {kpis.map((k) => (
                    <Link
                      key={k.key}
                      href={k.href}
                      data-hero-kpi={k.key}
                      className="group relative rounded-[16px] border border-slate-900/[.08] bg-white/75 px-4 py-3 backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-600/30 hover:shadow-[0_18px_36px_-24px_rgba(29,78,216,.55)] dark:border-white/[.08] dark:bg-white/[.03] dark:hover:border-blue-400/30"
                    >
                      <ArrowUpRight size={13} strokeWidth={2.2} className="absolute right-2.5 top-2.5 text-slate-300 transition-colors group-hover:text-blue-600 dark:text-slate-600 dark:group-hover:text-blue-400" />
                      <div className="text-[24px] font-semibold tabular-nums tracking-[-0.04em]">{k.value}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold tracking-[.06em] text-slate-400 dark:text-ink-muted">{k.label}</div>
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>

            {/* 3D stage + gas dock */}
            <div className="relative h-[calc(var(--hero-h)+40px)]">
              <HeroShowcase items={items} onNotify={setNotifyFor} />
            </div>
          </div>
        </HeroBackground>
      </section>

      <OperationsSection
        showcase={items}
        known={products}
        latestOrder={latestOrder}
        ownDataLoading={ownDataLoading}
        alerts={alerts}
        fgas={fgas}
        sdsCount={sdsCount}
      />

      <PopularSection products={products} onNotify={setNotifyFor} />

      <EngineeringWorkbench showcase={items} />

      <StockNotifyModal isOpen={notifyFor !== null} onClose={() => setNotifyFor(null)} productId={notifyFor?.id ?? ""} productName={notifyFor?.name ?? ""} />
    </main>
  );
}
