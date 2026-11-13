import { PT_BY_LABEL, barAbsToBarG, saturationBarAbs } from "@/lib/refrigerantPT";

/**
 * "Which of these refrigerants can go into my BMW X4 / Daikin FTXM35R?" —
 * answered by rules, not by a model.
 *
 *   1. Recognise the system (identifySystem): vehicle brands and BMW chassis
 *      codes, model years against the EU's 2017 vehicle A/C cut-over
 *      (Directive 2006/40/EC: new vehicles from 1 January 2017 use GWP < 150,
 *      i.e. R-1234yf), and HVAC system types with their nameplate gases.
 *   2. Judge every compared gas against it (verdictFor): factory refrigerant,
 *      an approved retrofit route, or not suitable — with the reason worked
 *      out from the gas's own data (pressure at +45 °C from the P-T fits,
 *      safety class, oil family).
 *
 * Where the text names no generation, both generations are shown and the
 * message says the label decides — the answer never pretends to know which
 * car is in the workshop. Charges are the typical range for the CLASS of
 * system, labelled as such: the nameplate or under-bonnet label is the
 * authority, and every message says so.
 *
 * Only an unrecognisable description goes to the model, and the model only
 * classifies it (kind / refrigerant / year — lib/actions/hub); the verdicts
 * are still these rules.
 */

export const COMPARE_GASES = ["R-1234yf", "R-134a", "R-32", "R-410A", "R-404A", "R-290", "R-407C"] as const;
export type CompareGas = (typeof COMPARE_GASES)[number];

export type SystemKind = "car" | "split" | "heatpump" | "chiller" | "coldroom";

export interface SystemProfile {
  /** What we recognised ("BMW X4", "Daikin FTXM35R"), for the heading. */
  label: string;
  kind: SystemKind;
  /** Factory refrigerants. Two when the generation isn't known (car before/after 2017). */
  oem: CompareGas[];
  /** The generation is ambiguous: say so next to each OEM gas. */
  checkLabel: boolean;
  /** Message key explaining the generation (MarketHub.gen_*), with {label}. */
  generationKey: string | null;
  /** The OEM gas is a legacy one with a lower-GWP service route (R-404A → R-449A …). */
  retrofitTo: string[];
  /** Typical charge for this class of system, kg — not this unit's nameplate. */
  chargeKg: [number, number];
  /** How it was recognised: rules (0 tokens) or the model's classification. */
  via: "rules" | "ai";
}

/** Typical charge ranges by class of system (kg). */
const CHARGE: Record<SystemKind, [number, number]> = {
  car: [0.4, 0.9],
  split: [0.5, 1.5],
  heatpump: [0.8, 3],
  chiller: [20, 150],
  coldroom: [3, 30],
};

const CAR_BRANDS = /\b(bmw|mini|audi|vw|volkswagen|skoda|škoda|seat|cupra|porsche|mercedes|benz|toyota|lexus|tesla|ford|renault|dacia|peugeot|citro[eë]n|opel|vauxhall|hyundai|kia|nissan|honda|mazda|volvo|fiat|jeep|land ?rover|range ?rover|jaguar|subaru|mitsubishi (outlander|lancer|asx|pajero)|suzuki|lada|byd|polestar|cupra|alfa ?romeo)\b/iu;

/** Explicit gas in the text ("Холодильна вітрина R-404A"). */
const GAS_RE = /(?<![\p{L}\p{N}])R[\s-]?(1234yf|134a|32|410a|404a|290|407c|22|448a|449a|507a?|513a)(?![\p{L}\p{N}])/iu;
const CANON: Record<string, CompareGas> = { "1234YF": "R-1234yf", "134A": "R-134a", "32": "R-32", "410A": "R-410A", "404A": "R-404A", "290": "R-290", "407C": "R-407C" };
/** "r134a" / "R 404A" / "R-1234yf" → the compare label, or null for a gas outside the comparison. */
export const asGas = (raw: string): CompareGas | null => CANON[raw.trim().toUpperCase().replace(/^R[\s-]?/, "")] ?? null;

const yearOf = (text: string): number | null => {
  const m = text.match(/(?<!\d)(19[89]\d|20[0-3]\d)(?!\d)/);
  return m ? Number(m[1]) : null;
};

type CarEra = "old" | "new" | "both";

/** BMW chassis codes: E (≤ 2013) R-134a · F (2010–2019) either · G/U (2017+) R-1234yf. Several codes ("F26 / G02") → either. */
function bmwEra(text: string): { era: CarEra; chassis: string | null } {
  const codes = [...text.matchAll(/\b([EFGU])\s?(\d{2})\b/gi)].map((m) => `${m[1]!.toUpperCase()}${m[2]}`);
  if (codes.length === 0) return { era: "both", chassis: null };
  const eras = new Set<CarEra>(codes.map((c) => (c[0] === "E" ? "old" : c[0] === "F" ? "both" : "new")));
  return { era: eras.size === 1 ? [...eras][0]! : "both", chassis: codes.join("/") };
}

/** Known names that pin a generation without a chassis code. */
const CAR_MODELS: Array<{ re: RegExp; label: string; era: CarEra }> = [
  { re: /bmw\s*x4/i, label: "BMW X4", era: "both" }, // F26 2014–2018 (either), G02 2018+ (R-1234yf)
  { re: /bmw\s*(5|5er|5 series|530|520|540)/i, label: "BMW 5 Series", era: "both" },
  { re: /tesla/i, label: "Tesla", era: "new" },
  { re: /(golf|гольф)\s*(8|viii)\b/i, label: "Volkswagen Golf 8", era: "new" },
  { re: /(golf|гольф)\s*(7|vii)\b/i, label: "Volkswagen Golf 7", era: "both" },
  { re: /(golf|гольф)\s*(4|5|6|iv|v|vi)\b/i, label: "Volkswagen Golf", era: "old" },
];

const HVAC: Array<{ re: RegExp; kind: SystemKind; label: string; oem: CompareGas[]; generationKey: string | null; retrofitTo?: string[] }> = [
  { re: /daikin.*ftxm\s?\d+\s?r/i, kind: "split", label: "Daikin FTXM…R", oem: ["R-32"], generationKey: null },
  { re: /daikin.*ftxs\s?\d+\s?k/i, kind: "split", label: "Daikin FTXS…K", oem: ["R-410A"], generationKey: null },
  { re: /zubadan/i, kind: "heatpump", label: "Mitsubishi Zubadan", oem: ["R-32", "R-410A"], generationKey: "gen_hvacTwo" },
  { re: /carrier\s*30\s?xa/i, kind: "chiller", label: "Carrier 30XA", oem: ["R-134a"], generationKey: null, retrofitTo: ["R-513A"] },
  { re: /(chiller|чилер|чиллер)/i, kind: "chiller", label: "", oem: ["R-134a"], generationKey: "gen_hvacNameplate", retrofitTo: ["R-513A"] },
  { re: /(monoblo|моноблок|heat ?pump|тепловий насос|тепловой насос|wärmepumpe|pompa ciepła)/i, kind: "heatpump", label: "", oem: ["R-290", "R-32"], generationKey: "gen_hvacNameplate" },
  { re: /(cold ?room|холодильн|морозильн|камер|вітрин|витрин|freezer|kühl|chłodni)/i, kind: "coldroom", label: "", oem: ["R-404A"], generationKey: "gen_hvacNameplate", retrofitTo: ["R-449A", "R-448A", "R-407F"] },
  { re: /(split|спліт|сплит|кондиціонер|кондиционер|air ?con|klima)/i, kind: "split", label: "", oem: ["R-32", "R-410A"], generationKey: "gen_hvacNameplate" },
];

/** Recognise the system from free text; null when the rules don't know it. */
export function identifySystem(input: string): SystemProfile | null {
  const text = input.trim();
  if (text.length < 2) return null;
  const named = text.match(GAS_RE);
  const namedGas = named ? asGas(named[0]) : null;

  const hvac = HVAC.find((h) => h.re.test(text));
  if (hvac) {
    const oem = namedGas ? [namedGas] : hvac.oem;
    return {
      label: hvac.label || text,
      kind: hvac.kind,
      oem,
      checkLabel: !namedGas && oem.length > 1,
      generationKey: namedGas ? null : hvac.generationKey,
      retrofitTo: (namedGas ?? oem[0]) === "R-404A" ? ["R-449A", "R-448A", "R-407F"] : (namedGas ?? oem[0]) === "R-134a" && hvac.kind === "chiller" ? ["R-513A"] : (hvac.retrofitTo ?? []),
      chargeKg: CHARGE[hvac.kind],
      via: "rules",
    };
  }

  if (CAR_BRANDS.test(text) || /\b(авто|машин|car|vehicle)\b/i.test(text)) {
    const model = CAR_MODELS.find((m) => m.re.test(text));
    let era: CarEra = model?.era ?? "both";
    let generationKey = "gen_carBoth";
    if (/bmw/i.test(text)) {
      const b = bmwEra(text);
      if (b.chassis) {
        era = b.era;
        generationKey = b.era === "new" ? "gen_bmwNew" : b.era === "old" ? "gen_bmwOld" : /x4/i.test(text) ? "gen_bmwX4" : "gen_bmwTransition";
      } else if (era === "both") generationKey = /x4/i.test(text) ? "gen_bmwX4" : "gen_bmwBoth";
    }
    const year = yearOf(text);
    if (year) {
      era = year >= 2017 ? "new" : year <= 2012 ? "old" : "both";
      generationKey = era === "new" ? "gen_carNew" : era === "old" ? "gen_carOld" : "gen_carBoth";
    }
    if (namedGas === "R-1234yf" || namedGas === "R-134a") era = namedGas === "R-1234yf" ? "new" : "old";
    if (model?.era === "new" && !year) generationKey = "gen_carNew";
    const oem: CompareGas[] = era === "new" ? ["R-1234yf"] : era === "old" ? ["R-134a"] : ["R-1234yf", "R-134a"];
    return { label: model?.label ?? text, kind: "car", oem, checkLabel: oem.length > 1, generationKey, retrofitTo: [], chargeKg: CHARGE.car, via: "rules" };
  }

  if (namedGas) {
    // Only a gas: judge everything else against it as the nameplate refrigerant.
    const kind: SystemKind = namedGas === "R-404A" ? "coldroom" : namedGas === "R-134a" || namedGas === "R-1234yf" ? "chiller" : "split";
    return { label: text, kind, oem: [namedGas], checkLabel: false, generationKey: null, retrofitTo: namedGas === "R-404A" ? ["R-449A", "R-448A", "R-407F"] : [], chargeKg: CHARGE[kind], via: "rules" };
  }
  return null;
}

/** Build a profile from the model's classification (unrecognised text only). */
export function profileFromClassification(input: string, c: { kind: SystemKind; refrigerant: string | null; year: number | null }): SystemProfile {
  const gas = c.refrigerant ? asGas(c.refrigerant) : null;
  if (c.kind === "car") {
    const era: CarEra = gas === "R-1234yf" ? "new" : gas === "R-134a" ? "old" : c.year ? (c.year >= 2017 ? "new" : c.year <= 2012 ? "old" : "both") : "both";
    const oem: CompareGas[] = era === "new" ? ["R-1234yf"] : era === "old" ? ["R-134a"] : ["R-1234yf", "R-134a"];
    return { label: input, kind: "car", oem, checkLabel: oem.length > 1, generationKey: era === "new" ? "gen_carNew" : era === "old" ? "gen_carOld" : "gen_carBoth", retrofitTo: [], chargeKg: CHARGE.car, via: "ai" };
  }
  const fallback: Record<Exclude<SystemKind, "car">, CompareGas[]> = { split: ["R-32", "R-410A"], heatpump: ["R-290", "R-32"], chiller: ["R-134a"], coldroom: ["R-404A"] };
  const oem = gas ? [gas] : fallback[c.kind];
  return {
    label: input,
    kind: c.kind,
    oem,
    checkLabel: oem.length > 1,
    generationKey: gas ? null : "gen_hvacNameplate",
    retrofitTo: oem[0] === "R-404A" ? ["R-449A", "R-448A", "R-407F"] : c.kind === "chiller" ? ["R-513A"] : [],
    chargeKg: CHARGE[c.kind],
    via: "ai",
  };
}

// ── Verdicts ──

export type Verdict = "ok" | "conditional" | "no" | "unknown";

export interface GasVerdict {
  gas: CompareGas;
  verdict: Verdict;
  /** MarketHub.why_* message key and its values. */
  why: string;
  values: Record<string, string | number>;
  /** Oil family for this gas in this system (MarketHub.oil_*). */
  oil: string;
}

const AUTOMOTIVE = new Set<CompareGas>(["R-134a", "R-1234yf"]);
export const SAFETY: Record<CompareGas, "A1" | "A2L" | "A3"> = { "R-1234yf": "A2L", "R-134a": "A1", "R-32": "A2L", "R-410A": "A1", "R-404A": "A1", "R-290": "A3", "R-407C": "A1" };
export const GWP_REFERENCE: Record<CompareGas, number> = { "R-1234yf": 4, "R-134a": 1430, "R-32": 675, "R-410A": 2088, "R-404A": 3922, "R-290": 3, "R-407C": 1774 };

/** Saturation pressure at +45 °C, bar gauge (what the manifold reads) — the condensing side on a hot day. */
export const pressureAt45 = (gas: string) => {
  const pt = PT_BY_LABEL[gas];
  return pt ? Math.round(barAbsToBarG(saturationBarAbs(pt, 45)) * 10) / 10 : null;
};

/** GWP (100-yr, IPCC AR4 — the basis of Reg. 2024/573's quota accounting) of the retrofit gases named here; the compared gases use the catalog's figure. */
export const RETROFIT_GWP: Record<string, number> = { "R-449A": 1397, "R-448A": 1387, "R-407F": 1825, "R-513A": 631 };

/** Oil family (MarketHub.oil_*): PAG in car compressors, POE in stationary HFC systems, MO/POE with R-290. No system → the gas's usual families. */
export const oilFor = (gas: CompareGas, kind: SystemKind | null) => {
  if (gas === "R-290") return "oil_hc";
  if (kind === "car") return gas === "R-1234yf" ? "oil_pagYf" : gas === "R-134a" ? "oil_pag" : "oil_poe";
  if (kind === null && (gas === "R-134a" || gas === "R-1234yf")) return "oil_pagPoe";
  return "oil_poe";
};

export function verdictFor(gas: CompareGas, s: SystemProfile): GasVerdict {
  const oil = oilFor(gas, s.kind);
  const p = pressureAt45(gas) ?? 0;
  const base: CompareGas = s.oem[0];
  const ref = pressureAt45(base) ?? 0;
  const out = (verdict: Verdict, why: string, values: Record<string, string | number> = {}): GasVerdict => ({ gas, verdict, why, values: { gas, p, ref, base, system: s.label, ...values }, oil });

  if (s.oem.includes(gas)) {
    if (s.kind === "car") return out("ok", gas === "R-1234yf" ? "why_carNew" : "why_carOld", { check: s.checkLabel ? "yes" : "no" });
    return out("ok", s.checkLabel ? "why_okCheck" : "why_ok");
  }
  if (s.kind === "car") {
    if (gas === "R-290") return out("no", "why_carFlammable");
    if (!AUTOMOTIVE.has(gas)) return out("no", "why_carPressure", { ratio: ref > 0 ? Math.round((p / ref) * 10) / 10 : 0 });
    // The other automotive gas, in a car that left the factory with one of them.
    return gas === "R-134a" ? out("no", "why_carDowngrade") : out("conditional", "why_carUpgrade");
  }
  if (gas === "R-290") return out("no", "why_flammable");
  if (AUTOMOTIVE.has(gas) && (s.kind === "split" || s.kind === "heatpump" || s.kind === "coldroom")) return out("no", "why_tooLowPressure");
  if (base === "R-404A" && gas === "R-407C") return out("no", "why_notInterchangeable");
  if (base === "R-134a" && s.kind === "chiller" && gas === "R-1234yf") return out("no", "why_chillerYf");
  return out("no", "why_notInterchangeable");
}

/** The gas to recommend buying for this system: the (first) factory gas, or the retrofit route where the factory gas is being phased out. */
export function recommendedGas(s: SystemProfile): { gas: string; retrofit: boolean } {
  if (s.oem[0] === "R-404A" && s.retrofitTo.length) return { gas: s.retrofitTo[0]!, retrofit: true };
  return { gas: s.oem[0]!, retrofit: false };
}

/** Quick presets under the input. `text` is what the rules read; the chip shows the translated label (MarketHub.preset_*). */
export const SYSTEM_PRESETS = [
  { key: "preset_bmwX4", text: "BMW X4 (F26 / G02)" },
  { key: "preset_bmw5", text: "BMW 5 Series (G30)" },
  { key: "preset_daikin", text: "Daikin FTXM35R split" },
  { key: "preset_heatpump", text: "Monoblock heat pump" },
  { key: "preset_coldroom", text: "Commercial cold room" },
] as const;
