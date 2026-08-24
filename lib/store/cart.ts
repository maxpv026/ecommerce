"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// A cart line is keyed by the Prisma Product.sku — the one identifier every
// add-to-cart surface (Home, catalog listing, PDP) can produce statically.
// `price` is display-only: placeOrder() re-reads the authoritative price
// from the Product row, so a stale persisted cart can never set what the
// customer is charged.
export interface CartLine {
  sku: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
}

interface CartState {
  items: CartLine[];
  addItem: (line: Omit<CartLine, "qty">, qty?: number) => void;
  increment: (sku: string) => void;
  decrement: (sku: string) => void;
  removeItem: (sku: string) => void;
  clear: () => void;
}

const MAX_QTY = 99;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

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

      clear: () => set({ items: [] }),
    }),
    { name: "halocore-cart", version: 1 }
  )
);

export const selectCartCount = (state: CartState) => state.items.reduce((n, i) => n + i.qty, 0);
export const selectCartSubtotal = (state: CartState) =>
  state.items.reduce((n, i) => n + i.price * i.qty, 0);
