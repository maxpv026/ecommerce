import type { ChargeExtraction } from "@/lib/chargeSchema";
import { GAS_MARKS, normalizeMark } from "@/lib/gasMarks";
import type { LiquidLineSize } from "@/lib/chargeCalc";

/**
 * The System Charge Calculator's zero-token path: reads the sentence locally
 * when every number in it is accounted for, and returns null otherwise — the
 * caller then asks the model, exactly as before.
 *
 * Accepted (any of the 28 UI languages — the preset chips are translated):
 *   exactly one refrigerant designation ("R-32", "R410A", "R 134a")
 *   exactly one length ("15 m", "15 м", "40 ft") → the line set
 *   optionally: one capacity ("7 kW", "12 000 BTU"), a liquid line
 *   (1/4" … 5/8" or 6.35 … 15.88 mm), a rate ("20 g/m", "0.6 oz/ft"), a known
 *   brand + model, and ONE mass — only next to a nameplate / factory word, as
 *   the model would only take a factory charge that the text calls one.
 *
 * Refused (→ model): a second length (rated length, height difference), any
 * leftover digit, a mass without a nameplate word, "pre-charged for …"
 * wording, a model number with no refrigerant (that needs inference), more
 * than one refrigerant. Being strict is the point: the fast path must never
 * read a sentence differently from the model.
 */

// A value: 15 · 1.6 · 1,6 · 12 000
const NUM = String.raw`(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+(?:[.,]\d+)?)`;
const END = String.raw`(?![\p{L}\p{N}])`;
const START = String.raw`(?<![\p{L}\p{N}.,/])`;

const num = (s: string) => Number(s.replace(/[ \u00a0\u202f]/g, "").replace(",", "."));

const RE = {
  refrigerant: new RegExp(String.raw`(?<![\p{L}\p{N}])R[ -]?(\d{2,4})(yf|ze|[a-c])?${END}`, "giu"),
  liquidMm: new RegExp(String.raw`${START}(6[.,]35|7[.,]94|9[.,]52|12[.,]7|15[.,]88)\s?(?:mm|мм)${END}`, "giu"),
  liquidIn: new RegExp(String.raw`(?<![\p{N}/])(1/4|5/16|3/8|1/2|5/8)\s?(?:"|″|''|in(?:ch(?:es)?)?\b|дюйм\p{L}*)?`, "giu"),
  rate: new RegExp(String.raw`${START}${NUM}\s?(g/m|г/м|gr/m|oz/ft)${END}`, "giu"),
  capacity: new RegExp(String.raw`${START}${NUM}[\s-]?(kW|кВт|квт|BTU(?:/h)?|БТЕ|BTU/год|tons?|TR)${END}`, "giu"),
  massCombo: new RegExp(String.raw`${START}${NUM}\s?(lbs?)\s+${NUM}\s?(oz)${END}`, "giu"),
  mass: new RegExp(String.raw`${START}${NUM}\s?(kg|кг|g|г|gr|lbs?|oz)${END}`, "giu"),
  length: new RegExp(String.raw`${START}${NUM}\s?(m|м|metr\p{L}*|meter\p{L}*|metro\p{L}*|méter\p{L}*|метр\p{L}*|ft|feet|foot|фут\p{L}*)${END}`, "giu"),
};

/** Words that make a mass the unit's factory charge, in the UI languages. */
const NAMEPLATE =
  /nameplate|name plate|factory|factory charge|табличк|табелк|заводськ|заводск|štítek|typeskilt|typenschild|werksfüll|πινακίδ|placa|nimiplaat|arvokilp|plaque|ainmchl|pločic|adattábl|targhett|명판|vardin|uzlīm|naamplaat|tabliczk|fabryczn|plăcuț|menovit|ploščic|märkskylt|plaka|铭牌|fábrica|fabbrica|usine/iu;

/** Wording that means a length might be the pre-charged (rated) length, not the line set. */
const RATED = /pre-?charg|precharg|rated|includ|inclus|incluid|заправлен|предзаправ|номінальн|vorgef|vorbefüll|pré-?charg|precarica/iu;

const BRANDS = [
  "Daikin", "Mitsubishi Electric", "Mitsubishi Heavy", "Mitsubishi", "LG", "Samsung", "Gree", "Midea", "Toshiba", "Panasonic", "Fujitsu",
  "Hitachi", "Haier", "Carrier", "Hisense", "Bosch", "Viessmann", "Vaillant", "Trane", "Lennox", "York", "Rheem", "Goodman", "Sharp",
  "Electrolux", "AUX", "TCL", "Cooper&Hunter", "Ballu", "Chigo", "Kentatsu", "Tosot", "Rotenso", "Sinclair",
];
const BRAND_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(${BRANDS.join("|")})${END}(?:\s+([A-Z0-9][A-Z0-9./-]*\d[A-Z0-9./-]*))?`, "giu");

const MM_TO_SIZE: Record<string, LiquidLineSize> = { "6.35": "1/4", "7.94": "5/16", "9.52": "3/8", "12.7": "1/2", "15.88": "5/8" };

/** Blank a match out of the working copy, keeping every other offset. */
const blank = (s: string, m: RegExpMatchArray) => s.slice(0, m.index!) + " ".repeat(m[0].length) + s.slice(m.index! + m[0].length);

function take(text: { s: string }, re: RegExp): RegExpMatchArray[] {
  const found = [...text.s.matchAll(re)];
  for (const m of found) text.s = blank(text.s, m);
  return found;
}

/** "R-410A" as the catalog spells it when we stock it; a tidy ASHRAE form otherwise. */
function refrigerantLabel(digits: string, suffix: string | undefined): string {
  const key = normalizeMark(`R${digits}${suffix ?? ""}`);
  const stocked = GAS_MARKS.find((m) => normalizeMark(m) === key);
  const tail = suffix ? (/^(yf|ze)$/i.test(suffix) ? suffix.toLowerCase() : digits === "134" || digits === "600" ? suffix.toLowerCase() : suffix.toUpperCase()) : "";
  return stocked ? stocked.replace(/^R/, "R-") : `R-${digits}${tail}`;
}

export function parseChargeLocally(query: string): ChargeExtraction | null {
  const text = query.normalize("NFKC").replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");
  if (RATED.test(text)) return null;
  const w = { s: text };

  const refs = take(w, RE.refrigerant);
  const labels = [...new Set(refs.map((m) => refrigerantLabel(m[1], m[2])))];
  if (labels.length !== 1) return null;

  const mm = take(w, RE.liquidMm);
  const inch = take(w, RE.liquidIn);
  const sizes = [...new Set([...mm.map((m) => MM_TO_SIZE[m[1].replace(",", ".")]), ...inch.map((m) => m[1] as LiquidLineSize)])];
  if (sizes.length > 1) return null;

  const rates = take(w, RE.rate);
  const caps = take(w, RE.capacity);
  const combos = take(w, RE.massCombo);
  const masses = take(w, RE.mass);
  const lengths = take(w, RE.length);
  const brands = take(w, BRAND_RE);
  if (rates.length > 1 || caps.length > 1 || lengths.length !== 1 || brands.length > 1 || combos.length + masses.length > 1) return null;

  // A factory charge only when the text calls it one.
  const massText = combos[0] ?? masses[0];
  if (massText && !NAMEPLATE.test(text)) return null;

  // Every digit must have been read. A stray number means the sentence says
  // something this parser doesn't understand — let the model read it.
  if (/\p{N}/u.test(w.s)) return null;

  const lengthM = lengths[0];
  const unit = /^(ft|feet|foot|фут)/iu.test(lengthM[2]) ? "ft" : "m";
  const massUnit = (u: string): "kg" | "g" | "lb" | "oz" => (/^(kg|кг)$/i.test(u) ? "kg" : /^(g|г|gr)$/i.test(u) ? "g" : /^lbs?$/i.test(u) ? "lb" : "oz");

  return {
    isChargeQuestion: true,
    brand: brands[0]?.[1] ?? null,
    model: brands[0]?.[2] ?? null,
    refrigerant: labels[0],
    refrigerantSource: "stated",
    capacityAsWritten: caps[0]?.[0].trim() ?? null,
    lineSetLength: { value: num(lengthM[1]), unit },
    liquidLineSize: sizes[0] ?? null,
    factoryCharge: combos[0]
      ? [
          { value: num(combos[0][1]), unit: "lb" },
          { value: num(combos[0][3]), unit: "oz" },
        ]
      : masses[0]
        ? [{ value: num(masses[0][1]), unit: massUnit(masses[0][2]) }]
        : null,
    ratedLength: null,
    chargePerLength: rates[0] ? { value: num(rates[0][1]), unit: /oz/i.test(rates[0][2]) ? "oz/ft" : "g/m" } : null,
  };
}
