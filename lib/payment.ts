/**
 * How orders are settled.
 *
 * There is exactly one method today: a B2B bank transfer against an invoice.
 * The buyer places the order, the cylinders are reserved, and the company's
 * IBAN is shown on the confirmation — nothing is charged at checkout.
 *
 * Kept as a named constant rather than a bare string so the value stored in
 * `Order.paymentMethod` and the value the UI reasons about can never drift,
 * and so adding a second method later has an obvious home.
 */

export const BANK_TRANSFER_METHOD = "bank_transfer";

export type PaymentMethod = typeof BANK_TRANSFER_METHOD;

export function isBankTransfer(method: string | null | undefined): boolean {
  return method === BANK_TRANSFER_METHOD;
}
