import { VAT_RATE } from "@/lib/cart";

/**
 * The money lines of a placed order: goods, deposit, freight, VAT, total.
 *
 * One function for the order page and the invoice PDF, so the two can never
 * show different figures for the same order.
 *
 * The order stores only its frozen `totalAmount` and the per-line snapshots
 * (unit price, deposit). Shipping and VAT were charged at checkout but never
 * stored as columns, so they are recovered here from those frozen values —
 * NOT re-run through today's calculateCartTotals, which would silently
 * restate a historical order the day a rate or the freight rule changes.
 * Goods and deposit come from the lines, shipping is derived, and VAT takes
 * whatever is left, so the breakdown reconciles to the cent by construction.
 *
 * Checkout charges
 *     vat = VAT_RATE × (subtotal + shipping)          [deposit is exempt]
 * so  freightAndTax = shipping + VAT_RATE × (subtotal + shipping)
 *                  = shipping × (1 + VAT_RATE) + VAT_RATE × subtotal
 * and therefore
 *     shipping = (freightAndTax − VAT_RATE × subtotal) / (1 + VAT_RATE)
 *
 * Dropping the `VAT_RATE × subtotal` term — as a naive
 * `freightAndTax / (1 + VAT_RATE)` does — puts the VAT on goods into the
 * shipping line: the right total and an invalid tax document. Shipping is
 * clamped at zero because free freight is the common case and float noise
 * must not surface as a negative line.
 */

/** Cent rounding exactly as the invoice has always done it (EPSILON-guarded, so 1.005 → 1.01). */
function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface OrderBreakdownLine {
  /** Gas price of one cylinder (or unit price of equipment) at purchase. */
  priceAtPurchase: number;
  quantity: number;
  /** Per-cylinder deposit at purchase; 0 for non-returnable lines. */
  depositAtPurchase: number;
}

export interface OrderBreakdown {
  /** Goods only, net of VAT: Σ unit price × quantity. */
  subtotal: number;
  /** Refundable cylinder deposit (VAT-exempt). */
  deposit: number;
  /** How many cylinders carry that deposit. */
  depositUnits: number;
  /** Freight, net of VAT. 0 when free freight applied. */
  shipping: number;
  /** VAT on goods + shipping. */
  vat: number;
  /** The rate the VAT line was charged at, in whole percent. */
  vatRatePercent: number;
  /** The frozen charged total. subtotal + deposit + shipping + vat === total. */
  total: number;
}

export function orderBreakdown(lines: OrderBreakdownLine[], totalAmount: number): OrderBreakdown {
  const subtotal = cents(lines.reduce((n, l) => n + cents(l.priceAtPurchase * l.quantity), 0));
  const deposit = cents(lines.reduce((n, l) => n + l.depositAtPurchase * l.quantity, 0));
  const depositUnits = lines.reduce((n, l) => n + (l.depositAtPurchase > 0 ? l.quantity : 0), 0);

  const total = cents(totalAmount);
  const freightAndTax = cents(total - subtotal - deposit);
  const shipping = Math.max(0, cents((freightAndTax - VAT_RATE * subtotal) / (1 + VAT_RATE)));
  const vat = cents(freightAndTax - shipping);

  return { subtotal, deposit, depositUnits, shipping, vat, vatRatePercent: Math.round(VAT_RATE * 100), total };
}
