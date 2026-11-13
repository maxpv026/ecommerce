"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, ExternalLink, Star } from "lucide-react";
import { MicroBadge, SURFACE, type BadgeTone } from "@/components/home/ui";
import { toggleBookmark, voteInsight } from "@/lib/actions/hub";
import type { HubData, HubInsight } from "@/lib/hubData";
import type { VoteChoice } from "@/lib/hubVotes";
import { chip } from "./shared";
import { EmptyRow, SurfaceHead } from "@/components/profile/hub/parts";

/**
 * The industry digest: curated insights + the trade feed (Cooling Post RSS —
 * titles stay in the publisher's language and say so), filterable, with a
 * one-tap sentiment poll per story (live share after voting, stored per
 * account) and bookmarks. The takeaway badge is a rule on the story's
 * category and the gases it names — not a model's summary.
 */

export const DIGEST_FILTERS = ["all", "portfolio", "quota", "equipment", "saved"] as const;
type DigestFilter = (typeof DIGEST_FILTERS)[number];

const VOTE_ICON: Record<VoteChoice, string> = { UP: "📈", DOWN: "📉", FLAT: "⚖️" };
const CATEGORY_TONE: Record<HubInsight["category"], BadgeTone> = { REGULATION: "warn", PRICE_TREND: "info", SUPPLY: "bad", INDUSTRY_NEWS: "muted" };

export default function DigestFeed({
  data,
  insights,
  onInsights,
  limit,
  onShowAll,
  onNeedSignIn,
  compact = false,
}: {
  data: Pick<HubData, "signedIn" | "savedArchive">;
  insights: HubInsight[];
  onInsights: (next: HubInsight[]) => void;
  limit?: number;
  onShowAll?: () => void;
  onNeedSignIn: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const [filter, setFilter] = useState<DigestFilter>("all");
  const [, start] = useTransition();

  const counts = useMemo(
    () => ({
      all: insights.length,
      portfolio: insights.filter((i) => i.inPortfolio).length,
      quota: insights.filter((i) => i.category === "REGULATION").length,
      equipment: insights.filter((i) => i.equipment).length,
      saved: insights.filter((i) => i.saved).length + data.savedArchive.length,
    }),
    [insights, data.savedArchive]
  );
  const list = insights.filter((i) =>
    filter === "all" ? true : filter === "portfolio" ? i.inPortfolio : filter === "quota" ? i.category === "REGULATION" : filter === "equipment" ? i.equipment : i.saved
  );
  const shown = limit ? list.slice(0, limit) : list;
  const patch = (id: string, change: Partial<HubInsight>) => onInsights(insights.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const vote = (item: HubInsight, choice: VoteChoice) => {
    if (!data.signedIn) return onNeedSignIn();
    start(async () => {
      const res = await voteInsight(item.id, choice);
      if (res.ok) patch(item.id, { tally: res.tally, myVote: res.choice });
      else toast.error(t("actionError"));
    });
  };
  const bookmark = (item: HubInsight) => {
    if (!data.signedIn) return onNeedSignIn();
    start(async () => {
      const res = await toggleBookmark({ insightId: item.id, title: item.title, link: item.link ?? undefined, source: item.source ?? undefined });
      if (res.ok) patch(item.id, { saved: res.saved });
      else toast.error(t("actionError"));
    });
  };

  const day = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "UTC" }) : null);

  return (
    <div className={SURFACE} data-hub-digest={compact ? "compact" : "full"}>
      <SurfaceHead title={compact ? t("feedTitle") : t("digestTitle")} meta={[t("feedMeta"), t("feedLanguage")]} id="digest" />
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-900/[.06] px-5 py-3 [scrollbar-width:none] dark:border-white/[.06] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t("feedFilters")} data-hub-digest-filters>
        {DIGEST_FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)} data-hub-digest-filter={f}>
            {f === "saved" && <Star size={12} strokeWidth={2.4} />}
            {t(`filter_${f}`)}
            <span className={`text-[11px] tabular-nums ${filter === f ? "text-white/70 dark:text-slate-500" : "text-slate-400"}`}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 && !(filter === "saved" && data.savedArchive.length > 0) && (
        <EmptyRow>{filter === "saved" ? (data.signedIn ? t("savedEmpty") : t("savedSignedOut")) : filter === "portfolio" && !data.signedIn ? t("portfolioSignedOut") : t("feedEmpty")}</EmptyRow>
      )}

      {shown.map((item) => {
        const total = item.tally.UP + item.tally.DOWN + item.tally.FLAT;
        const voted = item.myVote !== null;
        const portfolioGas = item.inPortfolio ? item.gases[0] : null;
        return (
          <article key={item.id} className="border-b border-slate-900/[.06] px-5 py-4 last:border-b-0 dark:border-white/[.06]" data-hub-story={item.id}>
            <div className="flex flex-wrap items-center gap-1.5">
              <MicroBadge tone={CATEGORY_TONE[item.category]}>{t(`cat_${item.category}`)}</MicroBadge>
              <MicroBadge tone={item.inPortfolio ? "ok" : "muted"} data-hub-takeaway="">
                {portfolioGas ? t("take_portfolio", { gas: portfolioGas }) : item.equipment && item.category === "INDUSTRY_NEWS" ? t("take_equipment") : t(`take_${item.category}`)}
              </MicroBadge>
              <span className="text-[11.5px] text-slate-500 dark:text-ink-muted">{[item.source ?? t("curated"), day(item.publishedAt)].filter(Boolean).join(" · ")}</span>
              <button
                type="button"
                onClick={() => bookmark(item)}
                aria-pressed={item.saved}
                aria-label={item.saved ? t("unsave") : t("save")}
                className={`ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                  item.saved ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "border-slate-900/[.1] text-slate-500 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-400"
                }`}
                data-hub-bookmark={item.saved ? "on" : "off"}
              >
                <Star size={14} strokeWidth={2.2} fill={item.saved ? "currentColor" : "none"} />
              </button>
            </div>
            <h3 className="m-0 mt-2 text-[14.5px] font-semibold leading-[1.4] tracking-[-.015em]" lang={item.origin === "feed" ? "en" : undefined}>
              {item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {item.title}
                  <ExternalLink size={12} strokeWidth={2.2} className="ml-1 inline align-[-1px] text-slate-400" />
                </a>
              ) : (
                item.title
              )}
            </h3>
            {!compact && item.content && (
              <p className="m-0 mt-1 text-[13px] leading-[1.55] text-slate-600 dark:text-slate-300" lang={item.origin === "feed" ? "en" : undefined}>
                {item.content}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-hub-poll={voted ? "voted" : "open"}>
              <span className="mr-1 text-[11.5px] text-slate-500 dark:text-ink-muted">{t("pollQuestion")}</span>
              {(["UP", "DOWN", "FLAT"] as const).map((c) => {
                const share = total > 0 ? Math.round((item.tally[c] / total) * 100) : 0;
                const mine = item.myVote === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => vote(item, c)}
                    aria-pressed={mine}
                    className={`relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${
                      mine ? "border-blue-600/50 text-blue-800 dark:border-blue-400/50 dark:text-blue-200" : "border-slate-900/[.1] text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-300"
                    }`}
                    data-hub-vote={c}
                  >
                    {voted && <span aria-hidden className="absolute inset-y-0 left-0 bg-blue-600/[.1] dark:bg-blue-400/[.14]" style={{ width: `${share}%` }} />}
                    <span className="relative">{VOTE_ICON[c]}</span>
                    <span className="relative">{t(`vote_${c}`)}</span>
                    {voted && <span className="relative tabular-nums" data-hub-vote-share>{share}%</span>}
                  </button>
                );
              })}
              {voted && <span className="text-[11.5px] text-slate-500 tabular-nums dark:text-ink-muted">{t("votes", { n: total })}</span>}
            </div>
          </article>
        );
      })}

      {filter === "saved" &&
        data.savedArchive.map((b) => (
          <div key={b.id} className="border-b border-slate-900/[.06] px-5 py-3.5 last:border-b-0 dark:border-white/[.06]" data-hub-saved-archive>
            <div className="text-[11.5px] text-slate-500 dark:text-ink-muted">{[b.source, t("savedOn", { date: day(b.savedAt) ?? "" })].filter(Boolean).join(" · ")}</div>
            <div className="mt-1 text-[14px] font-semibold tracking-[-.015em]">
              {b.link ? (
                <a href={b.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {b.title}
                </a>
              ) : (
                b.title
              )}
            </div>
          </div>
        ))}

      {onShowAll && list.length > shown.length && (
        <div className="px-5 py-3">
          <button type="button" onClick={onShowAll} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-hub-digest-all>
            {t("allNews", { n: list.length })}
            <ArrowRight size={14} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}
