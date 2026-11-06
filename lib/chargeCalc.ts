/**
 * Refrigerant charge for a split system — the deterministic half of the
 * System Charge Calculator. Metric throughout (m, kg, g/m); the liquid line
 * stays in fractional inches, as copper is sold in Europe.
 *
 * The AI only reads the engineer's sentence into inputs
 * (lib/actions/chargeCalculator); every number on the result card is
 * computed here, by the same function on the server and in the browser (the
 * card recomputes as the engineer corrects an input).
 *
 *   extraLengthM  = max(0, lineSetLengthM − ratedLengthM)
 *   extraChargeKg = extraLengthM × chargePerMeterG / 1000
 *   totalChargeKg = factoryChargeKg + extraChargeKg
 *
 * A split outdoor unit ships pre-charged for its rated line length, so on a
 * new install the engineer adds only `extraChargeKg`; the total is what the
 * system holds — what a full recharge after recovery needs. The factory
 * charge comes from the unit's nameplate and is never estimated: without it
 * the total is simply not shown.
 *
 * Client-safe: no server imports.
 */

/** Exact conversions, used only to read imperial input — never displayed. */
export const M_PER_FT = 0.3048;
export const KG_PER_LB = 0.45359237;
export const G_PER_OZ = 28.349523125;

/**
 * Pre-charged line length when the manual isn't quoted. Most European
 * splits are charged for 5 m; some for 7.5 m or 10 m — the card says so.
 */
export const DEFAULT_RATED_LENGTH_M = 5;

/** Liquid-line outside diameters, in inches as copper is specified. */
export const LIQUID_LINE_SIZES = ["1/4", "5/16", "3/8", "1/2", "5/8"] as const;
export type LiquidLineSize = (typeof LIQUID_LINE_SIZES)[number];

/**
 * Additional charge per metre of liquid line, g/m, for R-410A / R-32.
 * Only sizes with a near-universal manual figure are filled in:
 *   1/4″  20 g/m — the figure on most European split installation manuals.
 *   3/8″  56 g/m — 0.6 oz/ft converted (55.8 g/m), the standard R-410A value.
 *              A 3/8″ tube (≈7.9 mm bore) holds ≈49 cm³/m, ≈50 g of liquid,
 *              which is why a figure like 20–30 g/m fits 1/4″, not 3/8″.
 * Other sizes vary by manufacturer: the calculator asks for the manual's
 * figure instead of guessing.
 */
export const TYPICAL_G_PER_M: Partial<Record<LiquidLineSize, number>> = { "1/4": 20, "3/8": 56 };
export const DEFAULT_LIQUID_LINE: LiquidLineSize = "3/8";

export interface ChargeInputs {
  lineSetLengthM: number;
  ratedLengthM: number;
  /** Null when unknown — the addition can't be computed. */
  chargePerMeterG: number | null;
  /** From the nameplate; null → no total. */
  factoryChargeKg: number | null;
}

export interface ChargeResult {
  extraLengthM: number;
  /** Null when the per-metre rate is unknown. */
  extraChargeKg: number | null;
  /** Null when the factory charge (or the per-metre rate) is unknown. */
  totalChargeKg: number | null;
}

/** Rounds for display and cart use only; the math above runs unrounded. */
export const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function computeCharge(input: ChargeInputs): ChargeResult {
  const extraLengthM = Math.max(0, input.lineSetLengthM - input.ratedLengthM);
  const extraChargeKg = input.chargePerMeterG === null ? null : (extraLengthM * input.chargePerMeterG) / 1000;
  const totalChargeKg = extraChargeKg === null || input.factoryChargeKg === null ? null : input.factoryChargeKg + extraChargeKg;
  return { extraLengthM, extraChargeKg, totalChargeKg };
}

export interface CylinderOption {
  id: string;
  sku: string;
  name: string;
  weightLabel: string;
  weightKg: number;
  pricePerKg: number;
  cylinderDeposit: number;
}

/**
 * The cheapest-in-gas way to cover `neededKg` with ONE size of container:
 * for each size, how many it takes, then the option that buys the least gas
 * (ties → fewer containers). One size, because that's how a B2B order line
 * works; mixing sizes is a judgement the buyer can make in the cart.
 */
export function pickCylinders(neededKg: number, options: readonly CylinderOption[]): { option: CylinderOption; qty: number } | null {
  if (!(neededKg > 0)) return null;
  let best: { option: CylinderOption; qty: number; kg: number } | null = null;
  for (const option of options) {
    if (!(option.weightKg > 0)) continue;
    const qty = Math.ceil(neededKg / option.weightKg);
    const kg = qty * option.weightKg;
    if (!best || kg < best.kg - 1e-9 || (Math.abs(kg - best.kg) < 1e-9 && qty < best.qty)) best = { option, qty, kg };
  }
  return best && best.qty <= 99 ? { option: best.option, qty: best.qty } : null;
}
