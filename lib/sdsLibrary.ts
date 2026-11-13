import { normalizeMark } from "@/lib/gasMarks";
import { regulationStatus } from "@/lib/regulation";

/**
 * The /compliance/sds quick-spec data: one row per refrigerant, with the
 * transport (ADR) and hazard (CLP/GHS) identifiers a technician or driver
 * looks up before opening the PDF. Pure and client-safe — the page filters,
 * searches and expands over it with no request and no model call.
 *
 * Sources, so a reviewer can check every cell:
 *   • composition    ASHRAE 34 designations, mass %
 *   • CAS            the component substances' CAS numbers
 *   • UN / class     ADR Table A (3.2): single HFCs have their own entry
 *                    (R-32 UN 3252, R-134a UN 3159, R-125 UN 3220, R-404A
 *                    UN 3337, R-407C UN 3340); R-1234yf ships as UN 3161
 *                    (liquefied gas, flammable, n.o.s.), propane as UN 1978;
 *                    every other non-flammable blend as UN 3163 (liquefied
 *                    gas, n.o.s.). Class 2.1 gases are classification code 2F,
 *                    tunnel (B/D); class 2.2 are 2A, tunnel (C/E).
 *   • hazard codes   CLP: every liquefied gas is Press. Gas H280; the
 *                    flammable ones (A2L/A3 here) add Flam. Gas H220 — the
 *                    same classification lib/sdsContent prints on the
 *                    generated sheets, so the drawer and the PDF agree.
 *   • GWP            the listed product's own column when we sell the gas
 *                    (lib/data), else the reference value /hub uses.
 *
 * The first-aid lines are the standard SDS §4–6 actions for the safety
 * class, as short instructions — the drawer says the PDF is the controlled
 * document. Gases we hold no sheet for are still listed (the transport data
 * is regulatory, not ours), with the sheet marked "on request".
 */

export type SafetyClass = "A1" | "A2L" | "A3";

export interface GasSafety {
  /** The catalog mark ("R32", "R410A", "R125A") — also the ?gasType= value. */
  key: string;
  label: string;
  /** Chemical formula of a single substance (subscripts as Unicode). */
  formula: string | null;
  /** A blend's components and their mass shares, both "/"-joined. */
  blend: { parts: string; shares: string } | null;
  cas: string[];
  safety: SafetyClass;
  /** Reference GWP (AR4, as EU 2024/573 Annex I) for gases we don't list. */
  gwp: number;
  un: string;
  /** Contains fluorine: decomposes to hydrogen fluoride in a fire. */
  fluorinated: boolean;
}

const CAS = { R32: "75-10-5", R125: "354-33-6", R143a: "420-46-2", R134a: "811-97-2", R1234yf: "754-12-1", R600a: "75-28-5", R290: "74-98-6" } as const;

export const GAS_SAFETY: readonly GasSafety[] = [
  { key: "R32", label: "R-32", formula: "CH₂F₂", blend: null, cas: [CAS.R32], safety: "A2L", gwp: 675, un: "3252", fluorinated: true },
  { key: "R410A", label: "R-410A", formula: null, blend: { parts: "R-32 / R-125", shares: "50 / 50" }, cas: [CAS.R32, CAS.R125], safety: "A1", gwp: 2088, un: "3163", fluorinated: true },
  { key: "R134a", label: "R-134a", formula: "CH₂FCF₃", blend: null, cas: [CAS.R134a], safety: "A1", gwp: 1430, un: "3159", fluorinated: true },
  { key: "R404A", label: "R-404A", formula: null, blend: { parts: "R-125 / R-143a / R-134a", shares: "44 / 52 / 4" }, cas: [CAS.R125, CAS.R143a, CAS.R134a], safety: "A1", gwp: 3922, un: "3337", fluorinated: true },
  { key: "R407C", label: "R-407C", formula: null, blend: { parts: "R-32 / R-125 / R-134a", shares: "23 / 25 / 52" }, cas: [CAS.R32, CAS.R125, CAS.R134a], safety: "A1", gwp: 1774, un: "3340", fluorinated: true },
  { key: "R407F", label: "R-407F", formula: null, blend: { parts: "R-32 / R-125 / R-134a", shares: "30 / 30 / 40" }, cas: [CAS.R32, CAS.R125, CAS.R134a], safety: "A1", gwp: 1825, un: "3163", fluorinated: true },
  { key: "R422D", label: "R-422D", formula: null, blend: { parts: "R-125 / R-134a / R-600a", shares: "65.1 / 31.5 / 3.4" }, cas: [CAS.R125, CAS.R134a, CAS.R600a], safety: "A1", gwp: 2729, un: "3163", fluorinated: true },
  // Listed by the CRM as "R-125A"; the substance is R-125, pentafluoroethane.
  { key: "R125A", label: "R-125A", formula: "C₂HF₅", blend: null, cas: [CAS.R125], safety: "A1", gwp: 3500, un: "3220", fluorinated: true },
  { key: "R449A", label: "R-449A", formula: null, blend: { parts: "R-32 / R-125 / R-1234yf / R-134a", shares: "24.3 / 24.7 / 25.3 / 25.7" }, cas: [CAS.R32, CAS.R125, CAS.R1234yf, CAS.R134a], safety: "A1", gwp: 1397, un: "3163", fluorinated: true },
  { key: "R452A", label: "R-452A", formula: null, blend: { parts: "R-32 / R-125 / R-1234yf", shares: "11 / 59 / 30" }, cas: [CAS.R32, CAS.R125, CAS.R1234yf], safety: "A1", gwp: 2140, un: "3163", fluorinated: true },
  { key: "R507", label: "R-507", formula: null, blend: { parts: "R-125 / R-143a", shares: "50 / 50" }, cas: [CAS.R125, CAS.R143a], safety: "A1", gwp: 3985, un: "3163", fluorinated: true },
  { key: "R513A", label: "R-513A", formula: null, blend: { parts: "R-1234yf / R-134a", shares: "56 / 44" }, cas: [CAS.R1234yf, CAS.R134a], safety: "A1", gwp: 631, un: "3163", fluorinated: true },
  // Not in the catalog today; listed because buyers look them up (MAC, heat pumps).
  { key: "R1234yf", label: "R-1234yf", formula: "CF₃CF=CH₂", blend: null, cas: [CAS.R1234yf], safety: "A2L", gwp: 4, un: "3161", fluorinated: true },
  { key: "R290", label: "R-290", formula: "C₃H₈", blend: null, cas: [CAS.R290], safety: "A3", gwp: 3, un: "1978", fluorinated: false },
];

export const flammable = (g: Pick<GasSafety, "safety">) => g.safety !== "A1";

/** ADR identifiers that follow from flammability (2.1 ↔ 2F ↔ (B/D)). */
export function adrFor(g: Pick<GasSafety, "safety">) {
  return flammable(g)
    ? { adrClass: "2.1" as const, classCode: "2F" as const, tunnel: "(B/D)" as const }
    : { adrClass: "2.2" as const, classCode: "2A" as const, tunnel: "(C/E)" as const };
}

/** CLP label elements; codes only — the page translates their wording. */
export function clpFor(g: Pick<GasSafety, "safety">) {
  return flammable(g)
    ? { signal: "danger" as const, pictograms: ["GHS02", "GHS04"], hazard: ["H220", "H280"], precaution: ["P210", "P377", "P381", "P410+P403"] }
    : { signal: "warning" as const, pictograms: ["GHS04"], hazard: ["H280"], precaution: ["P410+P403"] };
}

/** The first-aid / leak lines for this gas, as message keys (SdsLibrary `fa_*`). */
export function firstAidKeys(g: Pick<GasSafety, "safety" | "fluorinated">): string[] {
  const keys = ["fa_vent", "fa_frost", "fa_inhal"];
  if (g.fluorinated) keys.push("fa_adrenaline");
  keys.push(flammable(g) ? "fa_ignition" : "fa_decomp");
  keys.push(g.safety === "A1" ? "fa_detector_a1" : g.safety === "A2L" ? "fa_detector_a2l" : "fa_detector_a3");
  return keys;
}

/** Message key for a P-statement code ("P410+P403" → "p_P410_P403"). */
export const pKey = (code: string) => `p_${code.replace("+", "_")}`;

/** Every sheet in one ZIP (app/api/documents/sds-archive). */
export const SDS_ARCHIVE_HREF = "/api/documents/sds-archive";

// ── Directory rows ──

export type SdsDocStatus = "released" | "placeholder" | "none";

export interface SdsRow extends GasSafety {
  /** We list at least one product of this gas. */
  inCatalog: boolean;
  /** GWP shown: the listed product's when there is one. */
  gwpShown: number;
  eu: ReturnType<typeof regulationStatus>;
  doc: {
    status: SdsDocStatus;
    /** Download link: the per-SKU endpoint (same as the PDP) or the static file. */
    href: string | null;
    /** The released sheet's revision number ("1.0"); the static file's own revision line otherwise. */
    revision: string | null;
    /** ISO date of a released sheet. */
    issuedOn: string | null;
  };
}

export type SdsFilter = "all" | "purchased" | SafetyClass | "adr";
export const SDS_FILTERS: readonly SdsFilter[] = ["all", "purchased", "A1", "A2L", "A3", "adr"];

const fold = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Search over what a buyer types: the mark in any spelling ("r32", "R-32"),
 * a CAS number, a UN number ("UN 3252", "3252"), or a component ("R-125").
 */
export function matchesQuery(row: GasSafety, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const hay = [row.key, row.label, row.formula ?? "", row.blend?.parts ?? "", ...row.cas, `UN${row.un}`].map(fold);
  return hay.some((h) => h.includes(q)) || fold(row.cas.join(" ")).includes(q);
}

export function matchesFilter(row: SdsRow, filter: SdsFilter, purchased: ReadonlySet<string>): boolean {
  if (filter === "all" || filter === "adr") return true;
  if (filter === "purchased") return purchased.has(normalizeMark(row.key));
  return row.safety === filter;
}

/** Bought first, then the catalog in its own order, then the reference gases. */
export function sortRows(rows: readonly SdsRow[], purchased: ReadonlySet<string>): SdsRow[] {
  const rank = (r: SdsRow) => (purchased.has(normalizeMark(r.key)) ? 0 : r.inCatalog ? 1 : 2);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

/** t CO₂e in one cylinder of `kg` (EU 2024/573: kg × GWP / 1000). */
export const co2eTonnes = (gwp: number, kg: number) => (gwp * kg) / 1000;
