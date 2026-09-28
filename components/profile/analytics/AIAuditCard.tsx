"use client";

import { useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Loader2, RotateCw, Sparkles } from "lucide-react";
import { generateEcoReport, type EcoReportResult } from "@/lib/actions/generateEcoReport";
import { PANEL } from "./primitives";

/**
 * The AI executive summary, generated on demand.
 *
 * This used to await generateEcoReport() during render inside a Suspense
 * boundary. It worked, but it spent a gpt-4o-mini call on every page view —
 * including refreshes, and including the many visits where nobody wanted a
 * summary. The underlying figures only move when the buyer orders, so the
 * call was almost always regenerating the same paragraphs.
 *
 * On demand also fits what the thing is: a report you produce when you need
 * one, not a widget that fills itself in.
 *
 * Client component now, which is also the correct way round for a server
 * action — actions are designed to be invoked from the client, not awaited
 * during a server render.
 *
 * The summary body is localised too, now — `useLocale()` goes into the action
 * and the text comes back in the reader's language. It is written and vetted
 * in English first and translated only after the compliance-vocabulary guard
 * has passed, because that guard is an English regex and would wave through
 * anything it could not read; see lib/aiLocalization.ts.
 */

/** Copy key per failure, and whether trying again could plausibly help. */
const FAILURE = {
  NO_DATA: { key: "auditErrNoData", retryable: false },
  NOT_CONFIGURED: { key: "auditErrNotConfigured", retryable: false },
  UNAUTHENTICATED: { key: "auditErrUnauthenticated", retryable: false },
  UNAVAILABLE: { key: "auditErrUnavailable", retryable: true },
} as const;

export default function AIAuditCard() {
  const t = useTranslations("Analytics");
  const format = useFormatter();
  // Handed to the action so the summary comes back in the reader's language.
  // The action re-validates it against the routing table — a server action's
  // arguments are a request body, so this value is a hint, not a guarantee.
  const locale = useLocale();
  const [result, setResult] = useState<EcoReportResult | null>(null);
  const [pending, startGenerating] = useTransition();

  const generate = () => {
    startGenerating(async () => {
      // The action returns a typed failure rather than throwing, so there is
      // nothing here that can take the page down — but a transport-level
      // error still can, and an unhandled rejection inside a transition is a
      // blank card with no explanation.
      try {
        setResult(await generateEcoReport(locale));
      } catch (error) {
        console.error("[eco-report] request failed:", error);
        setResult({ ok: false, code: "UNAVAILABLE" });
      }
    });
  };

  const failure =
    result && !result.ok
      ? FAILURE[result.code as keyof typeof FAILURE] ?? FAILURE.UNAVAILABLE
      : null;
  const hasReport = result?.ok === true;

  return (
    <section className={`${PANEL} overflow-hidden`} data-eco-report>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-slate-900/[.06] px-5 py-3.5 dark:border-hairline">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[8px] border border-slate-900/[.08] bg-slate-900 text-white dark:border-white/10 dark:bg-slate-50 dark:text-slate-900">
          <Sparkles size={12} strokeWidth={2} />
        </span>
        <h2 className="m-0 text-[13px] font-semibold tracking-[-.02em]">{t("auditTitle")}</h2>
        {hasReport ? (
          <span className="ml-auto text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
            {format
              .dateTime(new Date((result as { generatedAt: string }).generatedAt), {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
              .toUpperCase()}
          </span>
        ) : null}
      </header>

      {/* ── Result ── */}
      {hasReport ? (
        <>
          <div className="flex flex-col gap-3.5 px-5 py-5">
            {(result as { summary: string }).summary
              .split("\n")
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p
                  key={i}
                  className="m-0 text-[13.5px] leading-[1.7] text-slate-700 text-pretty dark:text-slate-300"
                >
                  {paragraph}
                </p>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-900/[.06] px-5 py-3 dark:border-hairline">
            {/* Says what the document is, for the same reason the PDF carries
                a scope block: a reading of purchase data, not a statement of
                the account's regulatory position. */}
            <p className="m-0 min-w-0 flex-1 text-[11px] leading-[1.55] text-slate-400 dark:text-slate-500">
              {t("auditScopeNote")}
            </p>
            {/* Demoted to a text button once a report exists: regenerating is
                the rare action, and a second filled button would compete with
                the audit export below. */}
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              data-eco-regenerate
              className="inline-flex min-h-[32px] flex-none items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/[.06]"
            >
              {pending ? (
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <RotateCw size={13} strokeWidth={2} />
              )}
              {pending ? t("auditRegenerating") : t("auditRegenerate")}
            </button>
          </div>
        </>
      ) : (
        /* ── Call to action, and every failure state ── */
        <div className="flex flex-col items-start gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 max-w-[62ch]">
            <p className="m-0 text-[13px] leading-[1.65] text-slate-600 dark:text-slate-400">
              {t("auditDescription")}
            </p>
            {failure ? (
              <p
                className="m-0 mt-2 text-[12.5px] leading-[1.55] text-amber-700 dark:text-amber-500"
                data-eco-error
              >
                {t(failure.key)}
              </p>
            ) : null}
          </div>

          {/* Hidden only where retrying cannot help — no key configured, no
              purchases, no session. Leaving a live button on those would
              invite a click that fails the same way every time. */}
          {failure && !failure.retryable ? null : (
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              data-eco-generate
              className="inline-flex min-h-[44px] flex-none items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[13.5px] font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-14px_rgba(29,78,216,0.9)] transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-[38px] lg:px-4 lg:text-[13px]"
            >
              {pending ? (
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
              ) : (
                <Sparkles size={15} strokeWidth={2} />
              )}
              {pending
                ? t("auditGenerating")
                : failure
                  ? t("auditRetry")
                  : t("auditGenerate")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
