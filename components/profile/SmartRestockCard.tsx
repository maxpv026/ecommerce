"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/lib/store/cart";
import { dismissRestockAlert } from "@/lib/actions/restockAlerts";
import type { ActiveRestockAlert } from "@/lib/smartRestock";

/**
 * The predictive restock suggestion on the account dashboard.
 *
 * Non-intrusive by design: it sits in the flow rather than over it, carries
 * one primary action and one way out, and removes itself the moment it has
 * been acted on. A recommendation the customer has already handled but which
 * keeps reappearing stops reading as helpful very quickly.
 */

const CARD =
  "rounded-[20px] border border-slate-900/[.08] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass";

export default function SmartRestockCard({ alert }: { alert: ActiveRestockAlert }) {
  const addItem = useCartStore((s) => s.addItem);
  // Derived from the persisted cart, not from a one-off flag: if the
  // suggested product is already in the basket the job is done, and the card
  // stays hidden across a refresh without inventing a database status for it.
  // Empty the cart and the suggestion correctly comes back.
  const alreadyInCart = useCartStore((s) => s.items.some((i) => i.sku === alert.sku));

  const [dismissed, setDismissed] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Nothing to suggest if they cannot buy it — stock moves between the cron
  // run and this render, and offering a button that fails is worse than
  // showing nothing.
  if (!alert.purchasable || dismissed || (alreadyInCart && !justAdded)) return null;

  const handleAdd = () => {
    addItem(
      {
        sku: alert.sku,
        name: alert.name,
        variant: alert.variant,
        pricePerKg: alert.pricePerKg,
        weightKg: alert.weightKg,
        deposit: alert.deposit,
      },
      alert.recommendedQty
    );
    // Deliberately NOT marked CONVERTED: a basket is not a sale. The checkout
    // route credits the alert once an order is actually committed.
    setJustAdded(true);
    toast.success(`${alert.recommendedQty} × ${alert.name} added to your cart`);
    // Let the confirmation land, then let the card go.
    setTimeout(() => setDismissed(true), 1400);
  };

  const handleDismiss = () => {
    // Optimistic: the card goes now, and comes back only if the write failed.
    setDismissed(true);
    startTransition(async () => {
      const result = await dismissRestockAlert(alert.id);
      if (!result.ok) {
        setDismissed(false);
        toast.error("Could not dismiss that suggestion. Please try again.");
      }
    });
  };

  return (
    <div className={`${CARD} p-5`} data-smart-restock={alert.sku}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] border border-blue-700/[.22] bg-blue-700/[.08] text-blue-700 dark:bg-blue-600/[.18] dark:text-blue-400">
          <Sparkles size={15} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] tracking-[.09em] text-slate-500 dark:text-slate-400">
                SUGGESTED RESTOCK
              </div>
              <div className="mt-1 truncate text-[14.5px] font-semibold tracking-[-.02em]">
                {alert.name}
                {alert.variant ? (
                  <span className="font-normal text-slate-400 dark:text-slate-500"> · {alert.variant}</span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              aria-label="Dismiss this suggestion"
              data-restock-dismiss
              className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-slate-400 transition-colors hover:bg-slate-900/[.05] hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/[.06] dark:hover:text-slate-300"
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>

          {alert.aiMessage ? (
            <p className="mt-2.5 text-[13.5px] leading-[1.6] text-slate-600 dark:text-slate-400">
              {alert.aiMessage}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleAdd}
              disabled={justAdded}
              data-restock-add
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[13px] bg-blue-700 px-4 text-[13.5px] font-semibold tracking-[-.01em] text-white transition-[background-color,transform] duration-200 hover:bg-blue-800 active:scale-[.98] disabled:opacity-70"
            >
              {justAdded ? (
                <>
                  <Check size={15} strokeWidth={2.4} />
                  Added to cart
                </>
              ) : (
                `Add ${alert.recommendedQty} to cart`
              )}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-[13px] px-3 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/[.06]"
            >
              {isPending ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : null}
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
