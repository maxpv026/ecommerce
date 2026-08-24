"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

interface CartCountContextValue {
  cartCount: number;
  setCartCount: Dispatch<SetStateAction<number>>;
  bumpCartCount: (delta: number) => void;
}

const CartCountContext = createContext<CartCountContextValue | null>(null);

// Backs the persistent global bottom nav's cart badge. Each mobile page's
// item-level cart interactions (qty steppers, remove, add-to-cart) still
// live in that page's own local state — this only unifies the aggregate
// count so the badge stays coherent as a user navigates between tabs.
export function CartCountProvider({ children }: { children: ReactNode }) {
  const [cartCount, setCartCount] = useState(2);

  const bumpCartCount = (delta: number) => {
    setCartCount((c) => Math.max(0, c + delta));
  };

  return (
    <CartCountContext.Provider value={{ cartCount, setCartCount, bumpCartCount }}>
      {children}
    </CartCountContext.Provider>
  );
}

export function useCartCount() {
  const ctx = useContext(CartCountContext);
  if (!ctx) throw new Error("useCartCount must be used within a CartCountProvider");
  return ctx;
}
