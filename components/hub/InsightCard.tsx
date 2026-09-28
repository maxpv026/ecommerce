import { useFormatter, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { InsightItem } from "@/lib/marketInsights";

/**
 * One market insight.
 *
 * Renders both sources the hub merges — a curated `MarketInsight` row and a
 * story from the live trade feed — because to a buyer they are the same kind
 * of thing: something that happened which bears on their gases. The
 * difference that does matter is provenance, so a feed row carries its
 * publication and links out, and a curated row is marked as ours. Nothing
 * from an external publisher is ever presented as our own analysis.
 *
 * HIGH severity gets the amber ring. Applied narrowly on purpose: the glow
 * is the page's loudest signal, and on a board where everything glows nothing
 * does. Feed severity is inferred from the story's category, which is a guess
 * — see FEED_SEVERITY in lib/marketInsights.ts — so only regulation and
 * supply stories can reach HIGH, never general industry news.
 *
 * A Server Component that uses `useTranslations` rather than the async
 * `getTranslations`: it renders no data of its own and awaits nothing, so
 * keeping it synchronous keeps it off the client bundle. Note the ONE thing
 * that stays untranslated — `insight.title` and `insight.content`. Curated
 * rows are authored in one language and feed rows come from the publisher; a
 * translation key cannot reach either, and machine-translating a regulatory
 * headline on the way to the screen is exactly how a date or a threshold
 * gets quietly altered.
 */

const SEVERITY: Record<
  InsightItem["severity"],
  { ring: string; chip: string; labelKey: "severityHigh" | "severityMedium" | "severityLow" }
> = {
  HIGH: {
    ring: "border-amber-500/45 shadow-[0_0_30px_-14px_rgba(245,158,11,.75)] dark:border-amber-400/40 dark:shadow-[0_0_34px_-14px_rgba(251,191,36,.6)]",
    chip: "bg-amber-50 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
    labelKey: "severityHigh",
  },
  MEDIUM: {
    ring: "border-slate-900/[.07] dark:border-hairline",
    chip: "bg-slate-100 text-slate-600 dark:bg-white/[.07] dark:text-slate-300",
    labelKey: "severityMedium",
  },
  LOW: {
    ring: "border-slate-900/[.06] dark:border-hairline",
    chip: "bg-slate-50 text-slate-500 dark:bg-white/[.05] dark:text-ink-muted",
    labelKey: "severityLow",
  },
};

export default function InsightCard({
  insight,
  /** Refrigerants this account buys — matches get the highlighted tag. */
  ownedRefrigerants = [],
}: {
  insight: InsightItem;
  ownedRefrigerants?: string[];
}) {
  const t = useTranslations("Hub");
  const format = useFormatter();

  const s = SEVERITY[insight.severity];
  const owned = new Set(ownedRefrigerants);
  const published = insight.publishedAt ? new Date(insight.publishedAt) : null;
  const isLink = insight.origin === "feed" && Boolean(insight.link);

  const body = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-[7px] px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[.06em] ${s.chip}`}
        >
          {t(s.labelKey)}
        </span>
        {insight.origin === "curated" ? (
          <span className="text-[10px] font-semibold uppercase tracking-[.07em] text-blue-700 dark:text-blue-400">
            {t("curatedBadge")}
          </span>
        ) : null}
        {published ? (
          <time
            dateTime={insight.publishedAt ?? undefined}
            className="ml-auto flex-none text-[10.5px] tabular-nums text-slate-400 dark:text-ink-muted"
          >
            {format.dateTime(published, { day: "numeric", month: "short" })}
          </time>
        ) : null}
        {isLink ? (
          <ExternalLink
            size={12}
            strokeWidth={2}
            aria-hidden
            className="flex-none text-slate-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-ink-muted"
          />
        ) : null}
      </span>

      <span className="mt-2 block text-[13.5px] font-semibold leading-[1.4] tracking-[-.015em] text-pretty group-hover:text-blue-700 dark:group-hover:text-blue-400">
        {insight.title}
      </span>

      {insight.content ? (
        <span className="mt-1.5 block text-[12px] leading-[1.6] text-slate-500 text-pretty dark:text-ink-muted">
          {insight.content}
        </span>
      ) : null}

      <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {insight.tags.slice(0, 5).map((tag) => (
          <span
            key={tag}
            className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold tracking-[-.01em] ${
              owned.has(tag)
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25"
                : "bg-slate-100/80 text-slate-500 dark:bg-white/[.05] dark:text-ink-muted"
            }`}
            title={owned.has(tag) ? t("ownedTagTitle") : undefined}
          >
            {tag}
          </span>
        ))}
        {insight.source ? (
          <span className="ml-auto truncate text-[10.5px] text-slate-400 dark:text-ink-muted">
            {insight.source}
          </span>
        ) : null}
      </span>
    </>
  );

  const shell = `group block rounded-[20px] border bg-white/[.72] p-4 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 dark:bg-glass ${s.ring}`;

  // A curated row has nowhere to go, so it must not be a link: an anchor with
  // no destination still takes focus and still looks clickable.
  return isLink ? (
    <a
      href={insight.link}
      target="_blank"
      rel="noopener noreferrer"
      data-hub-insight={insight.severity}
      className={`${shell} hover:border-blue-600/30 dark:hover:border-blue-400/30`}
    >
      {body}
    </a>
  ) : (
    <article data-hub-insight={insight.severity} className={shell}>
      {body}
    </article>
  );
}
