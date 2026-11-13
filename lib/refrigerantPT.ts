/**
 * Saturation pressure of the common refrigerants, computed in the browser —
 * no model call, no request.
 *
 * Antoine form, log10(P / bar abs) = A − B / (C + t / °C), with A, B, C
 * fitted by least squares to CoolProp 8.0 (NIST-grade equations of state)
 * over −40…+60 °C at 1 K steps. Worst-case error against CoolProp over that
 * range is listed per gas (≤ 0.61 %). R-410A and R-404A are blends; their
 * curve is the bubble point (saturated liquid) — R-404A's glide is ≈ 0.7 K,
 * R-410A's ≈ 0.1 K, so the dew pressure differs by less than the error here.
 *
 * Outside −40…+60 °C the fit is not validated, so the UI clamps to it.
 *
 * Normal boiling points and critical temperatures are from the same source.
 * Safety class: ISO 817 / ASHRAE 34. R-290's GWP (3, IPCC AR4 — the basis
 * EU 517/2014 and our catalog use) is the only figure here not read from the
 * catalog, because we do not stock it.
 */

export const PT_MIN_C = -40;
export const PT_MAX_C = 60;

export interface PtGas {
  /** Catalog mark (lib/gasMarks) — null for a gas we don't stock. */
  mark: "R32" | "R410A" | "R134a" | "R404A" | null;
  label: string;
  A: number;
  B: number;
  C: number;
  /** Max |error| of the fit vs CoolProp over −40…+60 °C, %. */
  maxErrPct: number;
  /** Normal boiling point (bubble, 1.01325 bar), °C. */
  nbpC: number;
  /** Critical temperature, °C. */
  tcC: number;
  safety: "A1" | "A2L" | "A3";
  /** Only for gases not in the catalog; catalog gases use the product's GWP. */
  gwpFallback?: number;
}

export const PT_GASES: readonly PtGas[] = [
  { mark: "R32", label: "R-32", A: 4.589048, B: 969.0159, C: 263.3701, maxErrPct: 0.532, nbpC: -51.65, tcC: 78.11, safety: "A2L" },
  { mark: "R410A", label: "R-410A", A: 4.545375, B: 953.8366, C: 261.8738, maxErrPct: 0.607, nbpC: -51.44, tcC: 71.34, safety: "A1" },
  { mark: "R134a", label: "R-134a", A: 4.277926, B: 921.2345, C: 241.6933, maxErrPct: 0.32, nbpC: -26.07, tcC: 101.06, safety: "A1" },
  { mark: "R404A", label: "R-404A", A: 4.377308, B: 935.8562, C: 260.5179, maxErrPct: 0.611, nbpC: -46.22, tcC: 72.12, safety: "A1" },
  { mark: null, label: "R-290", A: 4.130014, B: 896.9665, C: 259.6848, maxErrPct: 0.331, nbpC: -42.11, tcC: 96.74, safety: "A3", gwpFallback: 3 },
];

const ATM_BAR = 1.01325;
const PSI_PER_BAR = 14.503774;

export const clampPt = (t: number) => Math.min(PT_MAX_C, Math.max(PT_MIN_C, t));

/** Saturation pressure, bar absolute. */
export function saturationBarAbs(gas: Pick<PtGas, "A" | "B" | "C">, tC: number): number {
  const t = clampPt(tC);
  return 10 ** (gas.A - gas.B / (gas.C + t));
}

/** Gauge pressure in psi (psig) — what a manifold gauge reads at sea level. */
export const barAbsToPsig = (barAbs: number) => (barAbs - ATM_BAR) * PSI_PER_BAR;

/** Gauge pressure in bar (bar g). */
export const barAbsToBarG = (barAbs: number) => barAbs - ATM_BAR;

/**
 * Two more gases for the hub's comparator and diagnostics, fitted the same way
 * (CoolProp 8.0, −40…+60 °C). Not in PT_GASES, so the home workbench's five
 * rows are unchanged. R-407C has a large glide (≈7 K): this is its bubble
 * (liquid) curve — dew pressure at the same temperature is lower.
 */
export const PT_EXTRA: readonly PtGas[] = [
  { mark: null, label: "R-1234yf", A: 4.179171, B: 916.5197, C: 249.0589, maxErrPct: 0.385, nbpC: -29.46, tcC: 94.7, safety: "A2L", gwpFallback: 4 },
  { mark: null, label: "R-407C", A: 4.34023, B: 908.1641, C: 253.2377, maxErrPct: 0.332, nbpC: -43.63, tcC: 86.2, safety: "A1", gwpFallback: 1774 },
];

/** Every fitted gas by label ("R-410A"). */
export const PT_BY_LABEL: Readonly<Record<string, PtGas>> = Object.fromEntries([...PT_GASES, ...PT_EXTRA].map((g) => [g.label, g]));

/** Saturation temperature (°C) at a given absolute pressure — the inverse of the Antoine fit. */
export function saturationTempC(gas: Pick<PtGas, "A" | "B" | "C">, barAbs: number): number {
  return gas.B / (gas.A - Math.log10(barAbs)) - gas.C;
}
