/**
 * Fills in UI strings that exist in messages/en.json but not yet in the other
 * locale files, using an LLM translator briefed for the European refrigerant
 * trade.
 *
 *   npx tsx --env-file=.env scripts/translate-missing-keys.ts --dry-run
 *   npx tsx --env-file=.env scripts/translate-missing-keys.ts
 *
 * Options
 *   --dry-run          Show what would be sent (counts, token estimate, the
 *                      first prompt in full). No API calls, no file writes.
 *   --lang=de,fr       Only these locales (default: every file but en.json).
 *   --model=gpt-4o     Model id (default gpt-4o).
 *   --batch=80         Strings per request (default 80).
 *   --concurrency=4    Locales translated in parallel (default 4).
 *
 * What it guarantees
 * - Only keys MISSING from a locale are sent, and only they are written.
 *   Existing translations are never touched, even if they look wrong.
 * - Every returned string is checked against its English source with the
 *   ICU parser next-intl uses: the same {placeholders} and <tags>, a valid
 *   plural/select, and the plural categories the target language actually
 *   has (Polish needs one/few/many/other; Chinese only other). A string that
 *   fails is retried once with the reason; if it fails again it is left out,
 *   so the app keeps showing English for it (i18n/request.ts merges en.json
 *   under every locale) rather than a broken message.
 * - New keys are inserted next to their English neighbours and existing key
 *   order is kept, so the git diff is only the added lines.
 * - Files are written atomically (temp file + rename), 2-space JSON.
 */

import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

// ───────────────────────────── options ─────────────────────────────

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : "true"] as const;
  })
);
const DRY_RUN = args.get("dry-run") === "true";
const MODEL = args.get("model") ?? "gpt-4o";
const BATCH = Math.max(1, Number(args.get("batch") ?? 80));
const CONCURRENCY = Math.max(1, Number(args.get("concurrency") ?? 4));
const ONLY = args.get("lang")?.split(",").map((s) => s.trim()).filter(Boolean);

const DIR = path.resolve(import.meta.dirname, "../messages");
const SOURCE = "en";

// ───────────────────────────── JSON helpers ─────────────────────────────

type Tree = { [key: string]: string | Tree };

const readTree = (locale: string): Tree => JSON.parse(readFileSync(path.join(DIR, `${locale}.json`), "utf8"));

function flatten(tree: Tree, prefix: string[] = [], out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") out.set(JSON.stringify([...prefix, k]), v);
    else flatten(v, [...prefix, k], out);
  }
  return out;
}
// Paths are JSON arrays so a key containing "." can never be split wrongly.
const keyPath = (flat: string): string[] => JSON.parse(flat);
const dotted = (flat: string) => keyPath(flat).join(".");

/** Builds the nested object for a set of flat paths (the payload / the expected shape). */
function nest(entries: Iterable<[string, string]>): Tree {
  const root: Tree = {};
  for (const [flat, value] of entries) {
    const parts = keyPath(flat);
    let node = root;
    for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Tree;
    node[parts.at(-1)!] = value;
  }
  return root;
}

/** A zod schema that only accepts exactly this shape — passed to structured output. */
function schemaFor(tree: Tree): z.ZodType<Tree> {
  const shape: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(tree)) shape[k] = typeof v === "string" ? z.string() : schemaFor(v);
  return z.object(shape).strict() as unknown as z.ZodType<Tree>;
}

/**
 * Inserts `additions` into `target` without reordering what is there: each
 * new key goes right after the nearest preceding key it shares with the
 * English file (or first, if it has none), at every nesting level.
 */
export function insertInOrder(target: Tree, additions: Tree, source: Tree): Tree {
  const entries: Array<[string, string | Tree]> = Object.entries(target);
  for (const [key, value] of Object.entries(additions)) {
    const existing = entries.findIndex(([k]) => k === key);
    if (existing >= 0) {
      const current = entries[existing][1];
      if (typeof current === "object" && typeof value === "object") {
        entries[existing] = [key, insertInOrder(current, value, (source[key] ?? {}) as Tree)];
      }
      continue; // never overwrite an existing string
    }
    const sourceKeys = Object.keys(source);
    let at = 0;
    for (let i = sourceKeys.indexOf(key) - 1; i >= 0; i--) {
      const idx = entries.findIndex(([k]) => k === sourceKeys[i]);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    entries.splice(at, 0, [key, value]);
  }
  return Object.fromEntries(entries);
}

function writeTreeAtomic(locale: string, tree: Tree) {
  const file = path.join(DIR, `${locale}.json`);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(tree, null, 2) + "\n");
  renameSync(tmp, file);
}

// ───────────────────────────── ICU validation ─────────────────────────────

interface Shape {
  args: Set<string>; // "name:type"
  tags: Set<string>;
  plurals: Array<{ name: string; ordinal: boolean; options: string[] }>;
}

function shapeOf(message: string): Shape {
  const shape: Shape = { args: new Set(), tags: new Set(), plurals: [] };
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      switch (el.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          shape.args.add(`${el.value}:${el.type}`);
          break;
        case TYPE.select:
          shape.args.add(`${el.value}:${el.type}`);
          for (const o of Object.values(el.options)) walk(o.value);
          break;
        case TYPE.plural:
          shape.args.add(`${el.value}:${el.type}`);
          shape.plurals.push({ name: el.value, ordinal: el.pluralType === "ordinal", options: Object.keys(el.options) });
          for (const o of Object.values(el.options)) walk(o.value);
          break;
        case TYPE.tag:
          shape.tags.add(el.value);
          walk(el.children);
          break;
      }
    }
  };
  walk(parse(message));
  return shape;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Null when `translated` is a faithful ICU counterpart of `source` in `locale`; otherwise why not. */
export function validate(source: string, translated: unknown, locale: string): string | null {
  if (typeof translated !== "string" || !translated.trim()) return "empty or not a string";
  let s: Shape, t: Shape;
  try {
    s = shapeOf(source);
  } catch {
    return null; // source isn't ICU-parseable either; nothing to compare
  }
  try {
    t = shapeOf(translated);
  } catch (e) {
    return `not valid ICU MessageFormat (${(e as Error).message})`;
  }
  if (!sameSet(s.args, t.args)) return `placeholders must be exactly ${[...s.args].map((a) => `{${a.split(":")[0]}}`).join(", ") || "none"}`;
  if (!sameSet(s.tags, t.tags)) return `rich-text tags must be exactly ${[...s.tags].map((x) => `<${x}>`).join(", ") || "none"}`;
  for (const p of t.plurals) {
    const needed = new Intl.PluralRules(locale, { type: p.ordinal ? "ordinal" : "cardinal" }).resolvedOptions().pluralCategories;
    const cats = p.options.filter((o) => !o.startsWith("="));
    const unknown = cats.filter((c) => !needed.includes(c as Intl.LDMLPluralRule));
    const missing = needed.filter((c) => !cats.includes(c));
    if (unknown.length || missing.length) {
      return `plural {${p.name}} for "${locale}" must use exactly the categories ${needed.join("/")} (got ${cats.join("/")})`;
    }
  }
  return null;
}

// ───────────────────────────── prompt ─────────────────────────────

const languageName = (locale: string) => new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;

// Terms whose established rendering we want the model to copy from the
// existing translation of the app, so new strings match the old ones.
const GLOSSARY_HINT =
  /F-?Gas|GWP|CO2e|CO₂e|SDS|safety data|cylinder|drum|isotank|deposit|refrigerant|certificate|quote|quotation|logbook|VAT|invoice|leak|reclaim|recovery cylinder|ADR|REACH/i;

function glossaryFor(source: Map<string, string>, target: Map<string, string>, max = 30): string {
  const pairs: string[] = [];
  for (const [k, en] of source) {
    const tr = target.get(k);
    if (!tr || tr === en || en.length > 90 || !GLOSSARY_HINT.test(en)) continue;
    pairs.push(`- "${en}" → "${tr}"`);
    if (pairs.length >= max) break;
  }
  return pairs.join("\n");
}

function systemPrompt(locale: string, glossary: string): string {
  const lang = languageName(locale);
  return `You are a professional B2B translator for the European refrigerant and HVAC-R industry. You translate the user interface of "My Energy", an online wholesaler of refrigerant gases (sold by weight in cylinders, drums and isotanks), refrigeration equipment and recovery cylinders to certified trade buyers.

Translate from English into ${lang} (${locale}).

Tone and register
- Professional, formal and concise, as in a well-localised business application. Use the formal form of address where ${lang} has one.
- Keep UI labels short: a button label stays a button label.

Terminology
- Use the terminology established in the ${lang} language version of EU law where it exists: Regulation (EU) 2024/573 on fluorinated greenhouse gases ("F-Gas") and REACH for safety data sheets ("SDS").
- Abbreviations (F-Gas, GWP, tCO2e / tCO₂e, SDS, ADR, VAT, CoA): use the abbreviation ${lang}-speaking industry professionals actually use. If the industry keeps the English abbreviation, keep it. Never invent a new abbreviation.
- "Isotank", product codes and SKUs (e.g. R-32, R-410A, HC-134A-50), units (kg, €, %) and the brand "My Energy" stay exactly as written.
${glossary ? `- Stay consistent with how this app is ALREADY translated into ${lang}:\n${glossary}` : ""}

Message format (ICU MessageFormat — this is critical, the app parses every string)
- Copy every {placeholder} exactly, e.g. {count}, {date}, {number}. Never translate or rename what is inside the braces.
- Copy every rich-text tag name exactly, e.g. <link>…</link>, <ref>…</ref>, <strong>…</strong>; translate only the text between the tags.
- Plurals: "{count, plural, one {# item} other {# items}}" — keep "{count, plural," and "#", translate the branch texts, and use exactly the CLDR plural categories of ${lang}: ${new Intl.PluralRules(locale).resolvedOptions().pluralCategories.join(", ")}. Keep any "=0"-style exact branches.
- Do not add or remove apostrophes next to { or } (an apostrophe there changes the meaning in ICU).

Output
- Return a JSON object with exactly the same keys and nesting as the input. Every value is the translated string. Do not add, drop or rename keys.`;
}

const userPrompt = (payload: Tree) => `Translate the values of this JSON object:\n\n${JSON.stringify(payload, null, 2)}`;

// ───────────────────────────── translation ─────────────────────────────

interface LocaleReport {
  locale: string;
  missing: number;
  written: number;
  failed: Array<{ key: string; reason: string }>;
  inputTokens: number;
  outputTokens: number;
}

async function translateBatch(locale: string, system: string, batch: Array<[string, string]>, report: LocaleReport) {
  const done = new Map<string, string>();
  let pending = batch;
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const payload = nest(pending);
    const retryNote =
      attempt === 0
        ? ""
        : `\n\nThese strings were rejected on a previous attempt; fix exactly these problems:\n${report.failed
            .filter((f) => pending.some(([k]) => dotted(k) === f.key))
            .map((f) => `- ${f.key}: ${f.reason}`)
            .join("\n")}`;
    const result = await generateText({
      model: openai(MODEL),
      system,
      prompt: userPrompt(payload) + retryNote,
      output: Output.object({ schema: schemaFor(payload) }),
      temperature: 0.2,
      maxRetries: 3,
    });
    report.inputTokens += result.usage.inputTokens ?? 0;
    report.outputTokens += result.usage.outputTokens ?? 0;

    const translated = flatten(result.output as Tree);
    const retry: Array<[string, string]> = [];
    for (const [k, en] of pending) {
      const reason = validate(en, translated.get(k), locale);
      report.failed = report.failed.filter((f) => f.key !== dotted(k));
      if (reason) {
        report.failed.push({ key: dotted(k), reason });
        retry.push([k, en]);
      } else done.set(k, translated.get(k)!);
    }
    pending = retry;
  }
  return done;
}

async function runLocale(locale: string, source: Tree, sourceFlat: Map<string, string>): Promise<LocaleReport> {
  const target = readTree(locale);
  const targetFlat = flatten(target);
  const missing = [...sourceFlat].filter(([k]) => !targetFlat.has(k));
  const report: LocaleReport = { locale, missing: missing.length, written: 0, failed: [], inputTokens: 0, outputTokens: 0 };
  if (!missing.length) return report;

  const system = systemPrompt(locale, glossaryFor(sourceFlat, targetFlat));
  const translated = new Map<string, string>();
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      for (const [k, v] of await translateBatch(locale, system, batch, report)) translated.set(k, v);
    } catch (error) {
      for (const [k] of batch) report.failed.push({ key: dotted(k), reason: `request failed: ${(error as Error).message}` });
    }
  }

  if (translated.size) {
    // Re-read right before writing: the file may have been edited meanwhile.
    const fresh = readTree(locale);
    const freshFlat = flatten(fresh);
    const additions = nest([...translated].filter(([k]) => !freshFlat.has(k)));
    writeTreeAtomic(locale, insertInOrder(fresh, additions, source));
    report.written = flatten(additions).size;
  }
  return report;
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const source = readTree(SOURCE);
  const sourceFlat = flatten(source);

  // The source itself must be valid ICU, or every comparison below is moot.
  const brokenSource = [...sourceFlat].filter(([, v]) => {
    try {
      parse(v);
      return false;
    } catch {
      return true;
    }
  });
  if (brokenSource.length) console.warn(`⚠ ${brokenSource.length} English strings aren't valid ICU: ${brokenSource.map(([k]) => dotted(k)).join(", ")}`);

  const locales = readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== `${SOURCE}.json`)
    .map((f) => f.replace(/\.json$/, ""))
    .filter((l) => !ONLY || ONLY.includes(l))
    .sort();
  if (ONLY) for (const l of ONLY) if (!locales.includes(l)) console.warn(`⚠ no messages/${l}.json — skipped`);

  if (DRY_RUN) {
    let totalChars = 0;
    let first: { locale: string; system: string; user: string } | null = null;
    console.log(`Dry run — model ${MODEL}, ${BATCH} strings per request. Nothing is sent or written.\n`);
    for (const locale of locales) {
      const targetFlat = flatten(readTree(locale));
      const missing = [...sourceFlat].filter(([k]) => !targetFlat.has(k));
      const stale = [...targetFlat.keys()].filter((k) => !sourceFlat.has(k)).length;
      const namespaces = [...new Set(missing.map(([k]) => keyPath(k)[0]))];
      const system = systemPrompt(locale, glossaryFor(sourceFlat, targetFlat));
      const requests = Math.ceil(missing.length / BATCH);
      const chars = missing.length ? system.length * requests + JSON.stringify(nest(missing)).length * 2 : 0;
      totalChars += chars;
      console.log(
        `${locale.padEnd(3)} ${languageName(locale).padEnd(12)} ${String(missing.length).padStart(4)} missing in ${namespaces.length} namespaces` +
          `  ${requests} request(s)  ~${Math.round(chars / 4).toLocaleString()} tokens` +
          (stale ? `  (${stale} keys no longer in en.json — left alone)` : "") +
          (missing.length ? `\n      ${namespaces.join(", ")}` : "")
      );
      if (!first && missing.length) first = { locale, system, user: userPrompt(nest(missing.slice(0, BATCH))) };
    }
    console.log(`\nTotal ≈ ${Math.round(totalChars / 4).toLocaleString()} tokens (input + output, rough: chars ÷ 4).`);
    if (first) {
      console.log(`\n──── First request, exactly as it would be sent (${first.locale}) ────\n[system]\n${first.system}\n\n[user]\n${first.user}`);
    }
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — run with --env-file=.env (or use --dry-run).");
    process.exit(1);
  }

  const reports: LocaleReport[] = [];
  const queue = [...locales];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let locale = queue.shift(); locale; locale = queue.shift()) {
        const r = await runLocale(locale, source, sourceFlat);
        reports.push(r);
        console.log(
          `${r.locale.padEnd(3)} ${r.missing ? `${r.written}/${r.missing} written` : "up to date"}` +
            (r.failed.length ? `, ${r.failed.length} kept in English` : "") +
            (r.inputTokens ? `  (${r.inputTokens} in / ${r.outputTokens} out tokens)` : "")
        );
      }
    })
  );

  const failed = reports.flatMap((r) => r.failed.map((f) => `  ${r.locale} ${f.key}: ${f.reason}`));
  const tokensIn = reports.reduce((n, r) => n + r.inputTokens, 0);
  const tokensOut = reports.reduce((n, r) => n + r.outputTokens, 0);
  console.log(`\nDone. ${reports.reduce((n, r) => n + r.written, 0)} strings written; ${tokensIn} input / ${tokensOut} output tokens.`);
  if (failed.length) {
    console.log(`\n${failed.length} strings failed validation twice and still show in English (rerun to retry them):\n${failed.join("\n")}`);
    process.exitCode = 2;
  }
}

// Runs when executed, not when imported (the helpers above are importable for tests).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
