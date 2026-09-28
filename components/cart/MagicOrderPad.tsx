"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, PackageX, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/lib/store/cart";
import { parseMagicOrder, type MagicOrderResult } from "@/lib/actions/magicOrder";
import type { AmbiguousItem } from "@/lib/magicOrderResolve";

/**
 * Magic Order — paste a technician's message, get a cart.
 *
 * The component's whole job on the result side is to make the three buckets
 * visibly different. Items we are sure of, items that need a human decision,
 * and items we could not sell are three different states, and flattening them
 * into one list would hide exactly the cases that need attention.
 */

const PANEL =
  "rounded-[20px] border border-slate-900/[.08] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass";

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/** Why an item could not be ordered, in words a buyer can act on. */
const UNRESOLVED_COPY: Record<string, string> = {
  NO_MATCH: "we don't carry this",
  OUT_OF_STOCK: "out of stock right now",
  NO_PRICE: "not currently priced — contact us for a quote",
};

type Parsed = Extract<MagicOrderResult, { ok: true }>;

const ERROR_COPY: Record<string, string> = {
  INVALID_INPUT: "Paste a little more text and try again.",
  NOT_CONFIGURED: "AI parsing isn't configured on this environment yet.",
  UNAVAILABLE: "The parser is unavailable right now. Please try again shortly.",
  NOTHING_FOUND: "We couldn't find any products in that message.",
};

export default function MagicOrderPad() {
  const addItem = useCartStore((s) => s.addItem);

  const [text, setText] = useState("");
  const [result, setResult] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** searchQuery → chosen productId, for the ambiguous bucket. */
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [isParsing, startParsing] = useTransition();

  const parse = () => {
    setError(null);
    startParsing(async () => {
      const res = await parseMagicOrder(text);
      if (!res.ok) {
        setResult(null);
        setError(ERROR_COPY[res.code] ?? ERROR_COPY.UNAVAILABLE);
        return;
      }
      setResult(res);
      // Nothing is pre-selected. A default choice on an ambiguous item is a
      // guess wearing a dropdown — the point of this bucket is that the buyer
      // decides which pack size and price they are agreeing to.
      setChoices({});
    });
  };

  const reset = () => {
    setText("");
    setResult(null);
    setError(null);
    setChoices({});
  };

  const chosenLines = (item: AmbiguousItem) => {
    const id = choices[item.searchQuery];
    return id ? item.options.find((o) => o.productId === id) : undefined;
  };

  const selectedCount =
    (result?.resolvedItems.length ?? 0) +
    (result?.ambiguousItems.filter((i) => choices[i.searchQuery]).length ?? 0);
  /**
   * Ambiguous items the buyer has not chosen a size for.
   *
   * These are deliberately NOT a blocker — someone with three confident items
   * and one they do not want should be able to proceed. But adding silently
   * while one still needs a decision would quietly drop it, so the count is
   * surfaced next to the button.
   */
  const undecided = result?.ambiguousItems.filter((i) => !choices[i.searchQuery]).length ?? 0;

  const addAll = () => {
    if (!result || selectedCount === 0) return;

    let added = 0;
    for (const item of result.resolvedItems) {
      addItem(
        {
          sku: item.sku,
          name: item.name,
          variant: item.variant,
          pricePerKg: item.pricePerKg,
          weightKg: item.weightKg,
          deposit: item.deposit,
        },
        item.quantity
      );
      added += item.quantity;
    }

    for (const item of result.ambiguousItems) {
      const option = chosenLines(item);
      if (!option) continue;
      addItem(
        {
          sku: option.sku,
          name: option.name,
          variant: option.variant,
          pricePerKg: option.pricePerKg,
          weightKg: option.weightKg,
          deposit: option.deposit,
        },
        item.quantity
      );
      added += item.quantity;
    }

    toast.success(`${added} cylinder${added === 1 ? "" : "s"} added to your cart`);
    reset();
  };

  return (
    <section className={`${PANEL} p-4`} data-magic-order>
      {/* One line, not a stacked title + paragraph block: this sits under the
          cart now, where it is a tool rather than the page's headline. */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[8px] border border-blue-700/[.22] bg-blue-700/[.08] text-blue-700 dark:bg-blue-600/[.18] dark:text-blue-400">
          <Sparkles size={12} strokeWidth={2} />
        </span>
        <h2 className="m-0 text-[12.5px] font-semibold tracking-[-.01em]">Magic Order</h2>
        {/* Hidden below sm: at 390px the card is ~324px wide, and after the
            icon and title this truncated to a couple of words — which reads
            as broken rather than terse. The placeholder carries the
            instruction on small screens. */}
        <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-slate-400 sm:inline dark:text-slate-500">
          Paste an engineer&rsquo;s message and we&rsquo;ll turn it into a cart
        </span>
      </div>

      {/* `[field-sizing:content]` grows the box with whatever is pasted, up to
          max-h, so a two-row default does not cost you the multi-line message
          this feature exists to read. Where that property is unsupported the
          rows={2} floor and resize-none still apply and the box scrolls —
          which is why both are kept rather than relying on the one property. */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        disabled={isParsing}
        data-magic-input
        placeholder="e.g. 'Need 5x 134a and two 404s'"
        className="mt-3 max-h-[168px] min-h-[58px] w-full resize-none rounded-[12px] border border-slate-900/[.12] bg-white px-3 py-3 text-sm leading-[1.55] lg:min-h-0 lg:py-2.5 lg:text-[13px] text-slate-900 transition-[border-color,box-shadow] duration-200 [field-sizing:content] placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-[3px] focus:ring-blue-700/[.12] disabled:opacity-60 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
      />

      {/* Right-aligned under the field, with Clear to its left — the primary
          action lands where the eye finishes reading the input. */}
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        {(result || error) && !isParsing ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-900/[.04] lg:min-h-[32px] lg:px-2.5 lg:text-[12px] dark:text-slate-400 dark:hover:bg-white/[.06]"
          >
            <Trash2 size={13} strokeWidth={2} />
            Clear
          </button>
        ) : null}

        {/* 44px is the iOS minimum this app holds to elsewhere (see the
            mobile layouts' h-11 targets). The compact 32px size is gated at
            `lg`, not `md`: the desktop cart layout switches on at 768px, so
            an `md` gate handed a 768px tablet — a touch device — 32px
            targets. Only pointer-width viewports get the small controls. */}
        <button
          type="button"
          onClick={parse}
          disabled={isParsing || text.trim().length < 3}
          data-magic-parse
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-[12px] bg-blue-700 px-4 text-[13.5px] font-semibold tracking-[-.01em] text-white transition-[background-color,transform] duration-200 hover:bg-blue-800 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-[32px] lg:rounded-[10px] lg:px-3 lg:text-[12.5px]"
        >
          {isParsing ? (
            <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          ) : (
            <Sparkles size={13} strokeWidth={2} />
          )}
          {isParsing ? "Reading…" : "Parse with AI"}
        </button>
      </div>

      {error ? (
        <p className="mt-2.5 text-[12px] font-medium text-red-600 dark:text-red-400" data-magic-error>
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 flex flex-col gap-3.5 border-t border-slate-900/[.07] pt-4 dark:border-hairline">
          {/* ── Found ─────────────────────────────────────────────── */}
          {result.resolvedItems.length > 0 ? (
            <div>
              <div className="text-[10.5px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">
                Found · {result.resolvedItems.length}
              </div>
              <ul className="m-0 mt-2.5 list-none divide-y divide-slate-900/[.05] p-0 dark:divide-hairline/60">
                {result.resolvedItems.map((item) => (
                  <li
                    key={item.productId}
                    data-magic-resolved={item.sku}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Check
                        size={14}
                        strokeWidth={2.4}
                        className="flex-none text-emerald-600 dark:text-emerald-400"
                      />
                      <span className="min-w-0 truncate text-[13px]">
                        <span className="font-semibold tracking-[-.015em]">{item.name}</span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {" · "}
                          {item.sku}
                          {item.variant ? ` · ${item.variant}` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-none items-baseline gap-2.5 text-[13px]">
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        ×{item.quantity}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {eur.format(item.unitPrice * item.quantity)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ── Needs a decision ──────────────────────────────────── */}
          {result.ambiguousItems.map((item) => (
            <div
              key={item.searchQuery}
              data-magic-ambiguous={item.searchQuery}
              className="rounded-[14px] border border-amber-600/[.22] bg-amber-500/[.06] p-3.5 dark:border-amber-500/25 dark:bg-amber-500/[.08]"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  size={14}
                  strokeWidth={2.2}
                  className="mt-0.5 flex-none text-amber-600 dark:text-amber-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold tracking-[-.01em]">
                    Multiple sizes found for “{item.searchQuery}” — choose one
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <select
                      value={choices[item.searchQuery] ?? ""}
                      onChange={(e) =>
                        setChoices((prev) => ({ ...prev, [item.searchQuery]: e.target.value }))
                      }
                      data-magic-select={item.searchQuery}
                      aria-label={`Choose a pack size for ${item.searchQuery}`}
                      className="min-h-[36px] flex-1 rounded-[11px] border border-slate-900/[.14] bg-white px-2.5 text-[12.5px] text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-[3px] focus:ring-blue-700/[.12] dark:border-white/[.16] dark:bg-slate-900 dark:text-slate-50"
                    >
                      <option value="">Select a pack size…</option>
                      {item.options.map((o) => (
                        <option key={o.productId} value={o.productId}>
                          {o.name} · {o.variant} — {eur.format(o.unitPrice)} each
                        </option>
                      ))}
                    </select>
                    <span className="flex-none text-[12.5px] tabular-nums text-slate-500 dark:text-slate-400">
                      ×{item.quantity}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* ── Couldn't order ────────────────────────────────────── */}
          {result.unresolvedQueries.length > 0 ? (
            <div className="rounded-[14px] border border-slate-900/[.08] bg-slate-900/[.02] p-3.5 dark:border-hairline dark:bg-white/[.03]">
              <div className="flex items-start gap-2.5">
                <PackageX
                  size={14}
                  strokeWidth={2.2}
                  className="mt-0.5 flex-none text-slate-400 dark:text-slate-500"
                />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold tracking-[-.01em]">
                    We couldn&rsquo;t add {result.unresolvedQueries.length} item
                    {result.unresolvedQueries.length === 1 ? "" : "s"}
                  </div>
                  <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                    {result.unresolvedQueries.map((u) => (
                      <li
                        key={`${u.searchQuery}-${u.reason}`}
                        data-magic-unresolved={u.searchQuery}
                        className="text-[12.5px] text-slate-500 dark:text-slate-400"
                      >
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {u.searchQuery}
                        </span>{" "}
                        ×{u.quantity} — {UNRESOLVED_COPY[u.reason] ?? "unavailable"}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Commit ───────────────────────────────────────────── */}
          {result.resolvedItems.length > 0 || result.ambiguousItems.length > 0 ? (
            <button
              type="button"
              onClick={addAll}
              disabled={selectedCount === 0}
              data-magic-add
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[14px] font-semibold tracking-[-.01em] text-white transition-[background-color,transform] duration-200 hover:bg-blue-800 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectedCount === 0
                ? "Choose a pack size to continue"
                : `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"} to cart`}
            </button>
          ) : null}

          {selectedCount > 0 && undecided > 0 ? (
            <p className="-mt-2 text-center text-[11.5px] text-amber-700 dark:text-amber-400" data-magic-undecided>
              {undecided} item{undecided === 1 ? "" : "s"} still need
              {undecided === 1 ? "s" : ""} a pack size and won&rsquo;t be added.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
