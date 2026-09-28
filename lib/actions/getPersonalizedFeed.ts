"use server";

import { unstable_cache } from "next/cache";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "@/auth";
import {
  HIGH_GWP_THRESHOLD,
  getGreenerAlternatives,
  getUserGWPFootprint,
  type GreenerAlternative,
} from "@/lib/user/analytics";
import {
  getMarketInsights,
  getTickerRows,
  prioritiseForRefrigerants,
  type InsightItem,
} from "@/lib/marketInsights";
import { localizeAiText, resolveLocale } from "@/lib/aiLocalization";

/**
 * The hub's personalised market briefing.
 *
 * Two sentences tying what this buyer actually purchases to what the market
 * intelligence currently says.
 *
 * ── Where the personalisation comes from ───────────────────────────────
 *
 * `getUserGWPFootprint()` already returns the account's gases ranked by
 * carbon with a share each, which is the "most frequently purchased" signal —
 * computed from `gwpAtPurchase` snapshots, not re-derived here. Insights are
 * then matched against those marks, so the briefing talks about the buyer's
 * own gases rather than whatever happens to be in the news.
 *
 * ── One thing this deliberately will not say ───────────────────────────
 *
 * The brief for this feature used the example "prices are expected to surge
 * due to the upcoming quota phase-down. Consider stocking up now." The
 * regulatory half is fine — quota phase-down dates are real and appear in the
 * insights. The price forecast is not: `Product.pricePerKg` is a single
 * current value with no history and no forward curve anywhere in this system,
 * so "expected to surge" would be the model inventing market data and
 * attributing it to us. A buyer acting on that and stocking up has been given
 * a trading signal we have no basis for.
 *
 * So the model may cite regulation, the buyer's own concentration, and live
 * catalogue rates — and is blocked from forecasting a price, quoting a
 * percentage change, or telling anyone to buy now. The guard below enforces
 * it rather than trusting the prompt, which is the same lesson the eco-report
 * taught when it reached for "compliant" on the first try.
 */

const SYSTEM_PROMPT = `You write a short market briefing for a commercial refrigerant buyer, shown at the top of their dashboard.

Exactly two sentences. Plain prose, no markdown, no greeting, no sign-off. Around 45 words.

Sentence 1 — connect this account's purchasing to something in INSIGHTS. Lead with their concentration, e.g. "With 68% of your carbon in R-404A...". Use only the figures in DATA.
Sentence 2 — what that means for them. Point at the regulatory fact or the supply story from INSIGHTS that applies to those gases.

HARD RULES:
- Use ONLY the figures in DATA. Never introduce a number that is not there.
- Never forecast or predict a price, and never state or imply that prices will rise, fall, surge, spike or climb. There is no price history or forward curve in this system, so any such claim would be invented. You may state a current rate from DATA.pricing if it is useful.
- Never quote a percentage change, movement or trend in a price.
- Never tell the reader to "stock up", "buy now", "act now", "secure supply" or otherwise time a purchase. Describe the situation; the decision is theirs.
- Never re-date a rule. Do not call a restriction upcoming, forthcoming, imminent or soon, and do not say a rule "will" apply. If INSIGHTS gives a date, you may quote that date; if it does not, say nothing at all about when the rule takes effect. A restriction described in INSIGHTS as applying now is in force now.
- Never say the account is compliant or certified — this is purchasing data, not a regulatory position.
- Only name a refrigerant that appears in DATA (their own gases, or DATA.alternatives).
- If INSIGHTS is empty, write one sentence about their concentration and one noting that no market intelligence is published right now. Do not invent news.`;

/**
 * Claims this briefing may never make, grouped by what is wrong with them.
 *
 * A prompt rule alone has not held: the eco-report reached for "compliant" on
 * its first attempt with the same instruction in place, and this briefing
 * reached for "upcoming" with its own rule in place too.
 *
 * Grouped rather than one flat regex because the retry has to be able to say
 * WHICH rule was broken. The first version handed every violation the same
 * correction — "you forecast a price or told the reader to time a purchase" —
 * so when the model wrote "the upcoming Article 13 service ban" it was
 * corrected about prices, kept the word "upcoming", failed twice, and the
 * card fell back to UNAVAILABLE on every single load. A guard that cannot
 * explain itself does not get the second attempt it is designed to allow.
 */
const RULES: Array<{ id: string; test: RegExp; fix: string }> = [
  {
    id: "purchase-timing",
    // Gerunds included — an earlier version caught "stock up" and let
    // "Consider stocking up now" straight through, which is the phrasing a
    // model actually reaches for.
    test: new RegExp(
      [
        /\b(?:stock|stocking|load|loading)\s+up\b/,
        /\bstockpil(?:e|ing)\b/,
        /\b(?:buy|buying|order|ordering|act|acting|purchase|purchasing)\s+(?:now|early|ahead)\b/,
        /\bsecur(?:e|ing)\s+(?:your\s+)?(?:supply|stock|volume)\b/,
        /\bahead of the (?:increase|rise|hike|cut|reduction)\b/,
      ]
        .map((r) => r.source)
        .join("|"),
      "i"
    ),
    fix: "You told the reader to time a purchase. Remove any suggestion to buy, stock up, or act now — describe the situation and leave the decision to them.",
  },
  {
    id: "price-forecast",
    test: new RegExp(
      [
        /\bprices?\s+(?:will|are expected to|is expected to|may|could|should|are likely to)\b/,
        /\b(?:surge|spike|skyrocket|escalate|climb|soar)\b/,
        /\b(?:upward|downward)\s+(?:price\s+)?(?:pressure|trend|trajectory)\b/,
        /\bprice (?:increases?|rises?|hikes?|forecasts?|outlook)\b/,
      ]
        .map((r) => r.source)
        .join("|"),
      "i"
    ),
    fix: "You forecast a price or implied a price movement. There is no price history in this system, so remove it entirely. You may state a current rate from DATA.pricing, nothing about its direction.",
  },
  {
    /**
     * Pushing a live restriction into the future.
     *
     * Measured, not hypothetical: given an insight reading "Art. 13 service
     * ban APPLIES to virgin HFCs at GWP 2500 and above", gpt-4o-mini wrote
     * "the UPCOMING Article 13 service ban". That ban is in force. On a
     * compliance product, telling a buyer a live prohibition has not started
     * yet is the worst error on the page — it invites them to keep doing the
     * prohibited thing.
     *
     * Only the timing adjectives are caught. A date quoted verbatim out of an
     * insight ("from 1 January 2027") is legitimate and must still pass, and
     * so must a genuinely future event the insight dates itself.
     */
    id: "re-dated-rule",
    test: new RegExp(
      [
        /\b(?:upcoming|forthcoming|imminent|soon-to-be|soon to be)\b/,
        /\b(?:ban|prohibition|restriction|phase-?down|phase-?out)s?\s+(?:will|is (?:due|set) to|takes effect)\b/,
      ]
        .map((r) => r.source)
        .join("|"),
      "i"
    ),
    fix: 'You called a restriction upcoming, forthcoming or future. Every rule described in INSIGHTS in the present tense is ALREADY IN FORCE — the Article 13 service ban is in force today. Delete the timing word and state the rule as current. Only quote a date if INSIGHTS gives one explicitly.',
  },
  {
    id: "regulatory-position",
    test: /\b(?:compliant|compliance|certified|certification)\b/i,
    fix: "You stated or implied a compliance or certification position. This is purchasing data and says nothing about whether the account is compliant. Remove the claim.",
  },
];

/** The first rule this text breaks, or null when it breaks none. */
function violationOf(text: string) {
  return RULES.find((r) => r.test.test(text)) ?? null;
}

export interface PersonalizedFeed {
  /** Null when there is nothing to personalise from, or generation failed. */
  briefing: string | null;
  /** Why there is no briefing, for the card's copy. */
  reason: "OK" | "UNAUTHENTICATED" | "NO_HISTORY" | "NOT_CONFIGURED" | "UNAVAILABLE";
  /** The gases this account actually buys, biggest carbon share first. */
  topRefrigerants: Array<{ refrigerant: string; sharePercent: number; gwp: number | null }>;
  /** Insights that mention one of those gases, most severe first. */
  relevant: InsightItem[];
  generatedAt: string;
  /** The locale the briefing was written in. */
  locale: string;
}

/**
 * @param localeInput the reader's locale, from `getLocale()` on the server or
 *   `useLocale()` on the client. Validated before it reaches a prompt.
 */
export async function getPersonalizedFeed(localeInput?: string): Promise<PersonalizedFeed> {
  const locale = resolveLocale(localeInput);
  const generatedAt = new Date().toISOString();
  const base = { briefing: null, topRefrigerants: [], relevant: [], generatedAt, locale };

  const session = await auth();
  if (!session?.user?.id) return { ...base, reason: "UNAUTHENTICATED" };

  const [footprint, insights, ticker] = await Promise.all([
    getUserGWPFootprint(),
    getMarketInsights(10),
    getTickerRows(),
  ]);

  const top = footprint.byRefrigerant.slice(0, 4).map((r) => ({
    refrigerant: r.refrigerant,
    sharePercent: Math.round(r.share * 100),
    gwp: r.gwp,
  }));

  // Same ordering the insight column uses, so the briefing was shown exactly
  // what the buyer is reading beside it.
  const relevant = prioritiseForRefrigerants(
    insights,
    top.map((t) => t.refrigerant)
  );

  if (top.length === 0) return { ...base, reason: "NO_HISTORY", relevant };

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("[HUB] OPENAI_API_KEY is not set.");
    return { ...base, reason: "NOT_CONFIGURED", topRefrigerants: top, relevant };
  }

  // Everything the model is allowed to cite, and nothing else. `pricing` is
  // today's catalogue rate for the buyer's own gases — a current fact, not a
  // trend; `alternatives` is resolved against what this shop can actually
  // ship, so a suggestion can be acted on rather than merely sounding right.
  const marksList = top.map((t) => t.refrigerant);
  const data: BriefingData = {
    topRefrigerants: top,
    totalCo2eTonnes: footprint.totalCo2eTonnes,
    article13: {
      thresholdGwp: HIGH_GWP_THRESHOLD,
      exposedSharePercent: Math.round(footprint.highGwpShare * 100),
      refrigerants: footprint.highGwpRefrigerants,
    },
    pricing: ticker
      .filter((t) => marksList.includes(t.refrigerant))
      .map((t) => ({ refrigerant: t.refrigerant, eurPerKg: t.pricePerKg, inStock: t.available })),
    alternatives: await getGreenerAlternatives(footprint),
  };

  const insightPayload = relevant.map((i) => ({
    title: i.title,
    severity: i.severity,
    tags: i.tags,
    excerpt: i.content.slice(0, 320),
  }));

  try {
    const briefing = await cachedBriefing(data, insightPayload);
    if (!briefing) return { ...base, reason: "UNAVAILABLE", topRefrigerants: top, relevant };

    // Checked again on the way out, not only on the way in.
    //
    // The generation is cached, and `unstable_cache` keys on the arguments —
    // not on SYSTEM_PROMPT or on RULES, which the cached closure merely
    // reads. So tightening a rule does NOT invalidate stored text: without
    // this, text written under the old rules would keep being served,
    // unexamined, until the TTL expired. Found exactly that way — the "no
    // re-dating a regulation" rule was added and the previous briefing came
    // straight back out of the cache still saying "upcoming".
    //
    // Cheap (one regex over ~45 words) and it makes the guard authoritative
    // rather than merely usually-applied.
    const stale = violationOf(briefing);
    if (stale) {
      console.error(`[HUB] cached briefing breaks the ${stale.id} rule; withholding it.`);
      return { ...base, reason: "UNAVAILABLE", topRefrigerants: top, relevant };
    }

    // Only now, after all four rules have run on English. The whole RULES set
    // is regex over English words; translating first would hand them text they
    // cannot read and they would pass everything. See lib/aiLocalization.ts.
    const localized = await localizeCachedBriefing(briefing, locale);

    return { briefing: localized, reason: "OK", topRefrigerants: top, relevant, generatedAt, locale };
  } catch (error) {
    console.error("[HUB] briefing generation failed:", error);
    return { ...base, reason: "UNAVAILABLE", topRefrigerants: top, relevant };
  }
}

/* ── Generation ───────────────────────────────────────────────────────── */

interface BriefingData {
  topRefrigerants: Array<{ refrigerant: string; sharePercent: number; gwp: number | null }>;
  totalCo2eTonnes: number;
  article13: { thresholdGwp: number; exposedSharePercent: number; refrigerants: string[] };
  pricing: Array<{ refrigerant: string; eurPerKg: number; inStock: boolean }>;
  alternatives: GreenerAlternative[];
}

type InsightPayload = Array<{
  title: string;
  severity: InsightItem["severity"];
  tags: string[];
  excerpt: string;
}>;

/**
 * The model call, cached on its own inputs.
 *
 * `unstable_cache` folds the arguments into the cache key, so the payload
 * fingerprints itself: same buyer, same insights, same figures → the stored
 * text. A different account, a new curated row, or another order all change
 * the payload and therefore the key.
 *
 * This exists because of what the eco-report cost before it went on-demand: a
 * gpt-4o-mini call on every single page view, almost always regenerating
 * identical prose, since the inputs only move when the buyer orders. A hub is
 * a page people refresh, so it would have been worse here. On-demand was the
 * right answer for a report you produce deliberately; a briefing at the top of
 * a dashboard has to be there when the page opens, so it gets cached instead.
 *
 * Half an hour, against the news feed's one — the briefing should not still be
 * citing an insight the panel beside it has already dropped.
 */
const cachedBriefing = unstable_cache(
  async (data: BriefingData, insights: InsightPayload): Promise<string> => {
    const ask = (correction?: string) =>
      generateText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        prompt: [
          `DATA:\n${JSON.stringify(data, null, 2)}`,
          `INSIGHTS:\n${JSON.stringify(insights, null, 2)}`,
          correction ?? "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        temperature: 0.4,
        maxRetries: 1,
      });

    let briefing = (await ask()).text.trim();

    // Two corrections, each naming the rule that was actually broken. Two
    // rather than one because a rewrite can trade one violation for another —
    // told to drop "upcoming", a model will reach for "prices may rise".
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const broken = violationOf(briefing);
      if (!broken) break;
      console.warn(`[HUB] briefing broke the ${broken.id} rule; correcting (${attempt + 1}/2).`);
      briefing = (
        await ask(
          `Your previous attempt was rejected. ${broken.fix}\n\nPrevious attempt:\n"${briefing}"\n\nRewrite it, keeping everything else it got right.`
        )
      ).text.trim();
    }

    const broken = violationOf(briefing);
    if (broken) {
      // Throwing rather than returning "" so the failure is never cached: a
      // stored empty string would keep the card in its error state for the
      // whole TTL even though the next attempt might well be clean.
      throw new Error(`briefing still breaks the ${broken.id} rule after two corrections`);
    }

    return briefing;
  },
  ["hub-briefing"],
  { revalidate: 1800, tags: ["hub-briefing"] }
);

/**
 * The translation, cached separately from the generation.
 *
 * Two caches rather than one, and the split is deliberate. If `locale` were
 * an argument to `cachedBriefing` above, every locale would key its own entry
 * and the hub would pay for 29 English generations of the same sentence.
 * Keyed this way the English is written once and shared, and each locale
 * caches only its own translation of it.
 *
 * The English text is itself a cache-key argument, so a regenerated briefing
 * invalidates all 29 translations of the old one automatically — there is no
 * window where a German reader sees last half-hour's sentence.
 *
 * Same TTL as the generation it follows.
 */
const localizeCachedBriefing = unstable_cache(
  async (english: string, locale: string): Promise<string> =>
    localizeAiText({
      text: english,
      locale,
      context: "a two-sentence market briefing on a refrigerant buyer's dashboard",
      // Catches a forbidden English term surviving as a loanword.
      forbidden: RULES.find((r) => r.id === "regulatory-position")!.test,
      label: "HUB",
    }),
  ["hub-briefing-l10n"],
  { revalidate: 1800, tags: ["hub-briefing"] }
);
