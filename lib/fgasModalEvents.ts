"use client";

import { create } from "zustand";

/**
 * Opens the F-Gas verification window from anywhere — the cart's gate, the
 * desktop dashboard, the mobile profile. Dependency-free apart from zustand,
 * so the buttons don't pull the window's own code into every page.
 */
interface FgasModalUi {
  open: boolean;
  /** Where it was opened: the cart offers "Proceed to checkout" on success. */
  source: "cart" | "profile";
  show: (source: FgasModalUi["source"]) => void;
  hide: () => void;
}

export const useFgasModal = create<FgasModalUi>()((set) => ({
  open: false,
  source: "profile",
  show: (source) => set({ open: true, source }),
  hide: () => set({ open: false }),
}));
