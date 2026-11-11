"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileText, Loader2, Minus, PackageX, Paperclip, Plus, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import { useSmartOrderUi } from "@/lib/smartOrderEvents";
import { formatKg } from "@/lib/pricing";
import type { LinePick, LineStatus, SolvedLine } from "@/lib/smartOrder/solver";

/**
 * Bulk Order Import — paste or attach a specification, review the ledger, add.
 *
 * The server (POST /api/smart-order) returns solved lines: real products,
 * database prices, a status per line. This component never computes what to
 * buy; it only lets the buyer accept, trim or untick what the solver chose,
 * and recomputes totals from the prices it was handed. Those prices are
 * display snapshots — checkout re-reads every one of them.
 */

const MAX_CHARS = 10_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPT = ".csv,.txt,.tsv,.xlsx,.pdf";
const EASE = [0.16, 1, 0.3, 1] as const;

type ErrorCode =
  | "INVALID_INPUT"
  | "TEXT_TOO_LONG"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "FILE_UNREADABLE"
  | "NOTHING_FOUND"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE"
  | "RATE_LIMITED";

interface EditLine {
  line: SolvedLine;
  included: boolean;
  qty: Record<string, number>;
  edited: boolean;
}

// Semantic only — green: as asked, blue: more than asked, amber: needs a look,
// red: cannot supply, grey: not ours. No decorative hues.
const BADGE: Record<LineStatus | "ADJUSTED", string> = {
  EXACT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  BUFFER: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20",
  SUBSTITUTED: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  SIZE_ASSUMED: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  PARTIAL: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  OUT_OF_STOCK: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20",
  NOT_CARRIED: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-white/[.06] dark:text-zinc-300 dark:ring-white/10",
  UNRECOGNIZED: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-white/[.06] dark:text-zinc-300 dark:ring-white/10",
  NEEDS_REVIEW: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  ADJUSTED: "bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-white/[.06] dark:text-zinc-200 dark:ring-white/15",
};
/** A grade substitution outranks every other badge: it changes what the gas legally is. */
const GRADE_BADGE = "bg-orange-50 text-orange-800 ring-orange-600/30 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/25";

const FORMATS = "CSV · XLSX · PDF · TXT";
const PRIMARY_BTN =
  "inline-flex h-10 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-offset-[#0A0D12]";

const round2 = (n: number) => Math.round(n * 100) / 100;

function totals(e: EditLine) {
  const picks = e.line.picks;
  const weight = round2(picks.reduce((n, p) => n + p.weightKg * (e.qty[p.productId] ?? 0), 0));
  const gas = round2(picks.reduce((n, p) => n + p.unitPrice * (e.qty[p.productId] ?? 0), 0));
  const deposits = round2(picks.reduce((n, p) => n + p.deposit * (e.qty[p.productId] ?? 0), 0));
  const units = picks.reduce((n, p) => n + (e.qty[p.productId] ?? 0), 0);
  return { weight, gas, deposits, units, total: round2(gas + deposits) };
}

export default function SmartBulkOrderModal() {
  const t = useTranslations("SmartOrder");
  const format = useFormatter();
  const router = useRouter();
  const open = useSmartOrderUi((s) => s.open);
  const source = useSmartOrderUi((s) => s.source);
  const hide = useSmartOrderUi((s) => s.hide);
  const addItems = useCartStore((s) => s.addItems);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [lines, setLines] = useState<EditLine[] | null>(null);
  const [removedLines, setRemovedLines] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const eur = (v: number) => format.number(v, { style: "currency", currency: "EUR" });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, hide]);

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > MAX_FILE_BYTES) {
      setError("FILE_TOO_LARGE");
      return;
    }
    if (!/\.(csv|txt|tsv|xlsx|pdf)$/i.test(f.name)) {
      setError("UNSUPPORTED_FILE");
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (busy) return;
    if (!file && text.trim().length < 3) {
      setError("INVALID_INPUT");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.set("file", file);
        if (text.trim()) form.set("text", text);
        res = await fetch("/api/smart-order", { method: "POST", body: form });
      } else {
        res = await fetch("/api/smart-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      }
      if (res.status === 429) {
        setError("RATE_LIMITED");
        return;
      }
      const body = (await res.json().catch(() => null)) as { ok: true; lines: SolvedLine[]; removedLines: number } | { ok: false; code: ErrorCode } | null;
      if (!body || !body.ok) {
        setError(body && !body.ok ? body.code : "UNAVAILABLE");
        return;
      }
      setRemovedLines(body.removedLines);
      setLines(
        body.lines.map((line) => ({
          line,
          included: line.selected,
          edited: false,
          qty: Object.fromEntries(line.picks.map((p) => [p.productId, p.quantity])),
        }))
      );
    } catch {
      setError("UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  };

  const setQty = (lineId: string, pick: LinePick, next: number) =>
    setLines((prev) =>
      prev!.map((e) => {
        if (e.line.id !== lineId) return e;
        const qty = { ...e.qty, [pick.productId]: Math.max(0, Math.min(pick.maxQuantity, next)) };
        const any = Object.values(qty).some((q) => q > 0);
        return { ...e, qty, edited: true, included: any ? e.included || next > (e.qty[pick.productId] ?? 0) : false };
      })
    );

  const toggle = (lineId: string) =>
    setLines((prev) => prev!.map((e) => (e.line.id === lineId ? { ...e, included: !e.included } : e)));

  const chosen = useMemo(() => (lines ?? []).filter((e) => e.included && totals(e).units > 0), [lines]);
  const summary = useMemo(
    () =>
      chosen.reduce(
        (acc, e) => {
          const s = totals(e);
          return { gas: acc.gas + s.gas, deposits: acc.deposits + s.deposits, units: acc.units + s.units };
        },
        { gas: 0, deposits: 0, units: 0 }
      ),
    [chosen]
  );

  const addToCart = () => {
    const entries = chosen.flatMap((e) =>
      e.line.picks
        .filter((p) => (e.qty[p.productId] ?? 0) > 0)
        .map((p) => ({
          line: { sku: p.sku, name: p.name, variant: p.variant, pricePerKg: p.pricePerKg, weightKg: p.weightKg, deposit: p.deposit },
          qty: e.qty[p.productId]!,
        }))
    );
    if (entries.length === 0) return;
    addItems(entries); // one state update for the whole batch
    const count = entries.reduce((n, x) => n + x.qty, 0);
    toast.success(t("addedToast", { count }), source !== "cart" ? { action: { label: t("viewCart"), onClick: () => router.push("/cart") } } : undefined);
    setLines(null);
    setText("");
    setFile(null);
    hide();
  };

  const requestedLabel = (l: SolvedLine) => {
    const r = l.request;
    const base = l.refrigerantLabel ?? r.refrigerantCode ?? t("unknownGas");
    const gas = r.grade === "RECLAIMED" ? t("gasReclaimed", { gas: base }) : base;
    if (r.kind === "OTHER") return t("requestedProduct", { count: r.cylinderCount ?? 1, product: r.productQuery ?? "—" });
    if (r.requestMode === "BY_TOTAL_WEIGHT_KG" && r.targetWeightKg) return t("requestedWeight", { weight: formatKg(r.targetWeightKg), gas });
    if (r.cylinderCount && r.preferredCylinderSizeKg) return t("requestedCount", { count: r.cylinderCount, size: formatKg(r.preferredCylinderSizeKg), gas });
    if (r.cylinderCount) return t("requestedCountNoSize", { count: r.cylinderCount, gas });
    return gas;
  };

  const gradeKey = (l: SolvedLine) => (l.grade === "RECLAIMED" ? "GRADE_RECLAIMED_FOR_VIRGIN" : "GRADE_VIRGIN_FOR_RECLAIMED") as "GRADE_RECLAIMED_FOR_VIRGIN" | "GRADE_VIRGIN_FOR_RECLAIMED";

  const statusText = (e: EditLine) => {
    if (e.line.gradeSubstituted) return t(`status_${gradeKey(e.line)}`);
    if (e.edited) return t("status_ADJUSTED");
    if (e.line.status === "BUFFER") return t("status_BUFFER", { kg: formatKg(e.line.excessKg) });
    return t(`status_${e.line.status}`);
  };

  // Review summary: lines matched, net kg, cylinders and t CO₂e of what is ticked.
  const reviewStats = useMemo(() => {
    const all = lines ?? [];
    const matched = all.filter((e) => e.line.picks.length > 0).length;
    let kg = 0;
    let co2eKg = 0;
    for (const e of chosen) {
      for (const p of e.line.picks) {
        const q = e.qty[p.productId] ?? 0;
        kg += p.weightKg * q;
        if (p.gwp) co2eKg += p.weightKg * q * p.gwp;
      }
    }
    return { matched, total: all.length, kg: round2(kg), co2eT: co2eKg / 1000 };
  }, [lines, chosen]);

  const onDragOver = (e: DragEvent) => {
    if (busy || !Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    // Leaving into a child (the textarea, the toolbar) is not leaving the box.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (busy) return;
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const MUTED = "text-slate-500 dark:text-zinc-400";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="smart-order"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={hide}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.18 } }}
            transition={{ duration: 0.35, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-order-title"
            data-smart-order-modal
            data-smart-view={lines ? "review" : busy ? "parsing" : "input"}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl dark:border-white/[0.08] dark:bg-[#0A0D12] dark:shadow-2xl dark:shadow-black/60"
          >
            {/* ── Header ── */}
            <div className="flex flex-none items-start gap-4 border-b border-slate-200 px-5 py-4 sm:px-6 dark:border-white/[0.08]">
              <div className="min-w-0 flex-1">
                {lines && (
                  <button
                    type="button"
                    onClick={() => setLines(null)}
                    data-smart-back
                    className="-ml-0.5 mb-1.5 inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    <ArrowLeft size={13} strokeWidth={2} />
                    {t("back")}
                  </button>
                )}
                <h2 id="smart-order-title" className="m-0 text-[17px] font-semibold leading-snug tracking-[-.02em] text-slate-900 dark:text-white">
                  {lines ? t("reviewTitle") : t("importTitle")}
                </h2>
                <p className={`m-0 mt-0.5 text-[13px] leading-normal ${MUTED}`}>{lines ? t("reviewSubtitle") : t("importSubtitle")}</p>
              </div>
              <button
                type="button"
                onClick={hide}
                aria-label={t("close")}
                data-smart-close
                className="-mr-1.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                <X size={17} strokeWidth={2} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {!lines ? (
                <div className="flex flex-col gap-3">
                  {/* One specification box: type, paste, or drop a file anywhere on it. */}
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    data-smart-composer
                    data-smart-dropzone
                    data-dragging={dragging ? "1" : undefined}
                    className={`relative overflow-hidden rounded-xl border bg-slate-50/50 transition-colors focus-within:border-slate-400 dark:bg-white/[0.02] dark:focus-within:border-white/25 ${
                      dragging ? "border-slate-900 dark:border-white/40" : "border-slate-200 dark:border-white/10"
                    }`}
                  >
                    <label className="block">
                      <span className="sr-only">{t("inputLabel")}</span>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                        rows={6}
                        disabled={busy}
                        data-smart-input
                        placeholder={t("placeholder")}
                        className="block min-h-[150px] w-full resize-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                      />
                    </label>

                    {dragging && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-1.5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-400 bg-white/90 font-mono text-xs text-slate-700 dark:border-white/30 dark:bg-[#0A0D12]/90 dark:text-zinc-200"
                      >
                        <Paperclip size={14} strokeWidth={2} />
                        {t("dropToAttach")}
                      </div>
                    )}

                    {busy && (
                      <div className="relative h-px overflow-hidden bg-slate-200 dark:bg-white/10" aria-hidden data-smart-progress>
                        <span className="absolute inset-y-0 w-1/3 animate-[smart-progress_1.1s_ease-in-out_infinite] bg-slate-900 dark:bg-white" />
                      </div>
                    )}

                    {/* Toolbar: attachment on the left, counter on the right. */}
                    <div className="flex items-center gap-3 border-t border-slate-200/80 bg-white px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.01]">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        {file ? (
                          <span
                            data-smart-file-chip
                            title={file.name}
                            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 dark:border-white/10 dark:bg-white/[0.04]"
                          >
                            <FileText size={13} strokeWidth={2} className="flex-none text-slate-500 dark:text-zinc-400" />
                            <span className="min-w-0 truncate font-mono text-xs text-slate-800 dark:text-zinc-100">{file.name}</span>
                            <span className="flex-none font-mono text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                              {format.number(Math.max(1, file.size / 1024), { maximumFractionDigits: 0 })} KB
                            </span>
                            <button
                              type="button"
                              onClick={() => setFile(null)}
                              disabled={busy}
                              aria-label={t("removeFile")}
                              data-smart-file-remove
                              className="flex h-5 w-5 flex-none items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-800 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              <X size={12} strokeWidth={2.4} />
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => fileInput.current?.click()}
                              disabled={busy}
                              data-smart-attach
                              className="inline-flex h-7 flex-none items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-[0_1px_0_rgba(15,23,42,.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:shadow-none dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
                            >
                              <Paperclip size={13} strokeWidth={2} />
                              {t("attachFile")}
                            </button>
                            <span className="flex flex-wrap gap-x-1 font-mono text-[11px] text-slate-400 dark:text-zinc-500" data-smart-formats>
                              <span className="whitespace-nowrap">{FORMATS}</span>
                              <span className="whitespace-nowrap">· {t("maxSize")}</span>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-none items-center gap-2.5">
                        <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-zinc-500" data-smart-count>
                          {t("charCount", { count: format.number(text.length), max: format.number(MAX_CHARS) })}
                        </span>
                        {text && !busy && (
                          <button
                            type="button"
                            onClick={() => setText("")}
                            data-smart-clear
                            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline dark:text-zinc-400 dark:hover:text-white"
                          >
                            {t("clearText")}
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ACCEPT}
                      data-smart-file
                      className="hidden"
                      onChange={(e) => {
                        pickFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {/* Samples — full text, they wrap rather than clip. */}
                  <div className="flex flex-wrap items-center gap-2" data-smart-examples>
                    <span className={`text-xs ${MUTED}`}>{t("sampleLabel")}</span>
                    {(["example1", "example2"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setText(t(k))}
                        disabled={busy}
                        data-smart-example={k}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-left font-mono text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        {t(k)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Totals of what is ticked */}
                  <dl
                    className="m-0 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-4 dark:border-white/10 [&>div]:border-slate-200 dark:[&>div]:border-white/[0.08]"
                    data-smart-stats
                  >
                    {[
                      { label: t("statLines"), value: t("statLinesValue", { matched: reviewStats.matched, total: reviewStats.total }) },
                      { label: t("statNet"), value: `${format.number(reviewStats.kg, { maximumFractionDigits: 2 })} kg` },
                      { label: t("statCylinders"), value: format.number(summary.units) },
                      { label: "CO₂e", value: `${format.number(reviewStats.co2eT, { maximumFractionDigits: 2 })} t` },
                    ].map((stat, i) => (
                      <div
                        key={stat.label}
                        className={`px-3.5 py-2.5 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}
                      >
                        <dt className={`text-[11px] ${MUTED}`}>{stat.label}</dt>
                        <dd className="m-0 mt-0.5 font-mono text-[15px] font-medium tabular-nums text-slate-900 dark:text-white">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {removedLines > 0 && (
                    <p className="m-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/[.06] dark:text-amber-300" data-smart-removed>
                      <AlertTriangle size={14} strokeWidth={2.2} className="mt-0.5 flex-none" />
                      {t("removedLines", { count: removedLines })}
                    </p>
                  )}

                  {/* Ledger: one row per requested line */}
                  <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/[0.08] dark:border-white/10" data-smart-ledger>
                    {lines.map((e) => {
                      const s = totals(e);
                      const l = e.line;
                      const solvable = l.picks.length > 0;
                      return (
                        <div
                          key={l.id}
                          data-smart-line={l.id}
                          data-status={l.status}
                          data-included={e.included ? "1" : "0"}
                          className={`px-4 py-3.5 transition-colors ${e.included ? "bg-white dark:bg-transparent" : "bg-slate-50/70 dark:bg-white/[0.015]"}`}
                        >
                          {/* Requested · status · line total */}
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={e.included}
                              aria-label={t("toggleLine")}
                              disabled={!solvable}
                              onClick={() => toggle(l.id)}
                              data-smart-toggle={l.id}
                              className={`mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                e.included
                                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                                  : "border-slate-300 bg-white dark:border-white/25 dark:bg-transparent"
                              }`}
                            >
                              {e.included && <Check size={12} strokeWidth={3} />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className={`text-[13.5px] font-medium ${e.included ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-zinc-400"}`}>{requestedLabel(l)}</span>
                                <span
                                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${l.gradeSubstituted ? GRADE_BADGE : BADGE[e.edited ? "ADJUSTED" : l.status]}`}
                                  data-smart-badge
                                  data-grade-substituted={l.gradeSubstituted ? "1" : undefined}
                                >
                                  {statusText(e)}
                                </span>
                              </div>
                              {l.request.rawText && (
                                <div className="mt-0.5 break-words font-mono text-[11.5px] text-slate-400 dark:text-zinc-500" data-smart-raw>
                                  “{l.request.rawText}”
                                </div>
                              )}
                            </div>
                            {solvable && (
                              <div className="flex-none text-right">
                                <div className={`font-mono text-[14px] font-medium tabular-nums ${e.included ? "text-slate-900 dark:text-white" : "text-slate-400 line-through dark:text-zinc-500"}`} data-smart-line-total>
                                  {eur(s.total)}
                                </div>
                                {s.deposits > 0 && (
                                  <div className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                                    {eur(s.gas)} + {eur(s.deposits)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* What the solver chose */}
                          <div className="pl-[30px] pt-2.5">
                            {solvable ? (
                              <>
                                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                  {l.picks.map((p) => {
                                    const q = e.qty[p.productId] ?? 0;
                                    return (
                                      <li key={p.productId} data-smart-pick={p.sku} data-qty={q} className="flex items-center gap-3">
                                        <div className="flex h-8 flex-none items-center rounded-md border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
                                          <button
                                            type="button"
                                            onClick={() => setQty(l.id, p, q - 1)}
                                            disabled={q <= 0}
                                            aria-label={t("decrease")}
                                            data-smart-dec={p.sku}
                                            className="flex h-full w-8 items-center justify-center rounded-l-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                                          >
                                            <Minus size={12} strokeWidth={2.4} />
                                          </button>
                                          <span className="w-7 border-x border-slate-200 text-center font-mono text-[13px] font-medium leading-[30px] tabular-nums text-slate-900 dark:border-white/10 dark:text-white">
                                            {q}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setQty(l.id, p, q + 1)}
                                            disabled={q >= p.maxQuantity}
                                            aria-label={t("increase")}
                                            data-smart-inc={p.sku}
                                            className="flex h-full w-8 items-center justify-center rounded-r-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                                          >
                                            <Plus size={12} strokeWidth={2.4} />
                                          </button>
                                        </div>
                                        <div className="min-w-0 flex-1 leading-[1.45]">
                                          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                                            <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                                            <span className="font-mono text-[12px] tabular-nums text-slate-500 dark:text-zinc-400">{formatKg(p.weightKg)}</span>
                                            <span className="font-mono text-[11px] text-slate-400 dark:text-zinc-500" data-smart-sku>
                                              {p.sku}
                                            </span>
                                            {p.grade === "RECLAIMED" && (
                                              <span className="rounded-md bg-orange-50 px-1.5 py-[1px] text-[10.5px] font-medium text-orange-800 ring-1 ring-inset ring-orange-600/25 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/25" data-smart-grade="RECLAIMED">
                                                {t("gradeReclaimed")}
                                              </span>
                                            )}
                                          </div>
                                          <div className="font-mono text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400">
                                            {p.pricePerKg > 0 && p.weightKg !== 1 ? `${t("perKg", { price: eur(p.pricePerKg) })} · ` : ""}
                                            {t("each", { price: eur(p.unitPrice) })}
                                            {p.deposit > 0 ? ` ${t("depositEach", { price: eur(p.deposit) })}` : ""}
                                          </div>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                                <div className="mt-2 font-mono text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400" data-smart-delivered>
                                  {l.request.kind === "REFRIGERANT" && l.request.requestMode === "BY_TOTAL_WEIGHT_KG" && l.request.targetWeightKg
                                    ? t("delivered", { delivered: formatKg(s.weight), requested: formatKg(l.request.targetWeightKg) })
                                    : t("deliveredTotal", { delivered: formatKg(s.weight) })}
                                </div>
                              </>
                            ) : (
                              <div className={`flex items-start gap-2 text-[12.5px] ${MUTED}`}>
                                <PackageX size={14} strokeWidth={2} className="mt-0.5 flex-none" />
                                <span>
                                  {l.status === "OUT_OF_STOCK"
                                    ? t("outOfStockHint")
                                    : l.status === "NOT_CARRIED"
                                      ? t("notCarriedHint", { gas: l.refrigerantLabel ?? l.request.productQuery ?? "—" })
                                      : l.note
                                        ? t(`note_${l.note}`)
                                        : t("unrecognizedHint")}
                                </span>
                              </div>
                            )}
                            {l.gradeSubstituted && (
                              <p className="m-0 mt-2 flex items-start gap-1.5 text-[12px] font-medium text-orange-800 dark:text-orange-300" data-smart-grade-note>
                                <AlertTriangle size={13} strokeWidth={2.2} className="mt-0.5 flex-none" />
                                {t(`note_${gradeKey(l)}`, { gas: l.refrigerantLabel ?? "" })}
                              </p>
                            )}
                            {solvable && l.note && <p className="m-0 mt-2 text-[12px] text-amber-700 dark:text-amber-300">{t(`note_${l.note}`)}</p>}
                            {l.shortfallKg > 0 && <p className="m-0 mt-2 text-[12px] text-amber-700 dark:text-amber-300">{t("shortfallKg", { kg: formatKg(l.shortfallKg) })}</p>}
                            {l.shortfallCount > 0 && <p className="m-0 mt-2 text-[12px] text-amber-700 dark:text-amber-300">{t("shortfallCount", { count: l.shortfallCount })}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <p className="m-0 mt-4 flex items-start gap-2 text-[12.5px] font-medium text-red-600 dark:text-red-400" data-smart-error={error}>
                  <AlertTriangle size={14} strokeWidth={2.2} className="mt-0.5 flex-none" />
                  {t(`error_${error}`)}
                </p>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex flex-none flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-white/[0.08] dark:bg-[#0A0D12]">
              {lines ? (
                <>
                  <div className={`text-[11.5px] leading-[1.5] ${MUTED}`} data-smart-summary>
                    <div className="text-[14px] font-medium text-slate-900 dark:text-white">
                      {t("summaryTotal")}{" "}
                      <span className="font-mono font-semibold tabular-nums" data-smart-grand-total>
                        {eur(summary.gas + summary.deposits)}
                      </span>{" "}
                      <span className="text-[11px] font-normal text-slate-400 dark:text-zinc-500">{t("exVat")}</span>
                    </div>
                    <div>
                      {t("summaryGas")} <span className="font-mono tabular-nums text-slate-700 dark:text-zinc-200">{eur(summary.gas)}</span> · {t("summaryDepositsShort")}{" "}
                      <span className="font-mono tabular-nums text-slate-700 dark:text-zinc-200">{eur(summary.deposits)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={addToCart} disabled={summary.units === 0} data-smart-add className={PRIMARY_BTN}>
                    {summary.units === 0 ? t("addCtaNone") : t("addCtaCylinders", { count: summary.units })}
                    {summary.units > 0 && <ArrowRight size={15} strokeWidth={2} />}
                  </button>
                </>
              ) : (
                <>
                  <span className={`flex items-center gap-2 text-xs ${MUTED}`} data-smart-stock-note>
                    <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-emerald-500" />
                    {t("stockNote")}
                  </span>
                  <button type="button" onClick={submit} disabled={busy || (!file && text.trim().length < 3)} data-smart-submit className={PRIMARY_BTN}>
                    {busy && <Loader2 size={15} className="animate-spin" />}
                    {busy ? t("submitting") : t("submitCheck")}
                    {!busy && <ArrowRight size={15} strokeWidth={2} />}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
