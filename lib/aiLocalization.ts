import "server-only";

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { routing } from "@/i18n/routing";

/**
 * Localising AI-written copy without losing the guards that vet it.
 *
 * ── Why this is a second pass and not a prompt line ────────────────────
 *
 * The obvious way to localise `generateEcoReport` and `getPersonalizedFeed`
 * is one line in the system prompt: "write in locale X". It works, and it
 * quietly disables the only safety net either of them has.
 *
 * Both check their output with regexes, and both sets of regexes are English.
 * The eco report may never say "compliant"; the briefing may never forecast a
 * price, tell the buyer to time a purchase, or describe a live restriction as
 * "upcoming". Ask the model for German and `/\bcompliant\b/i` matches nothing
 * — the guard returns clean on text nobody has vetted, in 28 of the 29
 * locales this app ships. And these are not theoretical failures: the model
 * has written both "compliant" as a closing adjective and "the upcoming
 * Article 13 service ban" for a ban that has been in force since 2020.
 *
 * Extending the regexes to 29 languages is not a real option either. That is
 * four rule classes across languages nobody here can proof-read, which is a
 * guard that only looks like one.
 *
 * So generation stays in English, the existing deterministic checks run
 * unchanged on text they can read, and only approved text is translated.
 * Translation is a far narrower operation than generation — it has no reason
 * to introduce a price forecast that was not there — and the structural check
 * below catches the one failure it does have: quietly changing a number.
 *
 * On any failure the English is returned. That is exactly what shipped
 * before this module existed, so the worst case is the status quo rather than
 * an empty card.
 */

/** Languages, by code, for the translation prompt. */
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * A locale code that is safe to interpolate into a prompt.
 *
 * The locale arrives from the client — a `useLocale()` value handed to a
 * server action — and a server action's arguments are an HTTP request body
 * that anyone can shape. Unchecked, `locale` is a free-text field spliced
 * straight into a system prompt, which is the whole prompt-injection surface
 * in one parameter. Only the 29 codes in the routing table get through.
 */
export function resolveLocale(input: unknown): string {
  const known = routing.locales as readonly string[];
  return typeof input === "string" && known.includes(input) ? input : routing.defaultLocale;
}

/** Whether a locale needs translating at all. */
export const isSourceLocale = (locale: string) => locale === routing.defaultLocale;

/**
 * Maximal digit runs, in order: "483.24 t · GWP 3,922" → ["483","24","3","922"].
 *
 * Comparing these rather than parsed numbers sidesteps locale formatting
 * entirely — "3,922" and "3.922" and "3 922" all yield ["3","922"] — while
 * still catching a translation that invents a tonnage or drops a threshold.
 */
function digitRuns(text: string): string[] {
  return [...text.matchAll(/\d+/g)].map((m) => m[0]).sort();
}

const sameRuns = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const TRANSLATE_SYSTEM = `You translate a finished document. You are not writing, editing, summarising or improving it.

You MUST write your response in the language corresponding to the locale code given in the request. Do not use English unless that locale code is "en".

RULES:
- Translate faithfully. Add nothing, remove nothing, and do not soften, strengthen, hedge or qualify any statement.
- Reproduce every number exactly as it appears. Do not convert units, re-round, recalculate or reformat a figure. If the source says 483.24, the translation says 483.24.
- Keep verbatim: refrigerant designations (R-404A, R-32, R-449A, HFC, HFO), "F-Gas", the brand name "My Energy", and unit symbols (kg, t, CO2e, EUR).
- "GWP" may take the official local abbreviation where the EU F-Gas Regulation has one (Ukrainian ПГП); otherwise keep GWP.
- "Article 13" refers to an article of EU Regulation 517/2014: translate the word "Article", keep the number.
- Preserve the paragraph structure exactly — same number of paragraphs, same breaks.
- Register: professional, commercial, understated. Use the formal address form where the language has one.
- Output ONLY the translated text. No preamble, no notes, no quotation marks around it.`;

export interface LocalizeOptions {
  /** Approved English text. Must already have passed its own guards. */
  text: string;
  /** Validated locale — pass it through resolveLocale first. */
  locale: string;
  /** What the document is, so the model picks the right register. */
  context: string;
  /**
   * Re-run on the translation. Catches a forbidden English term surviving as
   * a loanword — German and Dutch both borrow "Compliance" — which would
   * otherwise walk straight past a guard that only inspected the English.
   */
  forbidden?: RegExp;
  model?: string;
  /** Tag for log lines. */
  label?: string;
}

/**
 * Translates approved copy, or returns the English unchanged.
 *
 * Never throws and never returns empty: every failure path degrades to the
 * source text, because a localised card is a nice-to-have and a blank one is
 * a bug.
 */
export async function localizeAiText({
  text,
  locale,
  context,
  forbidden,
  model = "gpt-4o-mini",
  label = "AI-L10N",
}: LocalizeOptions): Promise<string> {
  if (isSourceLocale(locale) || !text.trim()) return text;

  const language = LANGUAGE_NAMES.of(locale) ?? locale;

  try {
    const { text: out } = await generateText({
      model: openai(model),
      system: TRANSLATE_SYSTEM,
      prompt: [
        `Target language: ${language} (locale code "${locale}").`,
        `Document type: ${context}.`,
        "",
        "Translate the text between the markers. Do not include the markers.",
        "",
        "---BEGIN---",
        text,
        "---END---",
      ].join("\n"),
      temperature: 0.1,
      maxRetries: 1,
    });

    const translated = out.trim().replace(/^---BEGIN---\s*/i, "").replace(/\s*---END---$/i, "");

    if (!translated) {
      console.error(`[${label}] empty translation for ${locale}; serving English.`);
      return text;
    }

    // A model that answers instead of translating, or pads with a note.
    if (translated.length > text.length * 2.5 || translated.length < text.length * 0.4) {
      console.error(
        `[${label}] translation length implausible for ${locale} ` +
          `(${text.length} → ${translated.length}); serving English.`
      );
      return text;
    }

    if (!sameRuns(digitRuns(text), digitRuns(translated))) {
      console.error(
        `[${label}] translation changed the figures for ${locale} ` +
          `(${digitRuns(text).join(",")} → ${digitRuns(translated).join(",")}); serving English.`
      );
      return text;
    }

    const sourceParas = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
    const outParas = translated.split(/\n\s*\n/).filter((p) => p.trim()).length;
    if (sourceParas !== outParas) {
      console.error(
        `[${label}] paragraph count changed for ${locale} (${sourceParas} → ${outParas}); serving English.`
      );
      return text;
    }

    if (forbidden?.test(translated)) {
      console.error(`[${label}] translation reintroduced forbidden wording for ${locale}; serving English.`);
      return text;
    }

    return translated;
  } catch (error) {
    console.error(`[${label}] translation failed for ${locale}:`, error);
    return text;
  }
}
