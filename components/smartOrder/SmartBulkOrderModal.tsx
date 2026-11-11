"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, FileText, Loader2, Minus, PackageX, Plus, Sparkles, Upload, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import { useSmartOrderUi } from "@/lib/smartOrderEvents";
import { formatKg } from "@/lib/pricing";
import type { LinePick, LineStatus, SolvedLine } from "@/lib/smartOrder/solver";

/**
 * Smart Bulk Order — paste or upload, review, add.
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

const BADGE: Record<LineStatus | "ADJUSTED", string> = {
  EXACT: "bg-emerald-500/12 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300",
  BUFFER: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300",
  SUBSTITUTED: "bg-amber-500/12 text-amber-800 ring-amber-600/25 dark:text-amber-300",
  SIZE_ASSUMED: "bg-amber-500/12 text-amber-800 ring-amber-600/25 dark:text-amber-300",
  PARTIAL: "bg-amber-500/12 text-amber-800 ring-amber-600/25 dark:text-amber-300",
  OUT_OF_STOCK: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300",
  NOT_CARRIED: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300",
  UNRECOGNIZED: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300",
  NEEDS_REVIEW: "bg-amber-500/12 text-amber-800 ring-amber-600/25 dark:text-amber-300",
  ADJUSTED: "bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-300",
};
/** A grade substitution outranks every other badge: it changes what the gas legally is. */
const GRADE_BADGE = "bg-orange-500/15 text-orange-800 ring-orange-600/30 dark:text-orange-300";

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="smart-order"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed inset-0 z-[110] flex items-end justify-center bg-[#090A0C]/70 backdrop-blur-md sm:items-center sm:p-4"
          onClick={hide}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-order-title"
            data-smart-order-modal
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-white/[.97] shadow-[0_40px_120px_-30px_rgba(4,10,25,.75)] backdrop-blur-2xl sm:max-h-[90vh] sm:w-[920px] sm:max-w-full sm:rounded-[26px] dark:bg-[#141518]/[.97]"
          >
            {/* Header */}
            <div className="flex flex-none items-start gap-3 border-b border-slate-900/[.07] px-5 pb-4 pt-5 sm:px-7 dark:border-hairline">
              {lines ? (
                <button
                  type="button"
                  onClick={() => setLines(null)}
                  data-smart-back
                  aria-label={t("back")}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-slate-900/5 text-slate-700 transition-colors hover:bg-slate-900/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <ArrowLeft size={17} strokeWidth={2} />
                </button>
              ) : (
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,.8)]">
                  <Sparkles size={17} strokeWidth={2} />
                </span>
              )}
              <div className="min-w-0 flex-1 pr-8">
                <h2 id="smart-order-title" className="m-0 text-[18px] font-semibold leading-[1.25] tracking-[-.03em]">
                  {lines ? t("reviewTitle") : t("title")}
                </h2>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{lines ? t("reviewSubtitle") : t("subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={hide}
                aria-label={t("close")}
                data-smart-close
                className="absolute right-4 top-4 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-900/5 text-slate-600 transition-colors hover:bg-slate-900/[.11] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {!lines ? (
                <div className="flex flex-col gap-4">
                  <label className="block">
                    <span className="sr-only">{t("inputLabel")}</span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                      rows={5}
                      disabled={busy}
                      data-smart-input
                      placeholder={t("placeholder")}
                      className="block min-h-[132px] w-full resize-y rounded-[16px] border border-slate-900/[.12] bg-white px-4 py-3.5 text-[14px] leading-[1.6] text-slate-900 transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-[3px] focus:ring-blue-700/[.12] disabled:opacity-60 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
                    />
                  </label>
                  <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-slate-500">{t("examplesLabel")}</span>
                      {(["example1", "example2", "example3"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setText(t(k))}
                          data-smart-example={k}
                          className="max-w-full truncate rounded-full border border-slate-900/[.1] px-3 py-1.5 text-[12px] text-slate-700 transition-colors hover:border-blue-700/40 hover:bg-blue-700/[.05] dark:border-white/[.12] dark:text-slate-300 dark:hover:border-blue-400/40"
                        >
                          {t(k)}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{t("charCount", { count: text.length, max: MAX_CHARS })}</span>
                  </div>

                  {/* Upload */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      pickFile(e.dataTransfer.files?.[0]);
                    }}
                    className={`rounded-[16px] border border-dashed px-4 py-4 transition-colors ${
                      dragging ? "border-blue-600 bg-blue-600/[.06]" : "border-slate-900/[.16] dark:border-white/[.16]"
                    }`}
                  >
                    {file ? (
                      <div className="flex items-center gap-3" data-smart-file-chip>
                        <FileText size={18} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{file.name}</span>
                        <span className="flex-none text-[12px] tabular-nums text-slate-500 dark:text-ink-muted">{format.number(file.size / 1024, { maximumFractionDigits: 0 })} KB</span>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          aria-label={t("removeFile")}
                          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/[.06] dark:hover:bg-white/[.08]"
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-3 text-left">
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-slate-900/[.05] text-slate-600 dark:bg-white/[.06] dark:text-slate-300">
                          <Upload size={16} strokeWidth={2} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold">{t("dropTitle")}</span>
                          <span className="block text-[12px] text-slate-500 dark:text-ink-muted">{t("dropHint")}</span>
                        </span>
                      </button>
                    )}
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
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {removedLines > 0 && (
                    <p className="m-0 flex items-start gap-2 rounded-[12px] bg-amber-500/[.08] px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300" data-smart-removed>
                      <AlertTriangle size={14} strokeWidth={2.2} className="mt-0.5 flex-none" />
                      {t("removedLines", { count: removedLines })}
                    </p>
                  )}
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_150px] gap-4 px-4 text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-400 md:grid dark:text-slate-500">
                    <span>{t("colRequested")}</span>
                    <span>{t("colSolution")}</span>
                    <span className="text-right">{t("colPrice")}</span>
                  </div>
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
                        className={`grid gap-3 rounded-[18px] border p-4 transition-colors md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_150px] md:gap-4 ${
                          e.included ? "border-blue-700/25 bg-blue-700/[.025] dark:border-blue-400/25" : "border-slate-900/[.08] dark:border-hairline"
                        }`}
                      >
                        {/* Requested */}
                        <div className="flex min-w-0 items-start gap-3">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={e.included}
                            aria-label={t("toggleLine")}
                            disabled={!solvable}
                            onClick={() => toggle(l.id)}
                            data-smart-toggle={l.id}
                            className={`mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              e.included ? "border-blue-700 bg-blue-700 text-white" : "border-slate-900/25 dark:border-white/25"
                            }`}
                          >
                            {e.included && <Check size={13} strokeWidth={3} />}
                          </button>
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-semibold tracking-[-.015em]">{requestedLabel(l)}</div>
                            {l.request.rawText && <div className="mt-0.5 line-clamp-2 text-[12px] italic text-slate-500 dark:text-ink-muted">“{l.request.rawText}”</div>}
                            <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-semibold ring-1 ${l.gradeSubstituted ? GRADE_BADGE : BADGE[e.edited ? "ADJUSTED" : l.status]}`} data-smart-badge data-grade-substituted={l.gradeSubstituted ? "1" : undefined}>
                              {statusText(e)}
                            </span>
                          </div>
                        </div>

                        {/* Solution */}
                        <div className="min-w-0">
                          {solvable ? (
                            <>
                              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                {l.picks.map((p) => {
                                  const q = e.qty[p.productId] ?? 0;
                                  return (
                                    <li key={p.productId} data-smart-pick={p.sku} data-qty={q} className="flex items-center gap-2.5">
                                      <div className="flex flex-none items-center rounded-[11px] border border-slate-900/[.12] dark:border-white/[.14]">
                                        <button
                                          type="button"
                                          onClick={() => setQty(l.id, p, q - 1)}
                                          disabled={q <= 0}
                                          aria-label={t("decrease")}
                                          data-smart-dec={p.sku}
                                          className="flex h-9 w-9 items-center justify-center text-slate-600 disabled:opacity-30 dark:text-slate-300"
                                        >
                                          <Minus size={13} strokeWidth={2.4} />
                                        </button>
                                        <span className="w-7 text-center text-[13.5px] font-semibold tabular-nums">{q}</span>
                                        <button
                                          type="button"
                                          onClick={() => setQty(l.id, p, q + 1)}
                                          disabled={q >= p.maxQuantity}
                                          aria-label={t("increase")}
                                          data-smart-inc={p.sku}
                                          className="flex h-9 w-9 items-center justify-center text-slate-600 disabled:opacity-30 dark:text-slate-300"
                                        >
                                          <Plus size={13} strokeWidth={2.4} />
                                        </button>
                                      </div>
                                      <div className="min-w-0 text-[13px] leading-[1.4]">
                                        <div className="truncate font-semibold">
                                          {p.name} <span className="font-normal text-slate-500 dark:text-ink-muted">· {formatKg(p.weightKg)}</span>
                                          {p.grade === "RECLAIMED" && (
                                            <span className="ml-1.5 rounded-full bg-orange-500/12 px-1.5 py-[1px] text-[10.5px] font-semibold text-orange-800 dark:text-orange-300" data-smart-grade="RECLAIMED">
                                              {t("gradeReclaimed")}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11.5px] text-slate-500 dark:text-ink-muted">
                                          {t("each", { price: eur(p.unitPrice) })}
                                          {p.deposit > 0 ? ` ${t("depositEach", { price: eur(p.deposit) })}` : ""}
                                        </div>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                              <div className="mt-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300" data-smart-delivered>
                                {l.request.kind === "REFRIGERANT" && l.request.requestMode === "BY_TOTAL_WEIGHT_KG" && l.request.targetWeightKg
                                  ? t("delivered", { delivered: formatKg(s.weight), requested: formatKg(l.request.targetWeightKg) })
                                  : t("deliveredTotal", { delivered: formatKg(s.weight) })}
                              </div>
                            </>
                          ) : (
                            <div className="flex items-start gap-2 text-[12.5px] text-slate-500 dark:text-ink-muted">
                              <PackageX size={15} strokeWidth={2} className="mt-0.5 flex-none" />
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

                        {/* Price */}
                        <div className="flex items-baseline justify-between gap-2 md:block md:text-right">
                          <span className="text-[11px] uppercase tracking-[.08em] text-slate-400 md:hidden">{t("colPrice")}</span>
                          {solvable ? (
                            <div>
                              <div className="text-[15px] font-semibold tabular-nums" data-smart-line-total>
                                {eur(s.total)}
                              </div>
                              {s.deposits > 0 && (
                                <div className="text-[11.5px] tabular-nums text-slate-500 dark:text-ink-muted">
                                  {eur(s.gas)} + {eur(s.deposits)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[13px] text-slate-400">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && (
                <p className="m-0 mt-4 flex items-start gap-2 text-[12.5px] font-medium text-red-600 dark:text-red-400" data-smart-error={error}>
                  <AlertTriangle size={14} strokeWidth={2.2} className="mt-0.5 flex-none" />
                  {t(`error_${error}`)}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-none flex-col gap-3 border-t border-slate-900/[.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 dark:border-hairline">
              {lines ? (
                <>
                  <div className="text-[12.5px] text-slate-600 dark:text-ink-muted" data-smart-summary>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      <span>
                        {t("summaryGas")} <strong className="tabular-nums text-slate-900 dark:text-slate-50">{eur(summary.gas)}</strong>
                      </span>
                      <span>
                        {t("summaryDeposits")} <strong className="tabular-nums text-slate-900 dark:text-slate-50">{eur(summary.deposits)}</strong>
                      </span>
                      <span>
                        {t("summaryTotal")}{" "}
                        <strong className="tabular-nums text-slate-900 dark:text-slate-50" data-smart-grand-total>
                          {eur(summary.gas + summary.deposits)}
                        </strong>
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-slate-400">{t("summaryNote")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={addToCart}
                    disabled={summary.units === 0}
                    data-smart-add
                    className="inline-flex min-h-[46px] flex-none items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[14px] font-semibold tracking-[-.01em] text-white transition-[background-color,transform] hover:bg-blue-800 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check size={15} strokeWidth={2.4} />
                    {summary.units === 0 ? t("addCtaNone") : t("addCta", { count: summary.units })}
                  </button>
                </>
              ) : (
                <>
                  <span className="hidden text-[12px] text-slate-400 sm:block">{t("dropHint")}</span>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || (!file && text.trim().length < 3)}
                    data-smart-submit
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[14px] font-semibold tracking-[-.01em] text-white transition-[background-color,transform] hover:bg-blue-800 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={2} />}
                    {busy ? t("submitting") : t("submit")}
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
