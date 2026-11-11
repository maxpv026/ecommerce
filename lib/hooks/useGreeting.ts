"use client";

import { useSyncExternalStore } from "react";
import { getTimeOfDayGreeting, type GreetingKey } from "@/lib/greeting";

/** Re-checks once a minute, so a page left open rolls from morning to afternoon. */
function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

/**
 * The time-of-day greeting, hydration-safe.
 *
 * The home page is static (ISR): its HTML is rendered once on the server and
 * served to everyone for minutes, in every timezone. Computing the greeting
 * during render therefore produced "Good evening" in the HTML and "Good
 * morning" in a Los Angeles browser — a hydration mismatch, which React
 * resolves by throwing the server HTML away and re-rendering the whole page
 * on the client (measured: the home root re-mounted on every such visit).
 *
 * Here the server's own key (rendered into the page, passed down as a prop)
 * is what hydration sees, so the markup matches exactly; React then reads
 * the browser's clock and swaps the one word in place.
 */
export function useGreeting(serverKey: GreetingKey): GreetingKey {
  return useSyncExternalStore(subscribe, getTimeOfDayGreeting, () => serverKey);
}
