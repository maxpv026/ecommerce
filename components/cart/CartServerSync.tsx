"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCartStore, type CartLine } from "@/lib/store/cart";

/**
 * Mirrors a signed-in buyer's basket to the server (POST /api/cart/sync),
 * so an abandoned cart can be reminded about. Renders nothing.
 *
 * - Debounced 1.5 s: a burst of +/− clicks is one request.
 * - Only CHANGES are sent, plus the basket at sign-in when it is non-empty
 *   (a guest who filled a cart and then signed in). An empty basket on a
 *   fresh device is never sent on its own — that would wipe the basket the
 *   buyer left on their other computer.
 * - A pending sync is flushed with `keepalive` when the tab is hidden, so a
 *   last edit before closing is not lost.
 *
 * It also answers the reminder's "back to your cart" link (/cart?restore=1):
 * opened on a device whose own cart is empty, the saved basket is loaded
 * from the server at today's catalogue values.
 */

const DEBOUNCE_MS = 1500;

const snapshot = (items: CartLine[]) => items.map((i) => ({ sku: i.sku, qty: i.qty }));
const key = (items: CartLine[]) => JSON.stringify(snapshot(items));

function post(items: CartLine[]) {
  return fetch("/api/cart/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: snapshot(items).slice(0, 50) }),
    keepalive: true,
  }).catch(() => undefined);
}

async function restoreFromServer(onRestored: (count: number) => void) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("restore") !== "1") return;
  params.delete("restore");
  const rest = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);

  if (useCartStore.getState().items.length > 0) return; // this device's own basket wins
  const res = await fetch("/api/cart/sync", { cache: "no-store" }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { ok?: boolean; lines?: CartLine[] } | null;
  const lines = body?.ok ? (body.lines ?? []) : [];
  if (lines.length === 0) return;
  useCartStore.getState().addItems(lines.map(({ qty, ...line }) => ({ line, qty })));
  onRestored(lines.reduce((n, l) => n + l.qty, 0));
}

export default function CartServerSync() {
  const { status } = useSession();
  const t = useTranslations("CartSync");

  useEffect(() => {
    if (status !== "authenticated") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = "";
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const flush = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      void post(useCartStore.getState().items);
    };

    const start = async () => {
      await restoreFromServer((count) => toast.success(t("restored", { count })));
      if (cancelled) return;
      const initial = useCartStore.getState().items;
      last = key(initial);
      if (initial.length > 0) void post(initial);
      unsubscribe = useCartStore.subscribe((state) => {
        const next = key(state.items);
        if (next === last) return;
        last = next;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          void post(useCartStore.getState().items);
        }, DEBOUNCE_MS);
      });
    };

    const offHydration = useCartStore.persist.hasHydrated()
      ? (void start(), undefined)
      : useCartStore.persist.onFinishHydration(() => void start());

    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      cancelled = true;
      offHydration?.();
      unsubscribe?.();
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [status, t]);

  return null;
}
