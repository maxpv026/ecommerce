import type { CartItem } from "./types";

// EU-priced mobile cart. Same underlying products/quantities as the desktop
// cart's INITIAL_CART_ITEMS (lib/cart.ts), reordered to match the mobile
// design's mock state and fulfilled from EU hubs.
export const MOBILE_CART_ITEMS: CartItem[] = [
  {
    id: 1,
    name: "R-410A Premium",
    variant: "25 lb cylinder · Virgin",
    stock: "In stock · ships from Rotterdam",
    unit: 189,
    qty: 2,
  },
  {
    id: 3,
    name: "R-32 Low GWP",
    variant: "25 lb cylinder · A2L rated",
    stock: "Ships in 2–3 days",
    unit: 212,
    qty: 1,
  },
  {
    id: 2,
    name: "R-134a Standard",
    variant: "30 lb cylinder · Virgin",
    stock: "In stock · ships from Hamburg",
    unit: 164,
    qty: 1,
  },
];

const B2B_DISCOUNT_RATE = 0.08;
const VAT_RATE = 0.21;

export function calculateMobileCartTotals(items: CartItem[], promoApplied: boolean) {
  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.unit * i.qty, 0);
  const discount = promoApplied ? subtotal * B2B_DISCOUNT_RATE : 0;
  const tax = (subtotal - discount) * VAT_RATE;
  const total = subtotal - discount + tax;

  return { count, subtotal, discount, tax, total };
}
