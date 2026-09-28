"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { selectCartCount, useCartStore } from "@/lib/store/cart";

interface CartCountContextValue {
  /** Total units in the persisted cart. 0 until the store has rehydrated. */
  cartCount: number;
  /** False during SSR and the first client render, true once localStorage is read. */
  hydrated: boolean;
}

const CartCountContext = createContext<CartCountContextValue | null>(null);

/**
 * Backs the global bottom nav's cart badge.
 *
 * The badge is a PROJECTION of the persisted cart — never its own state.
 *
 * It used to be the opposite: the provider started at a hardcoded 2, four
 * layouts mirrored the real total back in through setCartCount, and the
 * catalogue's "+" button called bumpCartCount without adding anything to the
 * cart at all. So a visitor who had never touched the cart saw "2", and one
 * who tapped "+" watched the badge climb while the cart stayed empty. Reading
 * the store directly deletes that whole class of drift: one source of truth,
 * nothing to keep in sync, and no way for a page to lie about the count.
 */
export function CartCountProvider({ children }: { children: ReactNode }) {
  const count = useCartStore(selectCartCount);

  // Zustand's persist middleware reads localStorage on the client only, so the
  // server renders an empty cart while the client would render the restored
  // one — a hydration mismatch on every page for anyone with items. The same
  // gate CartPage and CheckoutPage already use keeps the first client render
  // identical to the server HTML; MobileBottomNav hides the badge at 0, so the
  // placeholder never paints as a visible wrong number.
  const hydrated = useHydrated();

  return (
    <CartCountContext.Provider value={{ cartCount: hydrated ? count : 0, hydrated }}>
      {children}
    </CartCountContext.Provider>
  );
}

export function useCartCount() {
  const ctx = useContext(CartCountContext);
  if (!ctx) throw new Error("useCartCount must be used within a CartCountProvider");
  return ctx;
}
