import { getFormatter, getTranslations } from "next-intl/server";
import { ExternalLink, TrendingUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMarketAlerts } from "@/lib/data";
import type { MarketAlertTag } from "@/lib/services/newsFetcher";

/**
 * The dashboard's Market Alerts widget, rendered entirely on the server.
 *
 * It awaits the news fetcher itself rather than taking the articles as
 * props: `getMarketAlerts()` is behind a one-hour `unstable_cache`, so the
 * home page's own call and this one resolve from the same entry and cost a
 * single request to the publisher. Nothing here is interactive, so none of
 * it ships to the browser.
 */

const TAG_KEY: Record<MarketAlertTag, string> = {
  REGULATION: "tagRegulation",
  PRICE_TREND: "tagPriceTrend",
  SUPPLY: "tagSupply",
  INDUSTRY_NEWS: "tagIndustryNews",
};

export default async function MarketAlertsCard() {
  const [alerts, t, td, format] = await Promise.all([
    getMarketAlerts(),
    getTranslations("HomeDesktop"),
    getTranslations("Dashboard"),
    getFormatter(),
  ]);

  return (
    <div
      data-market-alerts
      className="flex h-full flex-col rounded-[28px] border border-slate-900/[.06] bg-white/[.66] p-6 shadow-[0_26px_56px_-40px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
            <TrendingUp className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="text-sm font-semibold tracking-tight">{td("marketAlerts")}</span>
        </span>
        <span className="text-[11px] text-slate-400 dark:text-ink-muted">{t("liveTag")}</span>
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-3">
        {alerts.length > 0 ? (
          alerts.map((alert) => {
            const warning = alert.tone === "warning";
            const published = alert.publishedAt ? new Date(alert.publishedAt) : null;
            return (
              <a
                key={alert.id}
                href={alert.link}
                target="_blank"
                rel="noopener noreferrer"
                data-market-alert={alert.tag}
                className="group block rounded-[18px] border border-slate-900/[.05] bg-white px-4 py-3.5 shadow-sm transition-[background-color,border-color,box-shadow] duration-200 hover:border-blue-600/25 hover:shadow-[0_0_26px_-10px_rgba(37,99,235,.55)] dark:border-white/[.06] dark:bg-surface dark:hover:border-blue-400/30 dark:hover:bg-white/5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10.5px] font-semibold tracking-[.04em] ${
                      warning ? "text-orange-600 dark:text-orange-400" : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {td(TAG_KEY[alert.tag])}
                  </span>
                  <ExternalLink
                    className="h-3 w-3 flex-none text-slate-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-ink-muted"
                    strokeWidth={2}
                    aria-hidden
                  />
                </span>

                <span className="mt-1.5 block text-[13.5px] font-semibold leading-[1.35] tracking-tight group-hover:text-blue-700 dark:group-hover:text-blue-400">
                  {alert.title}
                </span>

                {alert.body && (
                  <span className="mt-1.5 block text-[11.5px] leading-relaxed text-slate-400 dark:text-ink-muted">
                    {alert.body}
                  </span>
                )}

                {/* Provenance: which publication, and how fresh. */}
                <span className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-400 dark:text-ink-muted">
                  <span className="truncate">{alert.source}</span>
                  {published && (
                    <>
                      <span aria-hidden>·</span>
                      <time dateTime={alert.publishedAt ?? undefined} className="flex-none">
                        {format.relativeTime(published)}
                      </time>
                    </>
                  )}
                </span>
              </a>
            );
          })
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-[12.5px] text-slate-400 dark:text-ink-muted">
            {t("noAlerts")}
          </div>
        )}
      </div>

      <Link
        href="/profile/settings"
        className="mt-4 flex h-11 items-center justify-center rounded-2xl border border-slate-900/[.12] bg-white text-[13px] font-semibold tracking-tight hover:border-slate-900/30 dark:border-hairline-strong dark:bg-surface dark:hover:border-white/30"
      >
        {t("managePriceAlerts")}
      </Link>
    </div>
  );
}
