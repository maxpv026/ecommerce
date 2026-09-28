"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Byte-accurate download progress for a single model, keyed by URL.
 *
 * drei's `useProgress` counts *items*, not bytes — with one .glb in flight it
 * reads 0% until the file lands and then jumps to 100%. Our models are 22–95 MB,
 * so a progress bar pinned at 0% for the whole download is worse than none.
 *
 * The numbers come from `useLoader`'s `onProgress`, which fires while the
 * component that requested the model is *suspended* — so it cannot be React
 * state on that component. It lives here instead, and the DOM-side loading
 * overlay reads it through `useSyncExternalStore`.
 */

export interface ModelProgress {
  loaded: number;
  total: number;
}

/** Stable reference, so getSnapshot doesn't loop when nothing is known yet. */
const UNKNOWN: ModelProgress = { loaded: 0, total: 0 };

const progressBySrc = new Map<string, ModelProgress>();
const listenersBySrc = new Map<string, Set<() => void>>();

function notify(src: string) {
  const listeners = listenersBySrc.get(src);
  if (listeners) for (const listener of listeners) listener();
}

/**
 * Records download progress. Chunk events fire hundreds of times for a file
 * this size, so anything that wouldn't move the rendered percentage is
 * dropped rather than re-rendering the overlay for it.
 */
export function reportModelProgress(src: string, loaded: number, total: number) {
  const previous = progressBySrc.get(src);
  if (
    previous &&
    previous.total === total &&
    total > 0 &&
    Math.floor((previous.loaded / total) * 100) === Math.floor((loaded / total) * 100)
  ) {
    return;
  }

  progressBySrc.set(src, { loaded, total });
  notify(src);
}

/** Drops a finished model's counters so a later revisit starts clean. */
export function clearModelProgress(src: string) {
  if (progressBySrc.delete(src)) notify(src);
}

function subscribeTo(src: string) {
  return (onChange: () => void) => {
    let listeners = listenersBySrc.get(src);
    if (!listeners) {
      listeners = new Set();
      listenersBySrc.set(src, listeners);
    }
    listeners.add(onChange);

    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) listenersBySrc.delete(src);
    };
  };
}

export function useModelProgress(src: string): ModelProgress {
  const subscribe = useMemo(() => subscribeTo(src), [src]);
  const getSnapshot = useCallback(() => progressBySrc.get(src) ?? UNKNOWN, [src]);
  return useSyncExternalStore(subscribe, getSnapshot, () => UNKNOWN);
}
