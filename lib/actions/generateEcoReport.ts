"use server";

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "@/auth";
import { localizeAiText, resolveLocale } from "@/lib/aiLocalization";
import {
  HIGH_GWP_THRESHOLD,
  getGreenerAlternatives,
  getUserCylinderBalance,
  getUserGWPFootprint,
  getUserSpendTrend,
} from "@/lib/user/analytics";

/**
 * The AI executive summary on /profile/analytics.
 *
 * Reads the buyer's own aggregates and writes two paragraphs they can put in
 * front of management.
 *
 * ── What the model is and is not allowed to do ─────────────────────────
 *
 * Every figure it may state is computed here and passed in. It is told not to
 * introduce any other number, because this is a document a customer will
 * forward internally, and an invented tonnage in a "compliance" summary is
 * worse than no summary.
 *
 * Greener alternatives are resolved against the live catalogue by
 * getGreenerAlternatives() rather than left to the model. Asked to "suggest
 * greener alternatives" unaided, a model names whatever it knows — and this
 * shop has nine unpriced products and several out-of-stock lines, so a
 * confident suggestion for something we cannot sell is the exact
 * fake-availability failure the F-Gas assistant's suggestProduct tool exists
 * to prevent. If nothing lower-GWP is sellable, the model is told to say
 * nothing rather than improvise.
 *
 * It is also forbidden from calling the buyer compliant. Quotas bind
 * importers, not buyers, and leak-check intervals follow each installed
 * system's charge — see lib/compliance.ts. A summary that reads as a
 * clean bill of health would be a liability in an audit file.
 */

const SYSTEM_PROMPT = `You are an F-Gas compliance auditor writing a short executive summary for a commercial refrigeration buyer, to be read by their management.

Write exactly two paragraphs of plain prose. No headings, no bullet lists, no markdown.

Tone: professional, corporate, encouraging. You are describing what this account has bought and what it implies, not scolding them.

PARAGRAPH 1 — their purchasing and carbon position. State the total CO2-equivalent and the refrigerant mass, name the gases that dominate the footprint, and mention the spend trend if the DATA shows one.

PARAGRAPH 2 — what to do next. If DATA lists greenerAlternatives, recommend them by name and quote the GWP reduction given. If that list is empty, do not name any product at all — say instead that their current mix already sits below the Article 13 threshold, or that a specialist can advise on options, whichever the data supports.

HARD RULES:
- Use ONLY the figures in DATA. Never introduce, estimate or round a number that is not there. If a figure you want is absent, write around it.
- Every percentage in byRefrigerant is shareOfCo2ePercent — a share of CO2-equivalent, never of mass, spend or cylinder count. If you quote one, say what it is a share of. Never attach it to a kilogram figure.
- Never recommend a refrigerant that is not in greenerAlternatives. That list is what we can actually supply; anything else may not exist or may be unbuyable.
- NEVER use the words "compliant", "compliance", "certified" or "certification" anywhere, in any sense — not about the account, not about a strategy, not as an adjective, not in a closing flourish. This is a record of what was purchased. F-Gas quotas bind producers and importers, not buyers, and leak-check intervals depend on each installed system's charge — none of which can be concluded from purchase history. Say what the data shows and stop. Write "regulatory position", "the Article 13 restriction" or "lower-GWP" instead.
- Do not mention cylinders being "owed" as a compliance matter; outstanding cylinders are a deposit and logistics item, not a regulatory one.
- Article 13 (Regulation 517/2014) is the one rule you may cite: since 1 January 2020, virgin HFCs with a GWP of ${HIGH_GWP_THRESHOLD} or more may not service refrigeration equipment charged at 40 tonnes CO2e or more. Cite it only if the data shows exposure to it.
- Around 140–190 words total.`;

/**
 * Words this document may never contain. A prompt rule alone does not hold —
 * the model reached for "compliant" as a closing adjective on the very first
 * generation — so the output is checked before it is returned.
 */
const FORBIDDEN = /\b(compliant|compliance|certified|certification)\b/i;

export type EcoReportResult =
  | { ok: true; summary: string; generatedAt: string; locale: string }
  | { ok: false; code: "UNAUTHENTICATED" | "NO_DATA" | "NOT_CONFIGURED" | "UNAVAILABLE" };

/** Trend direction stated in words, so the model never has to infer it from the series. */
function describeTrend(spend: number[]): string {
  const active = spend.filter((v) => v > 0);
  if (active.length < 2) return "insufficient history to describe a trend";
  const half = Math.floor(spend.length / 2);
  const first = spend.slice(0, half).reduce((a, b) => a + b, 0);
  const second = spend.slice(half).reduce((a, b) => a + b, 0);
  if (first === 0) return "spending began part-way through the period";
  const change = Math.round(((second - first) / first) * 100);
  if (Math.abs(change) < 10) return "broadly flat across the period";
  return change > 0
    ? `up roughly ${change}% in the second half of the period`
    : `down roughly ${Math.abs(change)}% in the second half of the period`;
}

/**
 * @param localeInput the reader's locale, from `useLocale()` on the client.
 *   Validated against the routing table before it reaches a prompt — it is a
 *   request-body field, so it is untrusted text until it is checked.
 */
export async function generateEcoReport(localeInput?: string): Promise<EcoReportResult> {
  const locale = resolveLocale(localeInput);

  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: "UNAUTHENTICATED" };

  const [footprint, trend, cylinders] = await Promise.all([
    getUserGWPFootprint(),
    getUserSpendTrend(12),
    getUserCylinderBalance(),
  ]);

  // Nothing bought yet: there is no report to write, and asking a model to
  // summarise zero would produce filler.
  if (footprint.byRefrigerant.length === 0) return { ok: false, code: "NO_DATA" };

  const alternatives = await getGreenerAlternatives(footprint);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("[ECO-REPORT] OPENAI_API_KEY is not set.");
    return { ok: false, code: "NOT_CONFIGURED" };
  }

  // Handed over as explicit, pre-computed facts. The model does no arithmetic.
  const data = {
    totalCo2eTonnes: footprint.totalCo2eTonnes,
    totalRefrigerantKg: footprint.totalMassKg,
    byRefrigerant: footprint.byRefrigerant.map((r) => ({
      refrigerant: r.refrigerant,
      gwp: r.gwp,
      massKg: r.massKg,
      co2eTonnes: r.co2eTonnes,
      // Named for what it is. As plain `sharePercent` the model wrote
      // "R-404A accounts for 51% of your total refrigerant mass at 30 kg" —
      // 51% is its share of CO2e, while 30 kg of 130 kg is 23% of mass. Two
      // correct figures welded into one wrong sentence.
      shareOfCo2ePercent: Math.round(r.share * 100),
      aboveArticle13Threshold: r.highGwp,
    })),
    article13: {
      thresholdGwp: HIGH_GWP_THRESHOLD,
      exposedTonnes: footprint.highGwpTonnes,
      exposedSharePercent: Math.round(footprint.highGwpShare * 100),
      refrigerants: footprint.highGwpRefrigerants,
    },
    spend: {
      last12Months: trend.map((p) => ({ month: p.month, eur: p.spend, cylinders: p.cylinders })),
      totalEur: Math.round(trend.reduce((n, p) => n + p.spend, 0)),
      trend: describeTrend(trend.map((p) => p.spend)),
    },
    cylindersOutstanding: cylinders.outstanding,
    greenerAlternatives: alternatives,
    // Stated so the model can hedge honestly instead of presenting a lower
    // bound as a complete figure.
    linesWithoutGwp: footprint.unknownGwpLines,
  };

  try {
    const ask = (correction?: string) =>
      generateText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        prompt: correction
          ? `DATA:\n${JSON.stringify(data, null, 2)}\n\n${correction}`
          : `DATA:\n${JSON.stringify(data, null, 2)}`,
        temperature: 0.4,
        maxRetries: 1,
      });

    let summary = (await ask()).text.trim();

    // The prompt forbids the compliance vocabulary; this enforces it.
    // Measured, not hypothetical: the first version closed with "ensuring
    // your refrigeration strategy is both compliant and forward-thinking" —
    // slipped in as an adjective about strategy rather than a claim about the
    // account, which is exactly how that word would end up in an audit file.
    // One correction attempt, then refuse: a summary that reads as a clean
    // bill of health is worse than no summary.
    if (FORBIDDEN.test(summary)) {
      console.warn("[ECO-REPORT] forbidden compliance wording; regenerating once.");
      summary = (
        await ask(
          'Your previous attempt used the word "compliant", "compliance", "certified" or "certification". Rewrite it with none of those words in any form or sense.'
        )
      ).text.trim();
    }
    if (FORBIDDEN.test(summary)) {
      console.error("[ECO-REPORT] still asserting compliance after a retry; refusing to return it.");
      return { ok: false, code: "UNAVAILABLE" };
    }

    if (!summary) return { ok: false, code: "UNAVAILABLE" };

    // Generated and vetted in English above; translated only now. The guard
    // that matters has already run on text it could actually read, and
    // FORBIDDEN is handed to the translator too so a borrowed "Compliance"
    // cannot sneak back in. Any failure returns the English summary.
    const localized = await localizeAiText({
      text: summary,
      locale,
      context: "a two-paragraph F-Gas carbon executive summary for a refrigeration buyer's management",
      forbidden: FORBIDDEN,
      label: "ECO-REPORT",
    });

    return { ok: true, summary: localized, generatedAt: new Date().toISOString(), locale };
  } catch (error) {
    console.error("[ECO-REPORT] generation failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
