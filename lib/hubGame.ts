import { HFC_QUOTA } from "@/lib/regulation";
import { PT_BY_LABEL, barAbsToBarG, saturationBarAbs } from "@/lib/refrigerantPT";

/**
 * The hub's engineering challenge — 0 model calls, all in the browser.
 *
 * Diagnostics: each case is a textbook fault pattern stated as temperatures
 * (evaporating and condensing saturation, suction-line and liquid-line
 * temperatures, ambient). The gauge pressures are COMPUTED from those
 * temperatures with the CoolProp-fitted P-T curves (lib/refrigerantPT), so
 * every reading on screen is physically consistent for its gas; superheat and
 * subcooling are the differences. The pattern → diagnosis pairs are the
 * standard service-manual ones (e.g. high superheat + low subcooling + low
 * pressures = undercharge).
 *
 * Quiz: facts with a source in this repo — Regulation (EU) 2024/573
 * (lib/regulation), Directive 2006/40/EC, ISO 817 safety classes, CoolProp
 * boiling points and pressures (lib/refrigerantPT).
 */

export const DIAGNOSES = ["normal", "undercharge", "overcharge", "condenserAirflow", "restriction", "evapAirflow", "compressorWeak"] as const;
export type Diagnosis = (typeof DIAGNOSES)[number];

interface CaseSpec {
  id: string;
  gas: "R-32" | "R-410A" | "R-404A" | "R-134a" | "R-1234yf";
  /** MarketHub.case_* — the system and the complaint. */
  system: string;
  ambientC: number;
  evapC: number;
  condC: number;
  suctionC: number;
  liquidC: number;
  answer: Diagnosis;
  options: [Diagnosis, Diagnosis, Diagnosis, Diagnosis];
}

const CASES: CaseSpec[] = [
  { id: "split-normal", gas: "R-32", system: "case_splitR32", ambientC: 30, evapC: 7, condC: 45, suctionC: 13, liquidC: 39, answer: "normal", options: ["undercharge", "normal", "overcharge", "evapAirflow"] },
  { id: "split-undercharge", gas: "R-410A", system: "case_splitR410a", ambientC: 32, evapC: -2, condC: 39, suctionC: 20, liquidC: 38, answer: "undercharge", options: ["evapAirflow", "restriction", "undercharge", "compressorWeak"] },
  { id: "bmw-undercharge", gas: "R-1234yf", system: "case_bmwYf", ambientC: 30, evapC: -6, condC: 41, suctionC: 12, liquidC: 40, answer: "undercharge", options: ["undercharge", "condenserAirflow", "normal", "overcharge"] },
  { id: "split-overcharge", gas: "R-32", system: "case_splitR32Service", ambientC: 30, evapC: 10, condC: 55, suctionC: 12, liquidC: 39, answer: "overcharge", options: ["condenserAirflow", "overcharge", "normal", "compressorWeak"] },
  { id: "condenser-dirty", gas: "R-410A", system: "case_heatpumpR410a", ambientC: 30, evapC: 11, condC: 59, suctionC: 17, liquidC: 52, answer: "condenserAirflow", options: ["overcharge", "restriction", "condenserAirflow", "undercharge"] },
  { id: "bmw-fan", gas: "R-134a", system: "case_bmwR134a", ambientC: 33, evapC: 8, condC: 60, suctionC: 14, liquidC: 54, answer: "condenserAirflow", options: ["condenserAirflow", "overcharge", "compressorWeak", "evapAirflow"] },
  { id: "coldroom-restriction", gas: "R-404A", system: "case_coldroomR404a", ambientC: 25, evapC: -36, condC: 36, suctionC: -14, liquidC: 21, answer: "restriction", options: ["undercharge", "restriction", "evapAirflow", "normal"] },
  { id: "evap-airflow", gas: "R-32", system: "case_splitR32Filter", ambientC: 30, evapC: -3, condC: 40, suctionC: -1, liquidC: 34, answer: "evapAirflow", options: ["undercharge", "overcharge", "evapAirflow", "restriction"] },
  { id: "compressor-weak", gas: "R-410A", system: "case_splitR410aWeak", ambientC: 32, evapC: 15, condC: 38, suctionC: 26, liquidC: 34, answer: "compressorWeak", options: ["compressorWeak", "undercharge", "overcharge", "normal"] },
];

export interface DiagnosticCase {
  id: string;
  gas: string;
  system: string;
  ambientC: number;
  low: { barG: number; satC: number };
  high: { barG: number; satC: number };
  superheatK: number;
  subcoolingK: number;
  answer: Diagnosis;
  options: Diagnosis[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export const DIAGNOSTIC_CASES: DiagnosticCase[] = CASES.map((c) => {
  const pt = PT_BY_LABEL[c.gas]!;
  return {
    id: c.id,
    gas: c.gas,
    system: c.system,
    ambientC: c.ambientC,
    low: { barG: r1(barAbsToBarG(saturationBarAbs(pt, c.evapC))), satC: c.evapC },
    high: { barG: r1(barAbsToBarG(saturationBarAbs(pt, c.condC))), satC: c.condC },
    superheatK: c.suctionC - c.evapC,
    subcoolingK: c.condC - c.liquidC,
    answer: c.answer,
    options: c.options,
  };
});

/** Full-scale of the gauge bars, bar g: a little above the highest reading of any case. */
export const GAUGE_MAX_BAR = Math.ceil(Math.max(...DIAGNOSTIC_CASES.map((c) => c.high.barG)) / 5) * 5;

// ── Quiz ──

export interface QuizQuestion {
  id: string;
  /** MarketHub.q_* (question) and MarketHub.q_*_why (explanation). */
  key: string;
  /** Literal options (gas names, numbers, classes) — not translated. */
  options: string[];
  answer: number;
  values?: Record<string, string | number>;
}

const at45 = (gas: string) => r1(barAbsToBarG(saturationBarAbs(PT_BY_LABEL[gas]!, 45)));
const quota = (year: number) => HFC_QUOTA.find((q) => year >= q.from && year <= q.to)!.tonnes;

export const QUIZ: QuizQuestion[] = [
  { id: "mac150", key: "q_mac150", options: ["150", "750", "1430", "2500"], answer: 0 },
  { id: "service2500", key: "q_service2500", options: ["R-32", "R-134a", "R-404A", "R-407C"], answer: 2 },
  { id: "r32class", key: "q_r32class", options: ["A1", "A2L", "A3", "B2L"], answer: 1 },
  { id: "r290class", key: "q_r290class", options: ["A1", "A2L", "B1", "A3"], answer: 3 },
  { id: "carOil", key: "q_carOil", options: ["POE", "PAG", "MO", "AB"], answer: 1 },
  { id: "splitOil", key: "q_splitOil", options: ["POE", "PAG", "MO", "AB"], answer: 0 },
  { id: "superheat", key: "q_superheat", options: ["q_superheat_a", "q_superheat_b", "q_superheat_c", "q_superheat_d"], answer: 0 },
  { id: "subcooling", key: "q_subcooling", options: ["q_subcooling_a", "q_subcooling_b", "q_subcooling_c", "q_subcooling_d"], answer: 2 },
  { id: "pressure45", key: "q_pressure45", options: ["R-134a", "R-1234yf", "R-290", "R-32"], answer: 3, values: { r32: at45("R-32"), r134a: at45("R-134a") } },
  { id: "quota2050", key: "q_quota2050", options: ["0", "4 200 133", "9 132 097", "21 665 691"], answer: 0 },
  { id: "r404nbp", key: "q_r404nbp", options: ["−26 °C", "−30 °C", "−46 °C", "−52 °C"], answer: 2 },
  { id: "split750", key: "q_split750", options: ["2025", "2027", "2030", "2035"], answer: 0 },
  { id: "quotaHalf", key: "q_quotaHalf", options: ["≈ 10 %", "≈ 25 %", "≈ 50 %", "≈ 75 %"], answer: 2, values: { from: quota(2025), to: quota(2027) } },
];

/** Options that are message keys rather than literals. */
export const isKeyOption = (o: string) => o.startsWith("q_");

// ── Rank ──

export const RANKS = [
  { key: "rank_1", min: 0 },
  { key: "rank_2", min: 5 },
  { key: "rank_3", min: 12 },
  { key: "rank_4", min: 20 },
  { key: "rank_5", min: 30 },
] as const;

export const rankFor = (correct: number) => [...RANKS].reverse().find((r) => correct >= r.min)!;
export const nextRank = (correct: number) => RANKS.find((r) => r.min > correct) ?? null;

export const ACHIEVEMENTS = [
  { key: "ach_first", test: (s: GameStats) => s.correct >= 1 },
  { key: "ach_streak5", test: (s: GameStats) => s.bestStreak >= 5 },
  { key: "ach_allCases", test: (s: GameStats) => s.casesSolved.length >= DIAGNOSTIC_CASES.length },
  { key: "ach_bmw", test: (s: GameStats) => s.casesSolved.some((id) => id.startsWith("bmw")) },
  { key: "ach_regulation", test: (s: GameStats) => ["mac150", "service2500", "split750", "quota2050"].every((id) => s.quizSolved.includes(id)) },
] as const;

export interface GameStats {
  answered: number;
  correct: number;
  streak: number;
  bestStreak: number;
  casesSolved: string[];
  quizSolved: string[];
}

export const EMPTY_STATS: GameStats = { answered: 0, correct: 0, streak: 0, bestStreak: 0, casesSolved: [], quizSolved: [] };
