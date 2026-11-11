"use client";

import { create } from "zustand";

/**
 * Opens the Smart Bulk Order modal from anywhere (cart, catalogue header,
 * dashboard). Deliberately dependency-free apart from zustand: the launch
 * buttons import only this, so the modal's own code — the review table, the
 * upload zone — loads the first time somebody actually opens it.
 */
interface SmartOrderUi {
  open: boolean;
  /** Where it was opened from, for the "View cart" shortcut (hidden on /cart). */
  source: "cart" | "catalog" | "dashboard" | null;
  show: (source: SmartOrderUi["source"]) => void;
  hide: () => void;
}

export const useSmartOrderUi = create<SmartOrderUi>()((set) => ({
  open: false,
  source: null,
  show: (source) => set({ open: true, source }),
  hide: () => set({ open: false }),
}));
