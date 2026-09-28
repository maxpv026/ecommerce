import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPersonalizedFeed } from "@/lib/actions/getPersonalizedFeed";

/**
 * The hub's personalised market briefing.
 *
 * Server component, awaiting the action directly. That is the opposite of
 * AIAuditCard, which was deliberately moved to an explicit button — and the
 * difference is what each thing is. The audit summary is a document you
 * produce when you need one; a briefing at the top of a dashboard has to be
 * on screen when the page opens, or it is not a briefing. What made the
 * audit card wasteful — a model call per page view — is handled in the action
 * instead: the generation is behind `unstable_cache` keyed on its own inputs,
 * so a refresh is free and the call only recurs when the buyer's figures or
 * the published insights actually move.
 *
 * Every failure renders as copy rather than throwing. The card sits above the
 * whole hub, so an OpenAI outage must cost the briefing, not the page.
 *
 * ── Localisation ───────────────────────────────────────────────────────
 *
 * Every static element — the heading, the badge, the mix chips, the four
 * fallback states, the disclaimer — comes from the `Hub` namespace. The
 * briefing sentence has no key, because it does not exist until runtime; the
 * locale is passed into the action instead and the sentence arrives already
 * written in the reader's language.
 *
 * Note the order inside that action: generated in English, checked against
 * all four content rules, and only then translated. Those rules are English
 * regexes — "upcoming", "prices will surge", "stock up" — so translating
 * first would hand them text they cannot match and every briefing would pass
 * unchecked in 28 of 29 locales. See lib/aiLocalization.ts.
 */

/** Which fallback copy to render, per reason the action reports. */
const FALLBACK = {
  UNAUTHENTICATED: { title: "briefingSignedOutTitle", body: "briefingSignedOutBody", cta: false },
  NO_HISTORY: { title: "briefingNoHistoryTitle", body: "briefingNoHistoryBody", cta: true },
  NOT_CONFIGURED: {
    title: "briefingUnconfiguredTitle",
    body: "briefingUnconfiguredBody",
    cta: false,
  },
  UNAVAILABLE: { title: "briefingUnavailableTitle", body: "briefingUnavailableBody", cta: false },
} as const;

export default async function PersonalizedBriefingCard() {
  // getLocale(), not useLocale(): this is an async Server Component. The
  // briefing comes back already written in this language.
  const locale = await getLocale();
  const [feed, t, format] = await Promise.all([
    getPersonalizedFeed(locale),
    getTranslations("Hub"),
    getFormatter(),
  ]);

  const fallback =
    feed.reason === "OK" ? null : FALLBACK[feed.reason] ?? FALLBACK.UNAVAILABLE;

  return (
    <section
      data-hub-briefing={feed.reason}
      /* Glass: a translucent white wash over a blurred backdrop, a hairline
         ring for the edge, and a long soft shadow so it lifts off the page
         rather than sitting on it. The inner top highlight is the light
         catching the pane's edge — it is what stops this reading as a plain
         grey box with blur switched on. */
      className="relative overflow-hidden rounded-[26px] border border-white/60 bg-gradient-to-br from-white/85 via-white/65 to-blue-50/50 shadow-[0_30px_70px_-46px_rgba(15,23,42,.6)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[.08] dark:from-white/[.07] dark:via-white/[.03] dark:to-blue-500/[.06] dark:shadow-[0_30px_70px_-40px_rgba(0,0,0,.8)]"
    >
      {/* Edge highlight + a soft blue bloom behind the icon. Decoration only. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/15"
      />

      <div className="relative flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex flex-wrap items-center gap-2.5">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[10px] bg-slate-900 text-white shadow-[0_8px_18px_-8px_rgba(15,23,42,.8)] dark:bg-slate-50 dark:text-slate-900">
            <Sparkles size={13} strokeWidth={2} />
          </span>
          <h2 className="m-0 text-[14px] font-semibold tracking-[-.02em]">{t("briefingTitle")}</h2>
          {feed.reason === "OK" ? (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34d399] shadow-[0_0_8px_1px_#34d399]" />
              {t("briefingPersonalised")}
            </span>
          ) : null}
        </header>

        {feed.briefing ? (
          <p className="m-0 max-w-[72ch] text-[15px] leading-[1.65] tracking-[-.011em] text-slate-700 text-pretty dark:text-slate-200">
            {feed.briefing}
          </p>
        ) : (
          <div className="max-w-[72ch]">
            <p className="m-0 text-[14px] font-semibold tracking-[-.015em]">
              {t(fallback!.title)}
            </p>
            <p className="m-0 mt-1.5 text-[13px] leading-[1.6] text-slate-500 text-pretty dark:text-ink-muted">
              {t(fallback!.body)}
            </p>
            {fallback!.cta ? (
              <Link
                href="/products"
                className="mt-3.5 inline-flex min-h-[40px] items-center rounded-[13px] bg-blue-700 px-4 text-[13px] font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-14px_rgba(29,78,216,.9)] transition-colors hover:bg-blue-800"
              >
                {t("briefingNoHistoryCta")}
              </Link>
            ) : null}
          </div>
        )}

        {/* The evidence behind the prose: the gases this account actually buys,
            with each one's real share of its carbon. A briefing that claims
            "68% of your carbon is R-404A" should show the 68% next to it. */}
        {feed.topRefrigerants.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-900/[.07] pt-4 dark:border-hairline">
            <span className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-slate-400 dark:text-ink-muted">
              {t("briefingMixLabel")}
            </span>
            {feed.topRefrigerants.map((r) => (
              <span
                key={r.refrigerant}
                className="flex items-baseline gap-1.5 rounded-full bg-white/70 px-2.5 py-1 ring-1 ring-slate-900/[.07] dark:bg-white/[.06] dark:ring-white/10"
                title={
                  r.gwp !== null ? t("gwpValue", { value: format.number(r.gwp) }) : undefined
                }
              >
                <span className="text-[11.5px] font-semibold tracking-[-.015em]">
                  {r.refrigerant}
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-slate-400 dark:text-ink-muted">
                  {format.number(r.sharePercent / 100, { style: "percent" })}
                </span>
              </span>
            ))}
            <span className="ml-auto text-[10.5px] tracking-[.02em] text-slate-400 dark:text-ink-muted">
              {t("briefingShareLabel")}
            </span>
          </div>
        ) : null}

        {/* Written by a model from this account's own figures, and it says so.
            Same reason the audit card carries a scope line: the reader should
            know what they are looking at before they forward it. */}
        {feed.reason === "OK" ? (
          <p className="m-0 text-[10.5px] leading-[1.5] text-slate-400 dark:text-ink-muted">
            {t("briefingDisclaimer")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
