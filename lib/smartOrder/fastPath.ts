import type { ExtractionRaw } from "@/lib/smartOrder/extract";

/**
 * Smart Bulk Order — the zero-token reader, run before the model.
 *
 * The text is split into item segments (lines, ";", ", ", and/und/і/и/i/та),
 * and each segment is read strictly: one refrigerant designation and one of
 *
 *   "35 kg R-32"                     → total weight
 *   "2 × 10 kg R-410A" / "2 x 10kg"  → 2 cylinders of 10 kg
 *   "2 балони 410-го по 10 кг"       → 2 cylinders of 10 kg
 *   "1 Flasche R-404A"               → 1 cylinder, size not stated
 *
 * A segment parses only if every digit in it was used and nothing in it is
 * ambiguous. Anything else — equipment, words for numbers, a second weight,
 * a refrigerant written in a way the table below doesn't know — is returned
 * in `unparsed`, and only those segments go to the model. Output has the
 * model's own shape (ExtractionRaw), so grounding and the solver are shared.
 */

type Line = ExtractionRaw["lines"][number];

export interface FastPathResult {
  /** Parsed lines, each tagged with the segment it came from (for ordering). */
  parsed: Array<{ segment: number; line: Line }>;
  /** Segments the model must read, in order. */
  unparsed: Array<{ segment: number; text: string }>;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const END = String.raw`(?![\p{L}\p{N}])`;
const START = String.raw`(?<![\p{L}\p{N}.,])`;
const UNIT = String.raw`(kg|кг|kgs|g|г|lbs?|t|т)`;

/** Cylinder words in the UI languages (stems). */
const CYL = String.raw`(?:cylind\p{L}*|cyl|bottles?|balloon\p{L}*|tanks?|балон\p{L}*|баллон\p{L}*|бутилк\p{L}*|flasche\p{L}*|flaš\p{L}*|fľaš\p{L}*|butl\p{L}*|butel\p{L}*|bombol\p{L}*|botell\p{L}*|bouteille\p{L}*|cilind\p{L}*|ċilindr\p{L}*|láhv\p{L}*|lahv\p{L}*|bidon\p{L}*|φιάλ\p{L}*|pullo\p{L}*|sorcóir\p{L}*|boc[ae]\p{L}*|palack\p{L}*|balion\p{L}*|balon\p{L}*|jeklenk\p{L}*|tüp\p{L}*|실린더|钢瓶|气瓶)`;
const CYL_RE = new RegExp(CYL, "iu");
/** Count words that are not cylinder words: Korean/Chinese classifiers, "pcs", "шт". */
const CLASSIFIER = String.raw`(?:个|개|tane|szt\.?|шт\.?|pcs|pieces?|stk\.?|stück)`;

/** A designation written with R: R-32, R32, R 410A, R-134a, R-1234yf. */
const R_CODE = new RegExp(String.raw`(?<![\p{L}\p{N}])R[ -]?(\d{2,4})(yf|ze|[a-c])?${END}`, "giu");
/** Spoken forms: "32-го", "410-й", "134-го фреону" — the number without R. */
const SPOKEN = new RegExp(String.raw`(?<![\p{L}\p{N}.,])(32|22|134|404|407|410|290|600|1234)-?(?:го|ий|ого|й|ой)${END}`, "giu");
const SPOKEN_MAP: Record<string, string> = { "32": "R-32", "22": "R-22", "134": "R-134a", "404": "R-404A", "407": "R-407C", "410": "R-410A", "290": "R-290", "600": "R-600a", "1234": "R-1234yf" };

/** "2 × 10 kg", "2x10kg" — count and size together. */
const RE_COUNT_X_SIZE = new RegExp(String.raw`${START}(\d{1,3})\s?[×xх*]\s?${NUM}\s?${UNIT}${END}`, "giu");
/** "2 cylinders", "2 балони", "2 개 …", "실린더 2개", "3x" — a count. */
const RE_COUNTS = [
  new RegExp(String.raw`${START}(\d{1,3})\s?${CLASSIFIER}?\s?${CYL}${END}`, "giu"),
  new RegExp(String.raw`${CYL}\s?(\d{1,3})\s?${CLASSIFIER}${END}`, "giu"),
  new RegExp(String.raw`${START}(\d{1,3})\s?[×xх*](?![\p{L}\p{N}])`, "giu"),
  new RegExp(String.raw`${START}(\d{1,3})\s?${CLASSIFIER}${END}`, "giu"),
];
const RE_MASS = new RegExp(String.raw`${START}${NUM}\s?${UNIT}${END}`, "giu");

/** "Total", "in all": a weight next to a count could then be the total, not the size — the model decides. */
const TOTAL = /total|insgesamt|gesamt|всього|усього|загалом|итого|всего|łącznie|razem|celkem|összesen|yhteensä|totalt|i alt|toplam|合计|총/iu;

const RECLAIMED = /reclaim|recycl|regenerat|відновлен|регенер|восстановлен|aufbereit|regeneriert|odzysk/iu;

const blank = (s: string, m: RegExpMatchArray) => s.slice(0, m.index!) + " ".repeat(m[0].length) + s.slice(m.index! + m[0].length);
const take = (w: { s: string }, re: RegExp) => {
  const found = [...w.s.matchAll(re)];
  for (const m of found) w.s = blank(w.s, m);
  return found;
};
const num = (s: string) => Number(s.replace(",", "."));
const unitOf = (u: string): "kg" | "g" | "lb" | "oz" | "t" =>
  /^(kg|кг|kgs)$/i.test(u) ? "kg" : /^(g|г)$/i.test(u) ? "g" : /^lbs?$/i.test(u) ? "lb" : /^(t|т)$/i.test(u) ? "t" : "oz";

function refrigerantOf(m: RegExpMatchArray, spoken: boolean): string {
  if (spoken) return SPOKEN_MAP[m[1]];
  const digits = m[1];
  const suffix = m[2] ?? "";
  if (/^(yf|ze)$/i.test(suffix)) return `R-${digits}${suffix.toLowerCase()}`;
  if (digits === "134" || digits === "600") return `R-${digits}${suffix.toLowerCase() || (digits === "134" ? "a" : "")}`;
  if (digits === "410" && !suffix) return "R-410A";
  if (digits === "404" && !suffix) return "R-404A";
  if (digits === "407" && !suffix) return "R-407C";
  return `R-${digits}${suffix.toUpperCase()}`;
}

const SEPARATOR = /(\n|;|[，、]|,(?=\s)|\s(?:and|und|і|и|i|та|plus|y|et|e|oraz|a|sowie|og|och|en|ja|és|ir|un|u|in|și|ve|agus|και|및|和)\s)/iu;

/** Split into item segments; commas only where they separate items ("1,5 kg" stays whole). */
export function segments(text: string): string[] {
  return text
    .split(SEPARATOR)
    .filter((_, i) => i % 2 === 0)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A piece that is only a weight ("10 kg", "a 10 kg") — the tail of the item before it, not an item. */
const ORPHAN_WEIGHT = new RegExp(String.raw`^(?:\p{L}{1,4}\s)?${NUM}\s?${UNIT}[\s\p{P}]*$`, "iu");

/** Text with no digits and no item words: greetings, sign-offs, "please". Dropped, like the model drops them. */
const FILLER = /^[\p{P}\s]*(?:hi|hello|dear|thanks?|thank you|regards|best|please|bitte|danke|hallo|привіт|вітаю|дякую|здравствуйте|спасибо|будь ласка|пожалуйста|dzień dobry|dziękuję|proszę|потрібно|нужно|wir brauchen|we need|need)?[\p{P}\s]*$/iu;

function parseSegment(seg: string): Line | null {
  if (TOTAL.test(seg)) return null;
  const w = { s: seg };
  const coded = take(w, R_CODE);
  const spoken = take(w, SPOKEN);
  const codes = [...new Set([...coded.map((m) => refrigerantOf(m, false)), ...spoken.map((m) => refrigerantOf(m, true))])];
  if (codes.length !== 1) return null;

  const base = { rawText: seg.slice(0, 140), kind: "REFRIGERANT" as const, refrigerantCode: codes[0], productQuery: null, grade: RECLAIMED.test(seg) ? ("RECLAIMED" as const) : null };
  const hasCylWord = CYL_RE.test(seg);
  let line: Line | null = null;

  const xSize = take(w, RE_COUNT_X_SIZE);
  if (xSize.length > 1) return null;
  if (xSize.length === 1) {
    line = { ...base, requestMode: "BY_CYLINDER_COUNT", totalWeight: null, cylinderCount: Number(xSize[0][1]), cylinderSize: { value: num(xSize[0][2]), unit: unitOf(xSize[0][3]) } };
  } else {
    // Bare classifiers ("2 шт") count cylinders only next to a cylinder word.
    const counts = RE_COUNTS.flatMap((re, i) => (i === 3 && !hasCylWord ? [] : take(w, re)));
    const masses = take(w, RE_MASS);
    if (counts.length === 1 && masses.length <= 1) {
      // One count: its one weight, wherever it sits, is the size of each cylinder.
      line = {
        ...base,
        requestMode: "BY_CYLINDER_COUNT",
        totalWeight: null,
        cylinderCount: Number(counts[0][1]),
        cylinderSize: masses[0] ? { value: num(masses[0][1]), unit: unitOf(masses[0][2]) } : null,
      };
    } else if (counts.length === 0 && masses.length === 1 && !hasCylWord) {
      line = { ...base, requestMode: "BY_TOTAL_WEIGHT_KG", totalWeight: { value: num(masses[0][1]), unit: unitOf(masses[0][2]) }, cylinderCount: null, cylinderSize: null };
    }
  }
  // Every digit used, or the model reads it.
  if (!line || /\p{N}/u.test(w.s)) return null;
  return line;
}

/** "e.g." markers in many languages: "pvz.", "f.eks.", "z. B.", "bijv.:" — nothing to order. */
const ABBREVIATION = /^(?:\p{L}{1,6}\.\s?){1,2}:?$/u;

export function parseOrderLocally(text: string): FastPathResult {
  // Keep the separators: a fragment split off from its item ("… R-410A a 10 kg" —
  // Portuguese "a" is Czech "and") is glued back to the piece before it.
  const parts = text.split(SEPARATOR);
  const segs: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i].trim();
    if (!piece) continue;
    const orphan = ORPHAN_WEIGHT.test(piece);
    if (orphan && segs.length > 0) segs[segs.length - 1] = `${segs[segs.length - 1]}${parts[i - 1] ?? " "}${piece}`.trim();
    else segs.push(piece);
  }

  const result: FastPathResult = { parsed: [], unparsed: [] };
  segs.forEach((seg, i) => {
    if (FILLER.test(seg) || ABBREVIATION.test(seg)) return;
    const line = parseSegment(seg);
    if (line) result.parsed.push({ segment: i, line });
    else result.unparsed.push({ segment: i, text: seg });
  });
  return result;
}
