import { cylinderGasPrice } from "./pricing";

const FREE_FREIGHT_THRESHOLD = 600;
const FLAT_SHIPPING = 48;
// EU VAT applied at checkout preview. placeOrder() applies the same rate
// server-side — keep the two in sync via this shared constant.
export const VAT_RATE = 0.2;
// The cylinder deposit is a refundable amount, not part of the goods
// supply, so it stays outside the VAT base. Flip this if your tax regime
// treats returnable-packaging deposits as taxable.
const CYLINDER_DEPOSIT_VATABLE = false;

/**
 * What the totals need to know about one cart line. Gas is priced by
 * weight: one cylinder costs pricePerKg × weightKg; the deposit is charged
 * per cylinder on top and never folded into the gas figure.
 */
export interface CartPricingLine {
  pricePerKg: number;
  weightKg: number;
  qty: number;
  /** Per-cylinder deposit (Product.cylinderDeposit); 0 / omitted for equipment. */
  deposit?: number;
}

export interface CartTotals {
  count: number;
  /** Gas / goods only — Σ (pricePerKg × weightKg) × qty. Never includes the deposit. */
  subtotal: number;
  /** Number of cylinders a deposit is charged on. */
  depositUnits: number;
  /** Mandatory, refundable cylinder deposit — Σ deposit × qty, its own line. */
  deposit: number;
  shipping: number;
  vat: number;
  total: number;
}

/** Gas price of one cylinder on this line. */
export function lineUnitPrice(line: Pick<CartPricingLine, "pricePerKg" | "weightKg">): number {
  return cylinderGasPrice(line.pricePerKg, line.weightKg);
}

/**
 * Builds the pricing line for a persisted cart entry, preferring the live
 * catalog product when it's known so a stale cart can never understate the
 * price, weight or deposit. Falls back to the values captured at add time.
 */
export function pricingLineFor(
  line: { pricePerKg: number; weightKg: number; deposit: number; qty: number },
  product?: { pricePerKg: number; weightKg: number; cylinderDeposit: number } | null
): CartPricingLine {
  return {
    pricePerKg: product?.pricePerKg ?? line.pricePerKg,
    weightKg: product?.weightKg ?? line.weightKg,
    deposit: product?.cylinderDeposit ?? line.deposit,
    qty: line.qty,
  };
}

export function calculateCartTotals(items: CartPricingLine[]): CartTotals {
  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + lineUnitPrice(i) * i.qty, 0);
  const depositUnits = items.reduce((n, i) => n + ((i.deposit ?? 0) > 0 ? i.qty : 0), 0);
  const deposit = items.reduce((n, i) => n + (i.deposit ?? 0) * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_FREIGHT_THRESHOLD ? 0 : FLAT_SHIPPING;
  const vat = (subtotal + shipping + (CYLINDER_DEPOSIT_VATABLE ? deposit : 0)) * VAT_RATE;
  const total = subtotal + deposit + shipping + vat;

  return { count, subtotal, depositUnits, deposit, shipping, vat, total };
}

export { FREE_FREIGHT_THRESHOLD };
