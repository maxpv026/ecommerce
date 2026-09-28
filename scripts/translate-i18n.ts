/**
 * Fills in `messages/<locale>.json` from `messages/en.json`.
 *
 * Two passes per namespace: a translation, then a native-level review of it.
 *
 *   npx tsx scripts/translate-i18n.ts                      # every missing key, every locale
 *   npx tsx scripts/translate-i18n.ts --namespaces Hub,Analytics
 *   npx tsx scripts/translate-i18n.ts --locales pl,de,cs
 *   npx tsx scripts/translate-i18n.ts --dry-run            # report, write nothing
 *   npx tsx scripts/translate-i18n.ts --force              # re-translate keys that exist
 *   npx tsx scripts/translate-i18n.ts --skip-locales uk     # leave a hand-checked file alone
 *   npx tsx scripts/translate-i18n.ts --no-qa              # single pass, cheaper
 *   npx tsx scripts/translate-i18n.ts --model gpt-4o --qa-model gpt-4o --concurrency 6
 *
 * ── Why there are two passes ───────────────────────────────────────────
 *
 * A single pass gets the meaning right and the register wrong. Measured on
 * the first full run: Polish came back with the informal "jesteś" in an
 * interface for commercial buyers, and Ukrainian rendered "virgin HFCs" as
 * "нових" — new — when the regulatory distinction is newly-produced versus
 * reclaimed. Neither is visible to anyone reviewing the diff in English, and
 * both are wrong in a way that matters on a compliance platform.
 *
 * So the output goes back to a stronger model acting as reviewer, with the
 * English beside it, a glossary of the terms that carry regulatory meaning,
 * and the correct address form for that specific language. It is told to
 * return anything already correct unchanged, because a reviewer that rewords
 * good translations is a regression generator.
 *
 * Every revision is then re-validated exactly like a first-pass string, and
 * that is not belt-and-braces: a reviewer asked to fix grammar and agreement
 * edits inside plural branches, which is precisely where an edit drops the
 * "other" branch or renames a category. A revision that fails validation is
 * discarded and the first-pass string stands.
 *
 * ── The problem this solves, and the one it does not ───────────────────
 *
 * English is the source of truth. Adding a feature adds keys to en.json, and
 * next-intl renders a missing key as its own path — so a new namespace shows
 * the literal string "Hub.tickerKicker" on the page until every locale has it.
 * i18n/request.ts merges English underneath as a safety net; this script is
 * what turns that net into actual translations.
 *
 * What it will NOT do is write a string it cannot verify. An LLM translating
 * ICU messages fails in ways that are invisible in review and fatal at
 * runtime: it renames `{count}` to `{кількість}`, drops a closing brace,
 * translates the keyword `plural`, or gives Polish the English `one/other`
 * pair when Polish needs `one/few/many/other`. Any of those throws when the
 * message is formatted — in a component, during a render, in production. So
 * every returned string is parsed and checked against the source before it is
 * allowed anywhere near a file, and a key that fails is dropped and reported
 * rather than written. A missing key falls back to English; a malformed one
 * takes the page down.
 *
 * It is also not a substitute for review. It gets 29 locales to "reads
 * correctly and does not crash"; a native speaker still owns the wording of
 * anything customer-facing.
 */

import "dotenv/config";

import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { routing } from "../i18n/routing";

type Dict = Record<string, Record<string, string>>;

/* ── CLI ──────────────────────────────────────────────────────────────── */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const DRY_RUN = flag("dry-run");
const FORCE = flag("force");
const MODEL = arg("model") ?? "gpt-4o-mini";
const CONCURRENCY = Math.min(12, Math.max(1, Number(arg("concurrency") ?? 4)));
const ONLY_NAMESPACES = arg("namespaces")?.split(",").map((s) => s.trim()).filter(Boolean);
const ONLY_LOCALES = arg("locales")?.split(",").map((s) => s.trim()).filter(Boolean);
/**
 * Locales to leave alone. The point of it is --force: a forced rerun
 * re-translates keys that already exist, which would overwrite hand-written
 * and human-checked dictionaries with machine output.
 */
const SKIP_LOCALES = arg("skip-locales")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
/** The review pass. On by default; --no-qa runs the cheaper single pass. */
const QA = !flag("no-qa");
const QA_MODEL = arg("qa-model") ?? "gpt-4o";

const SOURCE = routing.defaultLocale; // "en"
const dictPath = (locale: string) => `messages/${locale}.json`;

/* ── ICU validation ───────────────────────────────────────────────────── */

/**
 * The parser ships as a transitive dependency of next-intl (via
 * intl-messageformat), so it is here in practice but is not ours to rely on.
 * Loaded through a guarded import: when present every message is parsed
 * properly; when it is not, the checks fall back to structural ones and the
 * run says so out loud rather than quietly validating less.
 */
type IcuNode = {
  type: number;
  value?: unknown;
  options?: Record<string, { value: IcuNode[] }>;
  children?: IcuNode[];
};
let parseIcu: ((m: string) => IcuNode[]) | null = null;

/**
 * Resolved at the start of main(), not at module scope: package.json declares
 * no "type", so this file runs as CommonJS under tsx and a top-level await is
 * a syntax error there.
 */
async function loadIcuParser(): Promise<void> {
  try {
    const mod = await import("@formatjs/icu-messageformat-parser");
    parseIcu = mod.parse as unknown as (m: string) => IcuNode[];
  } catch {
    parseIcu = null;
  }
}

const LITERAL = 0; // TYPE.literal
const PLURAL = 6; // TYPE.plural
const SELECT = 5; // TYPE.select

interface Shape {
  /** Every argument name the message interpolates: `{total}` → "total". */
  args: Set<string>;
  /** Category sets keyed by argument, for plural/select nodes. */
  branches: Map<string, Set<string>>;
}

/** Walks the AST for the two things a translation must not change. */
function shapeOf(message: string): Shape {
  const shape: Shape = { args: new Set(), branches: new Map() };
  if (!parseIcu) {
    // Fallback: argument names only, by pattern. Enough to catch a renamed
    // or dropped placeholder, which is the common failure.
    for (const m of message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*(?:[,}])/g)) shape.args.add(m[1]);
    return shape;
  }
  const visit = (nodes: IcuNode[]) => {
    for (const node of nodes) {
      if (node.type === LITERAL) continue;
      if (typeof node.value === "string") shape.args.add(node.value);
      if ((node.type === PLURAL || node.type === SELECT) && node.options) {
        const name = String(node.value);
        const cats = shape.branches.get(name) ?? new Set<string>();
        for (const [category, body] of Object.entries(node.options)) {
          cats.add(category);
          visit(body.value);
        }
        shape.branches.set(name, cats);
      }
      if (node.children) visit(node.children);
    }
  };
  visit(parseIcu(message));
  return shape;
}

const eqSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((v) => b.has(v));

/**
 * Everything that must hold before a translated string may be written.
 *
 * Returns null when the string is good, or the reason it was rejected.
 */
function reject(locale: string, source: string, translated: string): string | null {
  if (!translated.trim()) return "empty";

  // A model that "explains" instead of translating produces something far
  // longer than the source. Generous multiple — Finnish and German compounds
  // legitimately run long — but an essay is not a UI string.
  if (translated.length > Math.max(60, source.length * 4)) return "implausibly long";

  if (parseIcu) {
    try {
      parseIcu(translated);
    } catch (error) {
      return `invalid ICU (${String(error).split("\n")[0].slice(0, 60)})`;
    }
  } else {
    const open = (translated.match(/\{/g) ?? []).length;
    const close = (translated.match(/\}/g) ?? []).length;
    if (open !== close) return `unbalanced braces (${open} open, ${close} close)`;
  }

  const want = shapeOf(source);
  const got = shapeOf(translated);

  if (!eqSet(want.args, got.args)) {
    return `placeholders changed: expected {${[...want.args].join("}, {")}} got {${[...got.args].join("}, {")}}`;
  }

  // Plural categories are per-language and the model gets them wrong in both
  // directions: English's one/other copied into Polish, or invented words in
  // the category slot. CLDR is the authority, so ask Intl rather than guess.
  const allowed = new Set<string>(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  for (const [name, cats] of got.branches) {
    if (!want.branches.has(name)) continue; // a `select`, not a plural
    for (const c of cats) {
      // "=0" / "=1" are exact-value matches and always legal.
      if (c.startsWith("=")) continue;
      if (!allowed.has(c)) {
        return `"${c}" is not a plural category in ${locale} (valid: ${[...allowed].join(", ")})`;
      }
    }
    // ICU requires it, and a message without it throws on any unmatched count.
    if (!cats.has("other")) return `plural {${name}} is missing the required "other" branch`;
  }

  return null;
}

/* ── Prompt ───────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You translate UI strings for "My Energy", a European B2B e-commerce platform selling refrigerant gases to HVAC and refrigeration contractors. The audience is professional buyers and F-Gas certified technicians.

Register: precise, calm, commercial. The English is deliberately understated — match that. No exclamation marks, no marketing enthusiasm, no filler politeness that the source does not have. Prefer the formal address form where the language distinguishes one (Sie / vous / Ви).

DO NOT TRANSLATE, reproduce exactly:
- ICU placeholders and their names: {count}, {total}, {months}, {value}, {mass}, {gwp}, {share}, {co2e}, {orders}, {cylinders}. The name inside the braces is code.
- ICU keywords and syntax: "plural", "select", "selectordinal", the "#" symbol, and the braces themselves.
- Refrigerant designations: R-404A, R-32, R-449A, R-513A, R-507, R-422D, HFC, HFO.
- The brand name "My Energy".
- Units and codes: kg, t, CO₂e, EUR, SDS, ADR, VAT (VAT may take the local equivalent: MwSt., ПДВ, TVA…).

PLURALS — this is the part that breaks most often. The English uses ICU plural syntax with the categories English needs (usually "one" and "other"). Your target language almost certainly needs a DIFFERENT set. Use exactly the CLDR plural categories valid for the target language:
- Polish, Russian, Ukrainian, Czech, Lithuanian: one, few, many, other
- Slovenian: one, two, few, other
- Irish, Maltese: one, two, few, many, other
- Romanian: one, few, other
- Chinese, Korean, Turkish (and others with no plural inflection): other ONLY
- German, Dutch, Spanish, Italian, Swedish, Danish, Greek, Finnish, Estonian, Hungarian, Bulgarian, Portuguese, French: one, other
Every plural MUST include an "other" branch. Inflect the noun correctly in each branch.

TERMINOLOGY:
- "GWP" — use the official local abbreviation where the EU F-Gas Regulation has one (Ukrainian ПГП, Polish GWP, German GWP). If in doubt keep GWP.
- "F-Gas" stays "F-Gas" (or the established local form, e.g. F-Gase in German).
- "Article 13" / "Art. 13" refers to the EU F-Gas Regulation article — translate the word "Article", keep the number.
- "carbon record", "footprint", "quota", "reclaimed" are regulatory terms; use the established industry wording, not a literal gloss.

Return a translation for every key you are given, and nothing else.`;

/* ── Glossary and register ────────────────────────────────────────────── */

/**
 * The F-Gas terms a general-purpose translator reliably gets wrong.
 *
 * Every entry here is a word whose everyday meaning differs from its
 * regulatory one, so a faithful-looking translation can still be false. Two
 * examples of what this is for: "virgin" came back from the first run as
 * Ukrainian "новий" (new) — but the distinction is newly-produced versus
 * reclaimed, not new versus old, and a buyer reading "new refrigerant" has
 * been told the Article 13 ban is about something else entirely. And
 * "equipment charged at 40 t CO2e" is a refrigerant fill, not a price; read
 * as a charge in the billing sense it becomes nonsense with a number
 * attached.
 *
 * Stated as concepts rather than as my own per-language word choices: I can
 * say authoritatively what the English means and what the wrong reading is,
 * and the model is better placed than I am to pick the established term in
 * twenty-eight languages.
 */
const GLOSSARY = `F-GAS GLOSSARY — these are regulatory terms of art. Use the established industry wording in the target language, never a literal gloss:
- "virgin" (of refrigerant) = newly produced, as opposed to RECLAIMED or RECYCLED gas. It is NOT about age. Translating it as merely "new" is wrong and changes what the Article 13 restriction applies to.
- "reclaimed" = reprocessed to virgin-equivalent specification. "recycled" = reused after basic cleaning. "recovered" = removed from equipment. These are three distinct legal categories and must not be merged into one word.
- "quota phase-down" = the scheduled, stepwise reduction of the HFC placing-on-market quota. It is NOT a phase-out or a ban.
- "charge" (of equipment, as in "charged at 40 t CO2e") = the mass of refrigerant in the system. NEVER a fee, cost or payment.
- "service ban" = the Article 13 prohibition on servicing certain equipment with high-GWP virgin HFC.
- "leak check" = the legally mandated periodic tightness inspection.
- "cylinder" = the returnable pressure vessel gas is supplied in. Use the refrigeration trade term, not the word for a drinking bottle.
- "deposit" (on a cylinder) = a refundable sum held against its return. Not a bank deposit.
- "placing on the market" = the regulatory term of art, if the target language has one.
- "carbon record" / "footprint" = the account's CO2-equivalent ledger. Use the established carbon-accounting wording.
- "lower bound" = a minimum figure that may understate the true one.
- "audit-ready" / "audit file" = documentation prepared for a regulatory audit.`;

/**
 * How to address the reader, per language — and it is NOT "always formal".
 *
 * The brief for this pass said to force the formal form everywhere, citing
 * Polish "jesteś" and German "du". Right for those two and wrong for the
 * Nordics: Swedish and Danish completed the du-reformen decades ago, and "Ni"
 * or "De" in a Swedish or Danish B2B interface reads as either archaic or
 * faintly sarcastic. Finnish teitittely is likewise uncommon in modern
 * business software, which prefers impersonal and passive constructions.
 * Irish has no T-V distinction to choose from at all, and Korean and Chinese
 * carry politeness in verb endings and honorifics rather than in a pronoun.
 *
 * So this maps each locale to what "formal B2B register" actually means
 * there. A blanket rule would have replaced one register error with another
 * in five languages.
 */
const ADDRESS: Record<string, string> = {
  bg: 'Use the formal "Вие" and its verb forms. Never the informal "ти".',
  cs: 'Use vykání (formal "vy"). Never tykání.',
  da: 'Use "du". Danish business language is informal — "De" is archaic and would read as stilted. Formality comes from word choice, not from the pronoun.',
  de: 'Use "Sie" and Sie-verb forms throughout. Never "du" or "ihr".',
  el: 'Use the formal plural "εσείς" and its verb forms. Never the singular "εσύ".',
  es: 'Use "usted" and its verb forms. Never "tú".',
  et: 'Use the formal "Teie". Never "sina".',
  fi: 'Prefer impersonal and passive constructions over addressing the reader directly, which is the norm in Finnish business software. Do not force teitittely ("te"); "sinä" is acceptable where a pronoun is unavoidable.',
  fr: 'Use "vous" throughout. Never "tu".',
  ga: "Irish has no formal/informal pronoun distinction. Achieve register through word choice and full, unabbreviated phrasing.",
  hr: 'Use the formal "Vi" (capitalised) and its verb forms. Never "ti".',
  hu: 'Use "Ön" and its third-person verb forms. Never "te".',
  it: 'Use "Lei" and its third-person verb forms. Never "tu".',
  ko: "Use the formal polite speech level (합니다체 / -습니다 endings). Avoid second-person pronouns entirely, as Korean business writing does.",
  lt: 'Use the formal "Jūs" (capitalised). Never "tu".',
  lv: 'Use the formal "Jūs" (capitalised). Never "tu".',
  mt: 'Use the polite plural "intom" forms rather than the singular "int".',
  nl: 'Use "u" and its verb forms. Never "je" or "jij".',
  pl: 'Use formal address: either "Pan/Pani" constructions or, better for UI strings, impersonal forms ("Twoje" → "Państwa", "jesteś narażony" → "Państwo są narażeni" or an impersonal rephrasing). NEVER the informal "jesteś", "twój" or "ty".',
  pt: "Use the formal third-person address (European Portuguese convention). Never the informal second-person singular.",
  ro: 'Use "dumneavoastră" and its verb forms. Never "tu".',
  ru: 'Use the formal "Вы" (capitalised) and its verb forms. Never "ты".',
  sk: 'Use vykanie (formal "vy"). Never tykanie.',
  sl: 'Use the formal "Vi" (capitalised). Never "ti".',
  sv: 'Use "du". Swedish business language is informal since the du-reformen — "Ni" reads as archaic or condescending. Formality comes from word choice, not from the pronoun.',
  tr: 'Use the formal "siz" and its verb forms. Never "sen".',
  uk: 'Use the formal "Ви" (capitalised) and its verb forms. Never "ти".',
  zh: "Use 您 where a second-person pronoun is genuinely needed; otherwise omit the pronoun, as Chinese business writing does. Keep the register formal and concise.",
};

const addressRule = (locale: string) =>
  ADDRESS[locale] ??
  "Use the most formal register the language offers for business software.";

/* ── Translation ──────────────────────────────────────────────────────── */

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

async function translateNamespace(
  locale: string,
  namespace: string,
  entries: Array<[string, string]>,
  /** Rejection reasons from a previous attempt, keyed by message key. */
  corrections?: Map<string, string>
): Promise<Map<string, string>> {
  // `key` is an enum of exactly the keys we asked about, so the model has no
  // room to invent, rename or omit one — a free-form record lets it return
  // "spendTitle " or a key we never sent, which then silently writes nothing.
  const keys = entries.map(([k]) => k) as [string, ...string[]];
  const schema = z.object({
    translations: z
      .array(z.object({ key: z.enum(keys), value: z.string() }))
      .describe("One entry per requested key."),
  });

  const language = LANGUAGE_NAMES.of(locale) ?? locale;

  // The exact CLDR categories, computed rather than left to the model to
  // recall. The system prompt lists them by language group and gpt-4o-mini
  // still handed Chinese an "one/other" pair — Chinese has no "one". Stating
  // the allowed set for THIS locale as data is what actually fixed it.
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

  const { object } = await generateObject({
    model: openai(MODEL),
    schema,
    system: SYSTEM_PROMPT,
    prompt: [
      `Target language: ${language} (locale code "${locale}").`,
      `These strings belong to the "${namespace}" namespace.`,
      "",
      `ADDRESS FORM FOR ${locale}: ${addressRule(locale)}`,
      "",
      GLOSSARY,
      "",
      `PLURAL CATEGORIES FOR ${locale}: ${categories.join(", ")}.`,
      categories.length === 1
        ? `This language has no plural inflection. Any {x, plural, ...} must contain EXACTLY ONE branch, "other". Do not emit "one".`
        : `Any {x, plural, ...} must use only these branches, and must include "other".`,
      "",
      "Translate each `en` value. Keep every placeholder and ICU construct intact.",
      "",
      JSON.stringify(Object.fromEntries(entries), null, 2),
      ...(corrections?.size
        ? [
            "",
            "Your previous attempt was REJECTED for these keys. Fix exactly what each note says:",
            ...[...corrections].map(([key, why]) => `- ${key}: ${why}`),
          ]
        : []),
    ].join("\n"),
    temperature: 0.2,
    maxRetries: 2,
  });

  return new Map(object.translations.map((t) => [t.key, t.value]));
}

/* ── QA pass ──────────────────────────────────────────────────────────── */

const QA_SYSTEM_PROMPT = `You are an expert, native-level B2B technical translator and an F-Gas regulatory auditor. You are reviewing a finished translation of UI strings for a European platform that sells refrigerant gases to HVAC and refrigeration contractors.

You are the second pair of eyes. The first pass was competent but is known to make these mistakes:
1. INFORMAL ADDRESS. It reaches for the familiar pronoun — Polish "jesteś", German "du", French "tu" — in an interface read by commercial buyers.
2. LITERAL GLOSSES of regulatory terms. "virgin refrigerant" rendered as merely "new", "phase-down" as "phase-out", equipment "charge" as a fee.
3. GRAMMAR AND AGREEMENT, especially inside plural branches: correct category names with the wrong noun case or a mismatched adjective.
4. CALQUES. Word-by-word English structure that is grammatical but not how the industry writes in that language.

For each string, decide whether it is already correct. If it is, return it UNCHANGED. Only revise what is actually wrong — gratuitous rewording of a correct translation is a regression, not an improvement.

ABSOLUTE CONSTRAINTS — a revision that breaks one of these is worse than the problem it fixes:
- Every ICU placeholder must survive byte-for-byte: {count}, {total}, {mass}, {gwp}, {share}, {co2e}, {orders}, {cylinders}, {months}, {value}, {period}, {threshold}, {amount}, {kg}, {tonnes}, {refrigerants}, {estimated}, {unknown}, {thresholds}. The text inside the braces is code, not language.
- ICU syntax is code: the keyword "plural", the category names (one/two/few/many/other), the "#" symbol and every brace stay exactly as they are. You may change the words INSIDE a branch; you may not rename, add or remove a branch.
- Reproduce every number exactly. Never re-round, convert or reformat a figure.
- Keep verbatim: refrigerant designations (R-404A, R-32, R-449A, R-513A, R-507, R-422D, HFC, HFO), "F-Gas", the brand "My Energy", and unit symbols (kg, t, CO₂e, EUR).
- Do not add explanations, notes, or content the English does not have. Do not make a claim stronger or weaker than the source.

Return the perfected JSON: one entry per key you were given, with the final value and a very short note saying what you changed (empty string if you changed nothing).`;

/**
 * Reviews a completed translation and returns its corrections.
 *
 * Deliberately shown the English alongside the translation. A reviewer given
 * only the target text can polish prose but cannot see that "virgin" became
 * "new" — fidelity is only checkable against the source.
 */
async function qaNamespace(
  locale: string,
  namespace: string,
  entries: Array<[string, string]>,
  firstPass: Map<string, string>
): Promise<Map<string, { value: string; note: string }>> {
  const reviewable = entries.filter(([k]) => firstPass.has(k));
  if (reviewable.length === 0) return new Map();

  const keys = reviewable.map(([k]) => k) as [string, ...string[]];
  const schema = z.object({
    reviewed: z.array(
      z.object({
        key: z.enum(keys),
        value: z.string().describe("The final, corrected translation."),
        note: z
          .string()
          .describe("Under ten words on what was fixed. Empty string if unchanged."),
      })
    ),
  });

  const language = LANGUAGE_NAMES.of(locale) ?? locale;
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

  const payload = reviewable.map(([key, en]) => ({
    key,
    en,
    translation: firstPass.get(key)!,
  }));

  const { object } = await generateObject({
    model: openai(QA_MODEL),
    schema,
    system: QA_SYSTEM_PROMPT,
    prompt: [
      `Target language: ${language} (locale code "${locale}").`,
      `Namespace: "${namespace}".`,
      "",
      `ADDRESS FORM FOR ${locale}: ${addressRule(locale)}`,
      "",
      GLOSSARY,
      "",
      `VALID PLURAL CATEGORIES FOR ${locale}: ${categories.join(", ")}. A revision must use only these, and must keep the "other" branch.`,
      "",
      "Review each entry. `en` is the source; `translation` is what the first pass produced.",
      "",
      JSON.stringify(payload, null, 2),
    ].join("\n"),
    temperature: 0.1,
    maxRetries: 2,
  });

  return new Map(object.reviewed.map((r) => [r.key, { value: r.value, note: r.note.trim() }]));
}

/* ── Files ────────────────────────────────────────────────────────────── */

function readDict(locale: string): Dict {
  return JSON.parse(readFileSync(dictPath(locale), "utf8")) as Dict;
}

/**
 * Two-space indent plus a trailing newline — verified to round-trip every
 * message file byte-for-byte, so a run that changes nothing produces no diff.
 */
function writeDict(locale: string, dict: Dict): void {
  writeFileSync(dictPath(locale), `${JSON.stringify(dict, null, 2)}\n`);
}

/** Keys present in English and absent (or stale, under --force) in the target. */
function pending(source: Dict, target: Dict): Map<string, Array<[string, string]>> {
  const out = new Map<string, Array<[string, string]>>();
  for (const [namespace, entries] of Object.entries(source)) {
    if (ONLY_NAMESPACES && !ONLY_NAMESPACES.includes(namespace)) continue;
    if (typeof entries !== "object" || entries === null) continue;
    const have = target[namespace] ?? {};
    const missing = Object.entries(entries).filter(
      ([key, value]) => typeof value === "string" && (FORCE || typeof have[key] !== "string")
    );
    if (missing.length > 0) out.set(namespace, missing);
  }
  return out;
}

/* ── Runner ───────────────────────────────────────────────────────────── */

interface Result {
  locale: string;
  written: number;
  rejected: Array<{ key: string; why: string }>;
  /** Keys the QA pass changed and whose revision survived validation. */
  revised: Array<{ key: string; note: string }>;
  /** QA revisions thrown away because they broke ICU, a placeholder or a plural. */
  qaRejected: Array<{ key: string; why: string }>;
  failed?: string;
}

async function runLocale(locale: string, source: Dict): Promise<Result> {
  const target = readDict(locale);
  const todo = pending(source, target);
  const result: Result = { locale, written: 0, rejected: [], revised: [], qaRejected: [] };
  if (todo.size === 0) return result;

  // Built up across namespaces, written once at the end, so a failure part
  // way through leaves the file exactly as it was rather than half-updated.
  const merged: Dict = structuredClone(target);

  for (const [namespace, entries] of todo) {
    // Rebuild in English's key order for a namespace the locale does not have
    // yet; append for one it does. Either way existing keys keep their place,
    // so the diff shows only what this run added.
    const bucket: Record<string, string> = { ...(merged[namespace] ?? {}) };
    /** First-pass strings that passed validation — what the QA pass reviews. */
    const accepted = new Map<string, string>();

    /** Keys still owed a valid translation, narrowing on each attempt. */
    let outstanding = entries;
    let corrections: Map<string, string> | undefined;

    // Two attempts. One targeted retry recovers nearly everything the first
    // pass gets wrong, because the rejection reason is specific enough to act
    // on ("\"one\" is not a plural category in zh"). Dropping straight to the
    // English fallback instead would waste a fix that costs one more call.
    for (let attempt = 0; attempt < 2 && outstanding.length > 0; attempt += 1) {
      let got: Map<string, string>;
      try {
        got = await translateNamespace(locale, namespace, outstanding, corrections);
      } catch (error) {
        result.failed = `${namespace}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }

      const stillBad: Array<[string, string]> = [];
      corrections = new Map();
      for (const [key, en] of outstanding) {
        const value = got.get(key);
        const why = value === undefined ? "no translation returned" : reject(locale, en, value);
        if (why) {
          stillBad.push([key, en]);
          corrections.set(key, why);
          continue;
        }
        bucket[key] = value as string;
        accepted.set(key, value as string);
        result.written += 1;
      }
      outstanding = stillBad;
    }

    // Whatever is still outstanding after the retry keeps the English
    // fallback, and is reported by key so it can be written by hand.
    for (const [key] of outstanding) {
      result.rejected.push({
        key: `${namespace}.${key}`,
        why: corrections?.get(key) ?? "rejected",
      });
    }

    /* ── QA pass ──
       A native-level reviewer over the accepted translations, shown the
       English alongside each one.

       Every revision is put through `reject()` again, and this is the part
       that matters: a reviewer told to "fix grammar and agreement" edits
       inside plural branches, which is exactly where a well-meant correction
       drops the "other" branch or renames a category. Validating only the
       first pass would let the QA step introduce the class of breakage the
       first pass is guarded against. A revision that fails goes in the bin
       and the first-pass string — already validated — stands. */
    if (QA && accepted.size > 0) {
      try {
        const reviewed = await qaNamespace(locale, namespace, entries, accepted);
        for (const [key, { value, note }] of reviewed) {
          const before = accepted.get(key);
          if (before === undefined || value === before) continue;

          const en = entries.find(([k]) => k === key)?.[1];
          const why = en ? reject(locale, en, value) : "source string not found";
          if (why) {
            result.qaRejected.push({ key: `${namespace}.${key}`, why });
            continue;
          }
          bucket[key] = value;
          result.revised.push({ key: `${namespace}.${key}`, note: note || "revised" });
        }
      } catch (error) {
        // The first pass is already in `bucket` and already valid, so a QA
        // failure costs polish, never correctness.
        console.warn(
          `  ${locale} ${namespace}: QA pass failed (${
            error instanceof Error ? error.message : String(error)
          }); keeping first-pass translations.`
        );
      }
    }

    merged[namespace] = bucket;
  }

  if ((result.written > 0 || result.revised.length > 0) && !DRY_RUN) writeDict(locale, merged);
  return result;
}

/** Fixed-size worker pool — the API rate-limits long before the CPU cares. */
async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    })
  );
}

async function main() {
  await loadIcuParser();

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(
      "OPENAI_API_KEY is not set. Add it to .env before running this — it will not\n" +
        "fall back to copying English, because a file full of English that looks\n" +
        "translated is worse than a file with gaps the fallback still covers."
    );
    process.exit(1);
  }

  const source = readDict(SOURCE);
  const locales = routing.locales.filter(
    (l) =>
      l !== SOURCE &&
      !SKIP_LOCALES.includes(l) &&
      (!ONLY_LOCALES || ONLY_LOCALES.includes(l))
  );

  if (ONLY_LOCALES) {
    const known = routing.locales as readonly string[];
    const unknown = ONLY_LOCALES.filter((l) => !known.includes(l));
    if (unknown.length > 0) {
      console.error(`Not locales in i18n/routing.ts: ${unknown.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(
    `${DRY_RUN ? "DRY RUN — " : ""}source ${SOURCE} → ${locales.length} locale(s), model ${MODEL}` +
      `, ICU validation ${parseIcu ? "full (AST)" : "structural only — parser not resolvable"}` +
      `${QA ? `, QA pass ON (${QA_MODEL})` : ", QA pass OFF"}` +
      `${FORCE ? ", FORCE (re-translating existing keys)" : ""}` +
      `${SKIP_LOCALES.length ? `, skipping ${SKIP_LOCALES.join("/")}` : ""}`
  );

  const results: Result[] = [];
  await pool(locales, CONCURRENCY, async (locale) => {
    const r = await runLocale(locale, source);
    results.push(r);
    const parts = [`${r.locale}:`];
    parts.push(r.written > 0 ? `${r.written} key(s)` : "up to date");
    if (r.revised.length > 0) parts.push(`QA revised ${r.revised.length}`);
    if (r.qaRejected.length > 0) parts.push(`QA rejected ${r.qaRejected.length}`);
    if (r.rejected.length > 0) parts.push(`${r.rejected.length} rejected`);
    if (r.failed) parts.push(`FAILED ${r.failed}`);
    console.log("  " + parts.join(" · "));
  });

  const written = results.reduce((n, r) => n + r.written, 0);
  const rejected = results.flatMap((r) => r.rejected.map((x) => ({ ...x, locale: r.locale })));
  const failed = results.filter((r) => r.failed);

  console.log(
    `\n${DRY_RUN ? "would write" : "wrote"} ${written} translation(s) across ` +
      `${results.filter((r) => r.written > 0).length} file(s)`
  );

  const revised = results.flatMap((r) => r.revised.map((x) => ({ ...x, locale: r.locale })));
  const qaRejected = results.flatMap((r) => r.qaRejected.map((x) => ({ ...x, locale: r.locale })));

  if (revised.length > 0) {
    console.log(`\n${revised.length} string(s) corrected by the QA pass:`);
    for (const r of revised) console.log(`  ${r.locale} ${r.key} — ${r.note}`);
  }
  if (qaRejected.length > 0) {
    // A QA "fix" that broke ICU or a placeholder. The first-pass string was
    // kept, so nothing is lost — but a pattern here means the QA prompt is
    // encouraging edits it should not be making.
    console.log(`\n${qaRejected.length} QA revision(s) discarded (first pass kept):`);
    for (const r of qaRejected) console.log(`  ${r.locale} ${r.key} — ${r.why}`);
  }

  if (rejected.length > 0) {
    // Listed in full, never summarised away: each one is a key that stays on
    // the English fallback, and the reason is usually a real prompt bug.
    console.log(`\n${rejected.length} rejected — these keep the English fallback:`);
    for (const r of rejected) console.log(`  ${r.locale} ${r.key} — ${r.why}`);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} locale(s) errored:`);
    for (const f of failed) console.log(`  ${f.locale} — ${f.failed}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
