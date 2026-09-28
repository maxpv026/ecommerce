"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { cylinderGasPrice } from "../pricing";

// A cart line is keyed by the Prisma Product.sku — the one identifier every
// add-to-cart surface (Home, catalog listing, PDP) can produce statically.
// The pricing fields are display-only snapshots: placeOrder() re-reads the
// authoritative per-kg rate, net weight and deposit from the Product row,
// so a stale persisted cart can never set what the customer is charged.
export interface CartLine {
  sku: string;
  name: string;
  variant: string;
  /** Gas price per kilogram (EUR). Equipment: unit price with weightKg 1. */
  pricePerKg: number;
  /** Net gas weight of one cylinder (kg). */
  weightKg: number;
  /** Refundable deposit charged per cylinder, on top of the gas price. */
  deposit: number;
  qty: number;
}

/**
 * Outcome of the AI certificate check run from the cart (POST
 * /api/verify-fgas). "account" scope means the row was updated and the
 * session will carry `isFGasVerified` once refreshed; "guest" scope only
 * unlocks checkout for this browser until the buyer signs in — the
 * certificate is never trusted across an account boundary.
 */
export interface FgasVerification {
  scope: "guest" | "account";
  /** Prisma User.id the verification was written to (account scope only). */
  userId: string | null;
  companyName: string;
  certificateId: string;
  category: string;
  /** ISO date */
  expiresAt: string;
  /** ISO date-time */
  verifiedAt: string;
}

interface CartState {
  items: CartLine[];
  fgasVerification: FgasVerification | null;
  addItem: (line: Omit<CartLine, "qty">, qty?: number) => void;
  increment: (sku: string) => void;
  decrement: (sku: string) => void;
  removeItem: (sku: string) => void;
  clear: () => void;
  setFgasVerification: (verification: FgasVerification | null) => void;
}

const MAX_QTY = 99;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      fgasVerification: null,

      addItem: (line, qty = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.sku === line.sku);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.sku === line.sku ? { ...i, qty: Math.min(MAX_QTY, i.qty + qty) } : i
              ),
            };
          }
          return { items: [...state.items, { ...line, qty: Math.min(MAX_QTY, qty) }] };
        }),

      increment: (sku) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.sku === sku ? { ...i, qty: Math.min(MAX_QTY, i.qty + 1) } : i
          ),
        })),

      // Floor of 1 — removing a line is an explicit action, not qty 0.
      decrement: (sku) =>
        set((state) => ({
          items: state.items.map((i) => (i.sku === sku ? { ...i, qty: Math.max(1, i.qty - 1) } : i)),
        })),

      removeItem: (sku) =>
        set((state) => ({ items: state.items.filter((i) => i.sku !== sku) })),

      // Clearing lines deliberately keeps the certificate: it belongs to the
      // buyer, not to a particular basket.
      clear: () => set({ items: [] }),

      setFgasVerification: (verification) => set({ fgasVerification: verification }),
    }),
    {
      name: "halocore-cart",
      // v2: lines moved from a per-cylinder `price` to pricePerKg × weightKg
      // (+ deposit). Old lines have no weight, so they'd price at €0 — drop
      // them rather than guess; the certificate verification carries over.
      // v3: the payment-method choice is gone — every order is now a bank
      // transfer — so drop whatever a persisted basket still carries for it.
      version: 3,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<CartState> & { paymentMethod?: unknown };
        // v1 lines priced per cylinder rather than per kg; they'd come out at
        // €0, so drop them rather than guess. The certificate carries over.
        const base = version < 2 ? { ...state, items: [] } : { ...state };
        delete base.paymentMethod;
        return base;
      },
    }
  )
);

/**
 * Cart line for re-ordering a past order line. Lines placed before
 * weight-based pricing carry no per-kg snapshot (0 / 1); their per-cylinder
 * figure is reused as a 1 kg rate so the price they paid is what's shown —
 * placeOrder() re-reads the live catalog either way.
 */
export function cartLineFromOrderItem(item: {
  sku: string;
  productName: string;
  variant: string;
  priceAtPurchase: number;
  pricePerKgAtPurchase: number;
  weightKgAtPurchase: number;
  depositAtPurchase: number;
}): Omit<CartLine, "qty"> {
  const hasBreakdown = item.pricePerKgAtPurchase > 0;
  return {
    sku: item.sku,
    name: item.productName,
    variant: item.variant,
    pricePerKg: hasBreakdown ? item.pricePerKgAtPurchase : item.priceAtPurchase,
    weightKg: hasBreakdown ? item.weightKgAtPurchase : 1,
    deposit: item.depositAtPurchase,
  };
}

export const selectCartCount = (state: CartState) => state.items.reduce((n, i) => n + i.qty, 0);
/** Gas subtotal only — the deposit is a separate line (see lib/cart.ts). */
export const selectCartSubtotal = (state: CartState) =>
  state.items.reduce((n, i) => n + cylinderGasPrice(i.pricePerKg, i.weightKg) * i.qty, 0);
