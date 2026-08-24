"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// True only after client hydration. Anything rendered from localStorage-
// persisted state (the zustand cart) must be gated on this so the first
// client render matches the server HTML.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
