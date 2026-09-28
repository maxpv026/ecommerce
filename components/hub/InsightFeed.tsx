import { getTranslations } from "next-intl/server";
import { getMarketInsights, prioritiseForRefrigerants } from "@/lib/marketInsights";
import { getUserGWPFootprint } from "@/lib/user/analytics";
import InsightCard from "./InsightCard";

/**
 * The insight column.
 *
 * Reads its own data rather than taking it from the briefing action, and
 * deliberately: the two share `prioritiseForRefrigerants` so their ordering
 * agrees, but an OpenAI outage takes out the briefing and this column has to
 * survive it. Both underlying reads are `cache()`-wrapped, so asking twice in
 * one render costs one query.
 *
 * Signed out, it still renders — the market does not depend on who is looking
 * at it. Only the "you buy this gas" highlighting goes away, because there is
 * no account to match against.
 */
export default async function InsightFeed({ limit = 6 }: { limit?: number }) {
  const [insights, footprint, t] = await Promise.all([
    getMarketInsights(10),
    getUserGWPFootprint(),
    getTranslations("Hub"),
  ]);

  const owned = footprint.byRefrigerant.map((r) => r.refrigerant);
  const ordered = prioritiseForRefrigerants(insights, owned, limit);

  return (
    <section data-hub-insights className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="m-0 text-[13px] font-semibold tracking-[-.02em]">{t("insightsTitle")}</h2>
        <span className="text-[10.5px] uppercase tracking-[.07em] text-slate-400 dark:text-ink-muted">
          {owned.length > 0 ? t("insightsSortedForYou") : t("insightsGeneric")}
        </span>
      </header>

      {ordered.length > 0 ? (
        ordered.map((insight) => (
          <InsightCard key={insight.id} insight={insight} ownedRefrigerants={owned} />
        ))
      ) : (
        /* Both sources empty — no curated rows and the publisher unreachable.
           Said plainly instead of filled with placeholders: an empty market
           panel is information, a fabricated one is not. */
        <p className="m-0 rounded-[20px] border border-slate-900/[.06] bg-white/[.6] px-4 py-6 text-center text-[12.5px] text-slate-400 dark:border-hairline dark:bg-glass dark:text-ink-muted">
          {t("insightsEmpty")}
        </p>
      )}
    </section>
  );
}
