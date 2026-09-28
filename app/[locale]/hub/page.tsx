import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import AppChrome from "@/components/AppChrome";
import MarketTicker from "@/components/hub/MarketTicker";
import PersonalizedBriefingCard from "@/components/hub/PersonalizedBriefingCard";
import InsightFeed from "@/components/hub/InsightFeed";
import UserSpendChart from "@/components/profile/analytics/UserSpendChart";
import GWPFootprintChart from "@/components/profile/analytics/GWPFootprintChart";
import { PanelSkeleton } from "@/components/profile/analytics/primitives";

interface HubRouteProps {
  params: Promise<{ locale: string }>;
}

/**
 * The locale is read explicitly rather than inherited: generateMetadata runs
 * as its own render and does not see a setRequestLocale from the page body.
 * Same pattern as /categories.
 */
export async function generateMetadata({ params }: HubRouteProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Hub" });
  return {
    title: `${t("metaTitle")} — My Energy`,
    description: t("metaDescription"),
  };
}

/**
 * The F-Gas market hub.
 *
 * ── Why the boundaries sit where they do ────────────────────────────────
 *
 * Four independent awaits, each behind its own Suspense boundary, so the page
 * streams in the order a buyer would read it and one slow source cannot hold
 * up the rest:
 *
 *   • the ticker is a single indexed product query — fast, arrives first;
 *   • the briefing may wait on gpt-4o-mini (cached, but a cold key is a
 *     round-trip to OpenAI), which must not delay the shell;
 *   • the insight column can wait up to 6s on an external RSS publisher;
 *   • the two charts each join across the account's order lines.
 *
 * A single boundary around all four would make the whole hub as slow as
 * whichever is slowest, which on a cold briefing is the model call.
 *
 * ── Why there is no `loading.tsx` ───────────────────────────────────────
 *
 * Deliberately. A loader at a segment root flushes the shell before the route
 * has resolved, and once the shell is flushed a `notFound()` below it still
 * returns HTTP 200 — that is how three routes in this app became soft-404s.
 * Boundaries stay inside the page.
 *
 * Synchronous, so `useTranslations` works here: this component awaits nothing
 * itself — everything it renders resolves inside a child boundary — which is
 * what lets it read messages without becoming an async component.
 */
export default function HubRoute() {
  const t = useTranslations("Hub");
  const tAnalytics = useTranslations("Analytics");

  return (
    <AppChrome>
      {/* pb-28 on mobile clears the fixed bottom tab bar; without it the last
          chart sits underneath it. */}
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 md:pb-14 md:pt-8">
        <header className="mb-5 md:mb-6">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-.03em] md:text-[27px]">
            {t("title")}
          </h1>
          <p className="m-0 mt-1.5 max-w-[68ch] text-[13px] leading-[1.6] text-slate-500 text-pretty dark:text-ink-muted">
            {t("subtitle")}
          </p>
        </header>

        <div className="flex flex-col gap-4 md:gap-5">
          <Suspense fallback={<TickerSkeleton />}>
            <MarketTicker />
          </Suspense>

          <Suspense fallback={<BriefingSkeleton />}>
            <PersonalizedBriefingCard />
          </Suspense>

          {/* Insights lead on desktop and take the wider column: they are the
              reason to open this page. The buyer's own figures sit alongside
              as the context that makes the news personal — and stack BELOW on
              mobile, where a single column means order is priority. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
            <Suspense fallback={<InsightsSkeleton label={t("insightsTitle")} />}>
              <InsightFeed />
            </Suspense>

            <div className="flex flex-col gap-4 lg:gap-5">
              <Suspense
                fallback={
                  <PanelSkeleton
                    height={240}
                    title={tAnalytics("spendTitle", { months: 12 })}
                  />
                }
              >
                <UserSpendChart />
              </Suspense>
              <Suspense
                fallback={<PanelSkeleton height={260} title={tAnalytics("carbonTitle")} />}
              >
                <GWPFootprintChart />
              </Suspense>
            </div>
          </div>
        </div>
      </main>
    </AppChrome>
  );
}

/* ── Fallbacks ────────────────────────────────────────────────────────────
   Each one holds the height of what replaces it. A fallback shorter than its
   content makes everything below jump as the stream lands, which on a page
   with four boundaries would be four separate shifts.

   No strings of their own: these are `aria-hidden` grey boxes, and the one
   that does show a label takes it from the caller rather than reaching for a
   second copy of the same key. */

function TickerSkeleton() {
  return (
    <div
      aria-hidden
      className="h-[74px] animate-pulse rounded-[22px] border border-slate-900/[.08] bg-white/70 dark:border-hairline dark:bg-glass"
    />
  );
}

function BriefingSkeleton() {
  return (
    <div
      aria-hidden
      className="rounded-[26px] border border-white/60 bg-white/70 p-5 backdrop-blur-2xl sm:p-6 dark:border-white/[.08] dark:bg-glass"
    >
      <div className="h-[18px] w-48 animate-pulse rounded bg-black/[.06] dark:bg-white/[.08]" />
      <div className="mt-4 flex flex-col gap-2">
        <div className="h-[14px] w-full animate-pulse rounded bg-black/[.05] dark:bg-white/[.07]" />
        <div className="h-[14px] w-[82%] animate-pulse rounded bg-black/[.05] dark:bg-white/[.07]" />
      </div>
      <div className="mt-5 h-[26px] w-64 animate-pulse rounded-full bg-black/[.04] dark:bg-white/[.06]" />
    </div>
  );
}

function InsightsSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="px-1 text-[13px] font-semibold tracking-[-.02em] text-slate-300 dark:text-slate-600">
        {label}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-[132px] animate-pulse rounded-[20px] border border-slate-900/[.06] bg-white/[.6] dark:border-hairline dark:bg-glass"
        />
      ))}
    </div>
  );
}
