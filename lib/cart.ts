const FREE_FREIGHT_THRESHOLD = 600;
const FLAT_SHIPPING = 48;
// EU VAT applied at checkout preview. placeOrder() applies the same rate
// server-side — keep the two in sync via this shared constant.
export const VAT_RATE = 0.2;

export interface CartTotals {
  count: number;
  subtotal: number;
  shipping: number;
  vat: number;
  total: number;
}

export function calculateCartTotals(items: Array<{ price: number; qty: number }>): CartTotals {
  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_FREIGHT_THRESHOLD ? 0 : FLAT_SHIPPING;
  const vat = (subtotal + shipping) * VAT_RATE;
  const total = subtotal + shipping + vat;

  return { count, subtotal, shipping, vat, total };
}

export { FREE_FREIGHT_THRESHOLD };
