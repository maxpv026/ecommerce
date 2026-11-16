"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Check, Loader2, PackageX, ShieldCheck, Square } from "lucide-react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { usePackLabel } from "@/lib/hooks/usePackLabel";
import { useCartStore } from "@/lib/store/cart";

/**
 * The F-Gas RAG assistant.
 *
 * Talks to /api/chat-fgas, which answers strictly from the vectorised
 * knowledge base. The component's real job is the tool rendering: when the
 * model calls `suggestProduct`, the ROUTE resolves that designation against
 * the live catalogue, and this file renders the resolved row — never anything
 * the model wrote. The model contributes prose and a `reason` string; every
 * SKU, price and availability claim on screen came out of Postgres.
 *
 * That split is why the card keys off `output.available` and not off the
 * presence of a product name: a recommendation the model is confident about
 * and a product we can actually sell are different things, and the whole
 * point of the route's three-shape tool output is to keep them different
 * here too.
 */

const PANEL =
  "rounded-[20px] border border-slate-900/[.08] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass";

/**
 * The model writes markdown — verified, it emits `**R-449A**` unprompted — and
 * rendering it as plain text puts literal asterisks on screen.
 *
 * Lazy, exactly as components/AIChatWidget.tsx does it, so the parser stays
 * out of the initial bundle. Nothing else may be imported from react-markdown
 * anywhere in this module: a static import of any other export would pull the
 * whole package back into the main chunk and silently undo this.
 */
const Markdown = dynamic(() => import("react-markdown"), { ssr: false });

/** Tight prose: the bubble supplies the rhythm, markdown just supplies emphasis. */
const PROSE =
  "[&_p]:m-0 [&_p+p]:mt-2.5 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_code]:rounded [&_code]:bg-ink/[.06] [&_code]:px-1 [&_code]:py-px [&_code]:text-[12px] dark:[&_code]:bg-white/10";

const STARTER_KEYS = ["starter1", "starter2", "starter3"] as const;

/**
 * The purchasable branch of the tool's output.
 *
 * Mirrors what app/api/chat-fgas/route.ts returns — the full pricing shape,
 * because a cart line is keyed by sku and needs pricePerKg/weightKg/deposit.
 * A card that could only show `unitPrice` would be able to display the
 * suggestion but not act on it.
 */
interface AvailableSuggestion {
  available: true;
  productId: string;
  sku: string;
  name: string;
  variant: string;
  unitPrice: number;
  pricePerKg: number;
  weightKg: number;
  deposit: number;
  reason?: string;
}

interface UnavailableSuggestion {
  available: false;
  sku: string;
  name: string;
  reason?: string;
}

type Suggestion = AvailableSuggestion | UnavailableSuggestion;

/**
 * Narrow the tool output at runtime.
 *
 * This payload crossed the network, so its compile-time type is a promise
 * rather than a fact. Checking the fields we are about to render — and the
 * numbers we are about to put in a cart line — means a malformed or
 * half-streamed result renders nothing instead of `€NaN` or a line with an
 * undefined deposit.
 */
function asSuggestion(output: unknown): Suggestion | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  // `found: false` — the designation is not in the catalogue at all. The
  // model has been told to say so in prose; there is no card for it, because
  // there is no product to show.
  if (o.found === false) return null;

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const sku = str(o.sku);
  const name = str(o.name);
  if (!sku || !name) return null;

  const reason = str(o.reason) ?? undefined;

  if (o.available !== true) {
    return { available: false, sku, name, reason };
  }

  const productId = str(o.productId);
  const variant = str(o.variant);
  const unitPrice = num(o.unitPrice);
  const pricePerKg = num(o.pricePerKg);
  const weightKg = num(o.weightKg);
  const deposit = num(o.deposit);

  // Anything missing here would produce a broken cart line, so degrade to the
  // unavailable card rather than offering a button that adds bad data.
  if (
    productId === null ||
    variant === null ||
    unitPrice === null ||
    pricePerKg === null ||
    weightKg === null ||
    deposit === null
  ) {
    return { available: false, sku, name, reason };
  }

  return {
    available: true,
    productId,
    sku,
    name,
    variant,
    unitPrice,
    pricePerKg,
    weightKg,
    deposit,
    reason,
  };
}

/* ── Product suggestion card ─────────────────────────────────────────── */

function AvailableCard({ item }: { item: AvailableSuggestion }) {
  const t = useTranslations("FgasAssistant");
  const format = useFormatter();
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  // On screen, the pack in the reader's language; the cart line keeps the catalog's `variant`.
  const pack = usePackLabel()(item.weightKg, undefined, true);
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);

  // addItem is a synchronous Zustand write, so there is no pending phase to
  // show. The confirmation below is real state; a spinner here would be
  // decoration pretending to be work.
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2200);
    return () => clearTimeout(t);
  }, [added]);

  const add = () => {
    addItem(
      {
        sku: item.sku,
        name: item.name,
        variant: item.variant,
        pricePerKg: item.pricePerKg,
        weightKg: item.weightKg,
        deposit: item.deposit,
      },
      1
    );
    setAdded(true);
    toast.success(t("addedToast", { name: item.name }));
  };

  return (
    <div className="mt-3 max-w-md overflow-hidden rounded-2xl border border-blue-700/20 bg-white dark:border-blue-400/25 dark:bg-surface-2">
      <div className="flex items-center gap-2 border-b border-blue-700/10 bg-blue-700/[.04] px-4 py-2 dark:border-blue-400/15 dark:bg-blue-400/[.06]">
        <ShieldCheck className="size-3.5 text-blue-700 dark:text-blue-400" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-blue-700 dark:text-blue-400">
          {t("inStock")}
        </span>
      </div>

      <div className="px-4 py-3.5">
        <p className="text-[15px] font-medium leading-tight text-ink">{item.name}</p>
        <p className="mt-0.5 text-[13px] text-ink-muted">{pack}</p>

        {item.reason ? (
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">{item.reason}</p>
        ) : null}

        <div className="mt-3.5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[19px] font-medium tabular-nums leading-none text-ink">
              {eur(item.unitPrice)}
            </p>
            {/* Named explicitly: the deposit is refundable and is charged on
                top, so showing only the gas price would understate the line. */}
            <p className="mt-1 text-[11px] text-ink-muted">
              {t("deposit", { amount: eur(item.deposit) })}
            </p>
          </div>

          <button
            type="button"
            onClick={add}
            aria-label={t("addAria", { name: item.name, pack })}
            className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
              added
                ? "bg-blue-700/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-400"
                : // `--invert` is the inverted SURFACE (same value as --ink);
                  // the text that sits on it is `--invert-ink`. Pairing
                  // bg-ink with text-invert renders dark-on-dark.
                  "bg-ink text-invert-ink hover:opacity-90"
            }`}
          >
            {added ? (
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5" aria-hidden />
                {t("added")}
              </span>
            ) : (
              t("addToCart")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnavailableCard({ item }: { item: UnavailableSuggestion }) {
  const t = useTranslations("FgasAssistant");
  return (
    <div className="mt-3 max-w-md rounded-2xl border border-hairline bg-surface-2/60 px-4 py-3.5 dark:bg-surface-2/40">
      <div className="flex items-start gap-2.5">
        <PackageX className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0">
          <p className="text-[14px] font-medium leading-tight text-ink">{item.name}</p>
          {/* No price, and no button. The route deliberately returns neither
              for this branch, so there is nothing here to mistake for an
              offer. */}
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            {t("unavailable")}
          </p>
          {item.reason ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted/80">{item.reason}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Message ─────────────────────────────────────────────────────────── */

type ChatMessage = ReturnType<typeof useChat>["messages"][number];

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  // In ai@6 tool calls arrive as typed message PARTS (`tool-<name>`), not on a
  // `toolInvocations` array, and the terminal state is `output-available`.
  const suggestions = message.parts.flatMap((p) =>
    p.type === "tool-suggestProduct" && p.state === "output-available"
      ? [asSuggestion(p.output)].filter((s): s is Suggestion => s !== null)
      : []
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[14px] leading-relaxed text-ink dark:bg-surface-3">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      {text ? (
        <div className={`max-w-[90%] text-pretty text-[14px] leading-relaxed text-ink ${PROSE}`}>
          <Markdown>{text}</Markdown>
        </div>
      ) : null}

      {suggestions.map((s, i) =>
        s.available ? (
          <AvailableCard key={`${s.sku}-${i}`} item={s} />
        ) : (
          <UnavailableCard key={`${s.sku}-${i}`} item={s} />
        )
      )}
    </div>
  );
}

/* ── Assistant ───────────────────────────────────────────────────────── */

interface RagAssistantProps {
  /**
   * Render as the body of a host panel (AIChatWidget's F-Gas tab) rather than
   * as a standalone card: the host already supplies the glass chrome, the
   * header and the height, so drop all three and just fill the space.
   */
  embedded?: boolean;
}

export default function RagAssistant({ embedded = false }: RagAssistantProps) {
  const t = useTranslations("FgasAssistant");
  // Built once. A transport recreated on every render would re-key the chat
  // mid-conversation.
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat-fgas" }),
    []
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  // ai@6's useChat no longer owns the input — `input`/`handleInputChange`/
  // `handleSubmit` were removed, so the field is plain local state.
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const submit = (value: string) => {
    const text = value.trim();
    if (!text || busy) return;
    setInput("");
    sendMessage({ text });
  };

  return (
    <section
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : `${PANEL} flex h-[600px] max-h-[80vh] flex-col overflow-hidden`
      }
    >
      {embedded ? null : (
        <header className="shrink-0 border-b border-hairline px-5 py-3.5">
          <h2 className="text-[14px] font-medium tracking-tight text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("subtitle")}</p>
        </header>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.length === 0 ? (
          <div className="pt-1">
            <p className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3.5 text-[13px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {t("intro")}
            </p>
            {/* Starters wrap; never clipped at the panel edge. */}
            <div className="mt-4 flex flex-wrap gap-2" data-fgas-starters>
              {STARTER_KEYS.map((key) => t(key)).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[12px] font-medium leading-[1.35] text-slate-700 transition-colors hover:border-blue-600/40 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageRow key={m.id} message={m} />)
        )}

        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("searching")}
          </div>
        ) : null}

        {error ? (
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {t("error")}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="shrink-0 border-t border-slate-200/80 bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:pb-3 dark:border-slate-800/80 dark:bg-slate-950"
      >
        {/* Same composer as the support tab: pr-14 keeps the placeholder clear of the button. */}
        <div className="relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("inputAria")}
            data-fgas-input
            className="h-12 w-full truncate rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-14 text-[14px] text-slate-900 transition-[border-color,box-shadow] placeholder:text-slate-500 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-blue-400"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label={t("stop")}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-200/70 text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Square className="size-3.5 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label={t("send")}
              className={`absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl transition-[background-color,transform,color] duration-150 disabled:cursor-not-allowed ${
                input.trim()
                  ? "bg-blue-700 text-white shadow-[0_8px_18px_-8px_rgba(29,78,216,.8)] hover:bg-blue-800 active:scale-95"
                  : "bg-slate-200/70 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }`}
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
