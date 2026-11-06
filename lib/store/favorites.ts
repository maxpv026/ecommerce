"use client";

import { create } from "zustand";
import { getFavoriteIds, toggleFavorite } from "@/lib/actions/favorites";

/**
 * Which products the signed-in buyer has favourited — one fetch per account
 * per page load, shared by every heart on the page. Not persisted: the
 * database is the record, and a stale copy in localStorage would show the
 * wrong heart after favouriting on another device.
 */
interface FavoritesState {
  /** Whose ids these are; a different account reloads. */
  userId: string | null;
  ids: Set<string>;
  status: "idle" | "loading" | "ready";
  /** Products with a toggle in flight — the heart ignores clicks meanwhile. */
  pending: Set<string>;
  load: (userId: string) => Promise<void>;
  /** Optimistic: flips at once, reconciles with the server's answer. */
  toggle: (productId: string) => Promise<{ ok: boolean; favorited: boolean }>;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  userId: null,
  ids: new Set(),
  status: "idle",
  pending: new Set(),

  load: async (userId) => {
    const state = get();
    if (state.userId === userId && state.status !== "idle") return;
    set({ userId, status: "loading", ids: new Set() });
    const result = await getFavoriteIds().catch(() => null);
    // Ignore a late answer for an account that has since signed out/switched.
    if (get().userId !== userId) return;
    set({ ids: new Set(result?.ok ? result.ids : []), status: "ready" });
  },

  toggle: async (productId) => {
    const { ids, pending } = get();
    if (pending.has(productId)) return { ok: false, favorited: ids.has(productId) };
    const was = ids.has(productId);

    const flip = (on: boolean) =>
      set((s) => {
        const next = new Set(s.ids);
        if (on) next.add(productId);
        else next.delete(productId);
        return { ids: next };
      });
    const setPending = (on: boolean) =>
      set((s) => {
        const next = new Set(s.pending);
        if (on) next.add(productId);
        else next.delete(productId);
        return { pending: next };
      });

    flip(!was);
    setPending(true);
    try {
      const result = await toggleFavorite(productId);
      if (!result.ok) {
        flip(was);
        return { ok: false, favorited: was };
      }
      flip(result.favorited);
      return { ok: true, favorited: result.favorited };
    } catch {
      flip(was);
      return { ok: false, favorited: was };
    } finally {
      setPending(false);
    }
  },
}));
