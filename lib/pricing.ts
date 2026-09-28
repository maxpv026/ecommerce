// Weight-based pricing, shared by the storefront, the cart store, the
// server-side order action and the seeds. Plain functions only — no
// Prisma, no React — so every consumer computes a cylinder's price the
// same way.
//
//   gas price of one cylinder = pricePerKg × weightKg   (rounded to cents)
//   deposit per cylinder      = Product.cylinderDeposit  (€15, separate line)

export const KG_PER_LB = 0.45359237;

/** Mandatory refundable deposit per cylinder, in EUR (Product.cylinderDeposit default). */
export const CYLINDER_DEPOSIT_EUR = 15;

/** Categories sold by weight; everything else is priced per unit (weightKg 1). */
const PER_KG_CATEGORIES = new Set(["cylinders", "blends"]);

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Gas price of one full cylinder. */
export function cylinderGasPrice(pricePerKg: number, weightKg: number): number {
  return roundMoney(pricePerKg * weightKg);
}

export function isPricedPerKg(category: string): boolean {
  return PER_KG_CATEGORIES.has(category);
}

/** "10 kg" / "11.34 kg" — the kg symbol is locale-neutral, so this is safe in every UI. */
export function formatKg(weightKg: number): string {
  return `${Number(weightKg.toFixed(2))} kg`;
}

export function lbToKg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 100) / 100;
}

/**
 * Splits a legacy per-cylinder price into a per-kg rate for a known net
 * weight, so pricePerKg × weightKg reproduces the old cylinder price
 * (to the cent). Used to carry mock catalog rows over; the CRM inventory
 * is authored per kg directly.
 */
export function perKgFromCylinderPrice(cylinderPrice: number, weightKg: number): number {
  if (weightKg <= 0) return roundMoney(cylinderPrice);
  return roundMoney(cylinderPrice / weightKg);
}

/**
 * Legacy "<n> lb cylinder" rows: net kg + the per-kg rate that keeps their old
 * cylinder price.
 *
 * Storefront callers are gone with the old catalogue pages, but prisma/seed.ts
 * still builds every seeded row through this, so it is not dead code.
 */
export function gasPricingFromLegacy(cylinderPriceEur: number, lb: number): { pricePerKg: number; weightKg: number } {
  const weightKg = lbToKg(lb);
  return { pricePerKg: perKgFromCylinderPrice(cylinderPriceEur, weightKg), weightKg };
}

