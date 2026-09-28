"use client";

import SmartRestockCard from "./SmartRestockCard";
import type { ActiveRestockAlert } from "@/lib/smartRestock";

/**
 * The restock suggestions band on the account dashboard.
 *
 * Rendered above the dashboard rather than inside it: these are transient
 * prompts, not account data, and they must be able to disappear entirely
 * without leaving a hole in the layout. When there is nothing to suggest this
 * renders nothing at all — no empty state, no "no suggestions" card. Silence
 * is the correct UI for a recommendation engine with nothing to say.
 */
export default function SmartRestockStrip({
  alerts,
  className = "",
}: {
  alerts: ActiveRestockAlert[];
  className?: string;
}) {
  const live = alerts.filter((a) => a.purchasable);
  if (live.length === 0) return null;

  return (
    <div className={`flex flex-col gap-3 ${className}`} data-smart-restock-strip>
      {live.map((alert) => (
        <SmartRestockCard key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
