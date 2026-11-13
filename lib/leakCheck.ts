/**
 * Regulation (EU) 2024/573, Art. 5 — how often one installed system must be
 * leak-checked. Pure; the /profile/compliance calculator runs it in the
 * browser (0 requests, 0 model calls).
 *
 *   Annex I gases (HFCs and their blends), by the system's charge in t CO₂e
 *   (kg × GWP / 1000, GWP as in Annex I — the AR4 values this repo uses):
 *       < 5          not required
 *       5 – < 50     every 12 months  (24 with a leakage detection system)
 *       50 – < 500   every 6 months   (12 with detection)
 *       ≥ 500        every 3 months   (6 with detection)
 *   Annex II Section 1 gases (unsaturated HFCs/HFOs, e.g. R-1234yf), by kg:
 *       < 1 kg       not required
 *       1 – < 10     every 12 months  (24)
 *       10 – < 100   every 6 months   (12)
 *       ≥ 100        every 3 months   (6)
 *
 *   Art. 6: stationary equipment at ≥ 500 t CO₂e (or ≥ 100 kg of an Annex II
 *   Section 1 gas) must have a leakage detection system.
 *
 * Not modelled: the exemptions in Art. 5(1) (e.g. hermetically sealed
 * equipment below its own threshold), and blends containing an HFO, where
 * the kg rule applies to the HFO share only — the gases offered here are
 * either pure HFC blends or a pure HFO, so neither case arises.
 */

export type LeakBasis = "co2e" | "kg";

export interface LeakGas {
  label: string;
  gwp: number;
  basis: LeakBasis;
}

/** The calculator's gases. GWP: Annex I (AR4), same table as lib/sdsLibrary. */
export const LEAK_GASES: readonly LeakGas[] = [
  { label: "R-134a", gwp: 1430, basis: "co2e" },
  { label: "R-32", gwp: 675, basis: "co2e" },
  { label: "R-410A", gwp: 2088, basis: "co2e" },
  { label: "R-404A", gwp: 3922, basis: "co2e" },
  { label: "R-407C", gwp: 1774, basis: "co2e" },
  { label: "R-1234yf", gwp: 4, basis: "kg" },
];

export interface LeakCheckResult {
  /** kg × GWP / 1000. Shown for Annex I gases; informative only for kg-basis gases. */
  co2eTonnes: number;
  basis: LeakBasis;
  /** Months between checks; null when no check is required. */
  months: number | null;
  /** The band that applies: 0 = below the threshold, 1–3 = the three bands. */
  band: 0 | 1 | 2 | 3;
  /** Art. 6 — a leakage detection system is mandatory (stationary equipment). */
  detectionMandatory: boolean;
}

const BANDS = { co2e: [5, 50, 500], kg: [1, 10, 100] } as const;
const MONTHS: Record<1 | 2 | 3, { base: number; detected: number }> = { 1: { base: 12, detected: 24 }, 2: { base: 6, detected: 12 }, 3: { base: 3, detected: 6 } };

export function leakCheck(gas: LeakGas, chargeKg: number, hasDetection: boolean): LeakCheckResult {
  const kg = Number.isFinite(chargeKg) && chargeKg > 0 ? chargeKg : 0;
  const co2eTonnes = (kg * gas.gwp) / 1000;
  const value = gas.basis === "co2e" ? co2eTonnes : kg;
  const [a, b, c] = BANDS[gas.basis];
  const band: LeakCheckResult["band"] = value >= c ? 3 : value >= b ? 2 : value >= a ? 1 : 0;
  const months = band === 0 ? null : hasDetection ? MONTHS[band].detected : MONTHS[band].base;
  return { co2eTonnes, basis: gas.basis, months, band, detectionMandatory: band === 3 };
}
