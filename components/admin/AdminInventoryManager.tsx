"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  BellRing,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Layers,
  Loader2,
  Minus,
  MoreHorizontal,
  Package,
  PackageX,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deleteProductSize, restoreProductSize, setVariantFamily, upsertVariant, type VariantInputData } from "@/lib/actions/inventory";
import { updateInventory } from "@/lib/actions/adminInventory";
import { CONTAINER_TYPES, isContainerType, type ContainerType } from "@/lib/productFamily";
import { cylinderGasPrice, perKgFromCylinderPrice } from "@/lib/pricing";

/**
 * /admin/inventory — one card per product family, collapsed by default.
 *
 * The header of a card is the family at a glance: total units across its
 * sizes (with the per-size breakdown), net kg on hand, people waiting, and
 * the price range. Expanding it shows each size — one Product row — with its
 * name, SKU, container, net weight, €/kg ↔ cylinder price (kept in sync),
 * deposit and stock, plus add / move / delete.
 *
 * Totals are computed from the drafts, so a stepper click moves the card's
 * total before anything is saved; "Unsaved" marks what has not been written.
 *
 * Writes go through the existing server actions, unchanged:
 *   upsertVariant      price, weight, container, deposit, name — and stock,
 *                      which it hands to updateInventory
 *   updateInventory    stock for products sold per unit (no sizes)
 * Both reach applyInventoryUpdate, the path shared with the CRM webhook: a
 * size taken from 0 to a positive number emails its waitlist, and every
 * write expires the storefront catalog cache (lib/catalogCache).
 */

export interface InventorySize {
  id: string;
  sku: string;
  name: string;
  containerType: string;
  weightKg: number;
  pricePerKg: number;
  cylinderDeposit: number;
  stockQuantity: number;
  /** Unnotified back-in-stock sign-ups — emailed when this goes 0 → >0. */
  waitlistCount: number;
  /** The explicit key, or null when grouped by refrigerant mark. */
  familyKey: string | null;
  /** True when a CRM pushes this row — its next push overwrites price, weight and stock. */
  crmManaged: boolean;
}

export interface InventoryFamily {
  /** resolveFamily() value (or unit:<id>) — stable key. */
  id: string;
  label: string;
  /** Explicit family key, or null when grouped by refrigerant mark. */
  familyKey: string | null;
  /** Equipment / recovery cylinders: priced per unit, no sizes, stock only. */
  perUnit: boolean;
  imageSrc: string | null;
  sizes: InventorySize[];
}

/** A deleted size kept for its order/quote history. */
export interface ArchivedSize {
  id: string;
  sku: string;
  name: string;
  variant: string;
  archivedAt: string;
}

interface Draft {
  name: string;
  sku: string;
  containerType: ContainerType;
  weightKg: string;
  pricePerKg: string;
  cylinderPrice: string;
  cylinderDeposit: string;
  stockQuantity: string;
}

type Filter = "all" | "out" | "waitlist";

const CARD =
  "rounded-[20px] border border-slate-900/[.07] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]";
const INPUT =
  "h-9 w-full min-w-0 rounded-[10px] border border-slate-900/[.14] bg-white/80 px-2.5 text-[13px] tabular-nums outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/20 disabled:opacity-60 dark:border-white/[.14] dark:bg-white/[.06]";
const LABEL = "mb-1 block text-[10px] font-semibold tracking-[.06em] text-slate-400 uppercase dark:text-slate-500";
const PILL = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tabular-nums whitespace-nowrap";
// Fixed actions column, so the header row (which has no buttons) lines up with the rows.
const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,.95fr)_minmax(0,1.55fr)_minmax(0,1fr)_212px] md:items-start md:gap-3";

/** Numbers as typed: comma or dot decimals; blank → NaN. */
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "");

const draftOf = (row: InventorySize): Draft => ({
  name: row.name,
  sku: row.sku,
  containerType: isContainerType(row.containerType) ? row.containerType : "Cylinder",
  weightKg: String(row.weightKg),
  pricePerKg: String(row.pricePerKg),
  cylinderPrice: money(cylinderGasPrice(row.pricePerKg, row.weightKg)),
  cylinderDeposit: String(row.cylinderDeposit),
  stockQuantity: String(row.stockQuantity),
});

const blankFor = (family: InventoryFamily): Draft => {
  const base = family.sizes[0];
  return {
    // The family's mark pre-filled: "R-32 " → the admin types the rest.
    name: base ? `${base.name.split(" ")[0]} ` : "",
    sku: "",
    containerType: "Cylinder",
    weightKg: "",
    pricePerKg: base ? String(base.pricePerKg) : "",
    cylinderPrice: "",
    cylinderDeposit: base ? String(base.cylinderDeposit) : "15",
    stockQuantity: "0",
  };
};

const sameDraft = (a: Draft, b: Draft) =>
  a.name.trim() === b.name.trim() &&
  a.sku.trim().toUpperCase() === b.sku.trim().toUpperCase() &&
  a.containerType === b.containerType &&
  num(a.weightKg) === num(b.weightKg) &&
  num(a.pricePerKg) === num(b.pricePerKg) &&
  num(a.cylinderDeposit) === num(b.cylinderDeposit) &&
  num(a.stockQuantity) === num(b.stockQuantity);

/** The stock a draft would write, or the saved one while the field is mid-edit. */
const stockOf = (d: Draft, fallback: number) => {
  const n = num(d.stockQuantity);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  const next = { ...record };
  delete next[key];
  return next;
};

export default function AdminInventoryManager({ families, archived = [] }: { families: InventoryFamily[]; archived?: ArchivedSize[] }) {
  const t = useTranslations("AdminInventory");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Record<string, Draft>>({});
  const [familyDrafts, setFamilyDrafts] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // The stock dispatcher's own words ("stock 0 → 10 · 3 emailed"), one line
  // per row written by the last save — a family save can move several sizes.
  const [report, setReport] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const kg = (n: number) => format.number(n, { maximumFractionDigits: 2 });

  // ── Draft plumbing ──────────────────────────────────────────────────────
  const draftFor = (row: InventorySize) => drafts[row.id] ?? draftOf(row);
  const isDirty = (row: InventorySize) => drafts[row.id] !== undefined && !sameDraft(drafts[row.id], draftOf(row));
  const setDraft = (row: InventorySize, next: Draft) => setDrafts((all) => ({ ...all, [row.id]: next }));

  /**
   * One field changed. €/kg is what is stored, so it stays the source of
   * truth: typing a cylinder price derives €/kg from it (to the cent, as the
   * catalog stores it), and every other change re-derives the cylinder price.
   */
  const edit = (d: Draft, key: keyof Draft, value: string): Draft => {
    const next = { ...d, [key]: value } as Draft;
    const weight = num(next.weightKg);
    if (key === "cylinderPrice") {
      const cyl = num(value);
      if (weight > 0 && cyl >= 0) next.pricePerKg = String(perKgFromCylinderPrice(cyl, weight));
    } else if (key === "pricePerKg" || key === "weightKg") {
      const perKg = num(next.pricePerKg);
      next.cylinderPrice = weight > 0 && perKg >= 0 ? money(cylinderGasPrice(perKg, weight)) : "";
    }
    return next;
  };

  const step = (row: InventorySize, delta: number) => {
    const d = draftFor(row);
    setDraft(row, { ...d, stockQuantity: String(Math.max(0, stockOf(d, row.stockQuantity) + delta)) });
  };

  /** Client-side check before a round trip; the server re-validates everything. */
  const toInput = (d: Draft): { ok: true; value: Omit<VariantInputData, "id" | "familyOf"> } | { ok: false; error: string } => {
    const weightKg = num(d.weightKg);
    const pricePerKg = num(d.pricePerKg);
    const cylinderDeposit = num(d.cylinderDeposit);
    const stockQuantity = num(d.stockQuantity);
    if (!(weightKg > 0)) return { ok: false, error: t("errNetKg") };
    if (!(pricePerKg >= 0)) return { ok: false, error: t("errPrice") };
    if (!(cylinderDeposit >= 0)) return { ok: false, error: t("errDeposit") };
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return { ok: false, error: t("errStock") };
    return { ok: true, value: { name: d.name.trim(), sku: d.sku, containerType: d.containerType, weightKg, pricePerKg, cylinderDeposit, stockQuantity } };
  };

  // ── Writes ──────────────────────────────────────────────────────────────
  const run = (key: string, task: () => Promise<boolean>) => {
    setBusy(key);
    startTransition(async () => {
      try {
        if (await task()) router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    });
  };

  /** Writes one row. `error` set → nothing (or not everything) was saved; `stock` is the dispatcher's report, if stock moved. */
  const writeRow = async (family: InventoryFamily, row: InventorySize): Promise<{ error: string | null; stock: string | null }> => {
    const d = draftFor(row);
    let stock: string | null = null;
    if (family.perUnit) {
      // No sizes: stock only, through the waitlist-aware path.
      const qty = num(d.stockQuantity);
      if (!Number.isInteger(qty) || qty < 0) return { error: t("errStock"), stock: null };
      const result = await updateInventory({ productId: row.id, newQuantity: qty });
      if (!result.ok) return { error: result.message, stock: null };
      stock = result.message;
    } else {
      const parsed = toInput(d);
      if (!parsed.ok) return { error: `${row.sku}: ${parsed.error}`, stock: null };
      const result = await upsertVariant({ id: row.id, ...parsed.value });
      if (!result.ok) return { error: `${row.sku}: ${result.error}`, stock: null };
      stock = result.stockMessage;
    }
    setDrafts((all) => without(all, row.id));
    return { error: null, stock };
  };

  /** Saves rows one after another and reports every stock line, not just the last. */
  const saveRows = (key: string, family: InventoryFamily, rows: InventorySize[]) =>
    run(key, async () => {
      const lines: string[] = [];
      let saved = 0;
      let failed = false;
      for (const row of rows) {
        const { error, stock } = await writeRow(family, row);
        if (error) {
          failed = true;
          lines.push(error);
          toast.error(error);
        } else {
          saved++;
          if (stock) lines.push(stock);
        }
      }
      if (lines.length) setReport({ ok: !failed, lines });
      if (saved > 0) toast.success(rows.length === 1 ? t("savedSku", { sku: rows[0].sku }) : t("familySaved", { count: saved }));
      return saved > 0;
    });

  const saveRow = (family: InventoryFamily, row: InventorySize) => saveRows(row.id, family, [row]);

  /** "Save changes" for a whole family: every dirty row, one after another. */
  const saveFamily = (family: InventoryFamily) => saveRows(`family:${family.id}`, family, family.sizes.filter(isDirty));

  const create = (family: InventoryFamily) => {
    const draft = adding[family.id];
    if (!draft) return;
    const parsed = toInput(draft);
    if (!parsed.ok) return void toast.error(parsed.error);
    run(`add:${family.id}`, async () => {
      const result = await upsertVariant({ familyOf: family.sizes[0].id, ...parsed.value });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      if (result.stockMessage) setReport({ ok: true, lines: [result.stockMessage] });
      toast.success(t("addedSku", { sku: result.sku }));
      setAdding((all) => without(all, family.id));
      return true;
    });
  };

  const moveFamily = (row: InventorySize) => {
    const next = familyDrafts[row.id];
    if (next === undefined) return;
    run(`move:${row.id}`, async () => {
      const result = await setVariantFamily({ productId: row.id, familyKey: next });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.familyKey ? t("movedTo", { sku: row.sku, key: result.familyKey }) : t("movedBack", { sku: row.sku }));
      setFamilyDrafts((all) => without(all, row.id));
      setMoreOpen(null);
      return true;
    });
  };

  const remove = (row: InventorySize) => {
    if (armedDelete !== row.id) return setArmedDelete(row.id);
    setArmedDelete(null);
    run(`delete:${row.id}`, async () => {
      const result = await deleteProductSize(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      const dropped = result.waitlistDropped > 0 ? ` ${t("waitlistDropped", { count: result.waitlistDropped })}` : "";
      toast.success((result.mode === "deleted" ? t("deletedSku", { sku: result.sku }) : t("archivedSku", { sku: result.sku })) + dropped);
      return true;
    });
  };

  const restore = (size: ArchivedSize) =>
    run(`restore:${size.id}`, async () => {
      const result = await restoreProductSize(size.id);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(t("restoredSku", { sku: result.sku }));
      return true;
    });

  // ── Aggregates (live, from drafts) ──────────────────────────────────────
  const summarize = (family: InventoryFamily) => {
    const sizes = family.sizes.map((row) => {
      const d = draftFor(row);
      const weight = num(d.weightKg) > 0 ? num(d.weightKg) : row.weightKg;
      const perKg = num(d.pricePerKg) >= 0 ? num(d.pricePerKg) : row.pricePerKg;
      return { row, stock: stockOf(d, row.stockQuantity), weight, perKg, unitPrice: cylinderGasPrice(perKg, weight), container: d.containerType };
    });
    const priced = sizes.filter((s) => s.perKg > 0);
    const range = (values: number[]) => (values.length ? [Math.min(...values), Math.max(...values)] : null);
    return {
      sizes,
      total: sizes.reduce((n, s) => n + s.stock, 0),
      kgOnHand: sizes.reduce((n, s) => n + s.stock * s.weight, 0),
      outSizes: sizes.filter((s) => s.stock === 0).length,
      waiting: family.sizes.reduce((n, r) => n + r.waitlistCount, 0),
      unitRange: range(priced.map((s) => s.unitPrice)),
      perKgRange: range(priced.map((s) => s.perKg)),
      dirty: family.sizes.filter(isDirty).length,
    };
  };

  // Filters read the SAVED numbers, so a card doesn't vanish mid-edit.
  const savedOut = (f: InventoryFamily) => f.sizes.some((s) => s.stockQuantity === 0);
  const savedWaiting = (f: InventoryFamily) => f.sizes.some((s) => s.waitlistCount > 0);
  const counts = useMemo(
    () => ({
      sizes: families.reduce((n, f) => n + f.sizes.length, 0),
      outSizes: families.reduce((n, f) => n + f.sizes.filter((s) => s.stockQuantity === 0).length, 0),
      waiting: families.reduce((n, f) => n + f.sizes.reduce((m, s) => m + s.waitlistCount, 0), 0),
      outFamilies: families.filter(savedOut).length,
      waitlistFamilies: families.filter(savedWaiting).length,
    }),
    [families]
  );

  const needle = query.trim().toLowerCase();
  const visible = families.filter((f) => {
    if (filter === "out" && !savedOut(f)) return false;
    if (filter === "waitlist" && !savedWaiting(f)) return false;
    if (!needle) return true;
    return f.label.toLowerCase().includes(needle) || f.sizes.some((s) => s.name.toLowerCase().includes(needle) || s.sku.toLowerCase().includes(needle));
  });
  const allOpen = visible.length > 0 && visible.every((f) => expanded.has(f.id));
  const toggle = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Render helpers ──────────────────────────────────────────────────────
  const stockBadge = (total: number, outSizes: number, sizeCount: number) => {
    const tone =
      total === 0
        ? "border-red-500/30 bg-red-500/[.1] text-red-700 dark:text-red-400"
        : outSizes > 0
          ? "border-amber-500/35 bg-amber-500/[.1] text-amber-700 dark:text-amber-400"
          : "border-emerald-500/30 bg-emerald-500/[.1] text-emerald-700 dark:text-emerald-400";
    return (
      <span
        data-family-stock={total}
        data-stock-tone={total === 0 ? "out" : outSizes > 0 ? "partial" : "in"}
        title={outSizes > 0 && total > 0 ? t("sizesOut", { count: outSizes, total: sizeCount }) : undefined}
        className={`${PILL} ${tone}`}
      >
        {t("inStock", { count: total })}
      </span>
    );
  };

  const rangeLabel = (range: number[] | null, suffix: string) =>
    range ? `${range[0] === range[1] ? eur(range[0]) : `${eur(range[0])} – ${eur(range[1])}`} ${suffix}` : null;

  const sizeFields = (draft: Draft, onChange: (d: Draft) => void, disabled: boolean, testId: string) => {
    const set = (key: keyof Draft, value: string) => onChange(edit(draft, key, value));
    const unitPrice = cylinderGasPrice(num(draft.pricePerKg), num(draft.weightKg));
    const deposit = num(draft.cylinderDeposit);
    return (
      <>
        {/* 1. Variant: name + SKU */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <label>
            <span className={LABEL}>{t("fieldName")}</span>
            <input className={INPUT} value={draft.name} disabled={disabled} onChange={(e) => set("name", e.target.value)} data-field={`${testId}:name`} />
          </label>
          <label>
            <span className={LABEL}>{t("fieldSku")}</span>
            <input className={`${INPUT} font-mono uppercase`} value={draft.sku} disabled={disabled} onChange={(e) => set("sku", e.target.value)} data-field={`${testId}:sku`} />
          </label>
        </div>
        {/* 2. Container + net kg */}
        <div className="mt-2 grid grid-cols-2 gap-2 md:mt-0 md:grid-cols-1">
          <label>
            <span className={LABEL}>{t("fieldContainer")}</span>
            <select className={INPUT} value={draft.containerType} disabled={disabled} onChange={(e) => set("containerType", e.target.value)} data-field={`${testId}:container`}>
              {CONTAINER_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>{t("fieldNetKg")}</span>
            <input className={INPUT} inputMode="decimal" value={draft.weightKg} disabled={disabled} onChange={(e) => set("weightKg", e.target.value)} data-field={`${testId}:kg`} />
          </label>
        </div>
        {/* 3. Pricing: €/kg ↔ cylinder €, deposit, and the resulting price */}
        <div className="mt-2 md:mt-0">
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className={LABEL}>{t("fieldPerKg")}</span>
              <input className={INPUT} inputMode="decimal" value={draft.pricePerKg} disabled={disabled} onChange={(e) => set("pricePerKg", e.target.value)} data-field={`${testId}:price`} />
            </label>
            <label>
              <span className={LABEL}>{t("fieldCylinder")}</span>
              <input className={INPUT} inputMode="decimal" value={draft.cylinderPrice} disabled={disabled} onChange={(e) => set("cylinderPrice", e.target.value)} data-field={`${testId}:cylinder`} />
            </label>
            <label>
              <span className={LABEL}>{t("fieldDeposit")}</span>
              <input className={INPUT} inputMode="decimal" value={draft.cylinderDeposit} disabled={disabled} onChange={(e) => set("cylinderDeposit", e.target.value)} data-field={`${testId}:deposit`} />
            </label>
          </div>
          <div className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400" data-final-price>
            {Number.isFinite(unitPrice) && num(draft.weightKg) > 0 ? (
              unitPrice > 0 ? (
                <>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{t("sellsAt", { price: eur(unitPrice) })}</span>
                  {deposit > 0 && <> {t("plusDeposit", { deposit: eur(deposit) })}</>}
                </>
              ) : (
                t("priceOnRequest")
              )
            ) : (
              "—"
            )}
          </div>
        </div>
      </>
    );
  };

  const stockStepper = (row: InventorySize, draft: Draft, disabled: boolean) => (
    <div>
      <span className={LABEL}>{t("fieldStock")}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(row, -1)}
          disabled={disabled || stockOf(draft, row.stockQuantity) === 0}
          aria-label={t("decrease", { sku: row.sku })}
          data-stock-minus={row.sku}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-slate-900/[.12] hover:bg-slate-900/[.05] disabled:opacity-35 dark:border-white/[.14] dark:hover:bg-white/[.07]"
        >
          <Minus size={14} strokeWidth={2.4} />
        </button>
        <input
          className={`${INPUT} w-[64px] text-center font-semibold`}
          inputMode="numeric"
          value={draft.stockQuantity}
          disabled={disabled}
          onChange={(e) => setDraft(row, { ...draft, stockQuantity: e.target.value.replace(/[^\d]/g, "") })}
          aria-label={t("stockFor", { sku: row.sku })}
          data-field={`${row.sku}:stock`}
        />
        <button
          type="button"
          onClick={() => step(row, 1)}
          disabled={disabled}
          aria-label={t("increase", { sku: row.sku })}
          data-stock-plus={row.sku}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-slate-900/[.12] hover:bg-slate-900/[.05] disabled:opacity-35 dark:border-white/[.14] dark:hover:bg-white/[.07]"
        >
          <Plus size={14} strokeWidth={2.4} />
        </button>
      </div>
      {row.waitlistCount > 0 && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400" data-size-waitlist={row.sku}>
          <BellRing size={11} strokeWidth={2.2} />
          {t("waitlistOnRestock", { count: row.waitlistCount })}
        </div>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 bg-slate-50 dark:bg-canvas">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-8 md:px-8 md:py-12" data-inventory-manager>
        <header className="mb-6">
          <p className="m-0 text-[11px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">{t("eyebrow")}</p>
          <h1 className="m-0 mt-1.5 text-[26px] font-semibold tracking-[-.04em] md:text-[32px]">{t("title")}</h1>
          <p className="m-0 mt-2 max-w-[720px] text-[13px] leading-[1.6] text-slate-600 dark:text-slate-400">{t("intro")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`${PILL} border-slate-900/[.1] bg-white/70 dark:border-white/10 dark:bg-white/[.05]`}>
              <Layers size={13} strokeWidth={2.2} />
              {t("statFamilies", { families: families.length, sizes: counts.sizes })}
            </span>
            <span className={`${PILL} border-amber-500/30 bg-amber-500/[.1] text-amber-700 dark:text-amber-400`}>
              <PackageX size={13} strokeWidth={2.2} />
              {t("statOut", { count: counts.outSizes })}
            </span>
            <span className={`${PILL} border-blue-500/30 bg-blue-500/[.1] text-blue-700 dark:text-blue-400`}>
              <BellRing size={13} strokeWidth={2.2} />
              {t("waiting", { count: counts.waiting })}
            </span>
          </div>
        </header>

        {report && (
          <div
            data-inventory-report
            className={`mb-5 flex items-start justify-between gap-3 rounded-[16px] border p-4 text-[12.5px] leading-[1.6] ${
              report.ok
                ? "border-emerald-500/30 bg-emerald-500/[.08] text-emerald-900 dark:text-emerald-200"
                : "border-red-500/30 bg-red-500/[.08] text-red-900 dark:text-red-200"
            }`}
          >
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 font-semibold">
              {report.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setReport(null)} aria-label={t("dismiss")} className="flex-none opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="sticky top-2 z-20 mb-4 flex flex-col gap-2.5 rounded-[16px] border border-slate-900/[.07] bg-slate-50/90 p-2.5 backdrop-blur-xl md:flex-row md:items-center dark:border-white/[.08] dark:bg-canvas/90" data-inventory-toolbar>
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              data-inventory-search
              className={`${INPUT} h-10 pl-9`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={t("filterLabel")} className="flex rounded-[12px] border border-slate-900/[.1] bg-white/70 p-0.5 dark:border-white/[.12] dark:bg-white/[.04]">
              {(
                [
                  ["all", t("filterAll"), families.length],
                  ["out", t("filterOut"), counts.outFamilies],
                  ["waitlist", t("filterWaitlist"), counts.waitlistFamilies],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filter === value}
                  onClick={() => setFilter(value)}
                  data-filter={value}
                  className={`h-9 rounded-[10px] px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                    filter === value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-900/[.05] dark:text-slate-300 dark:hover:bg-white/[.06]"
                  }`}
                >
                  {label} <span className="opacity-60 tabular-nums">{count}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(allOpen ? new Set() : new Set(visible.map((f) => f.id)))}
              data-expand-all
              className="inline-flex h-10 flex-none items-center gap-1.5 rounded-[12px] border border-slate-900/[.12] bg-white/70 px-3 text-[12.5px] font-semibold whitespace-nowrap hover:bg-white dark:border-white/[.14] dark:bg-white/[.04] dark:hover:bg-white/[.08]"
            >
              {allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
              {allOpen ? t("collapseAll") : t("expandAll")}
            </button>
          </div>
        </div>

        {/* ── Families ── */}
        <div className="flex flex-col gap-3">
          {visible.length === 0 && <div className={`${CARD} p-8 text-center text-[13px] text-slate-500`}>{t("noResults")}</div>}
          {visible.map((family) => {
            const s = summarize(family);
            const open = expanded.has(family.id);
            const panelId = `family-panel-${family.id.replace(/[^a-z0-9]/gi, "-")}`;
            const addDraft = adding[family.id];
            const addBusy = pending && busy === `add:${family.id}`;
            const familyBusy = pending && busy === `family:${family.id}`;
            // "/ cyl" only when every size is a cylinder — an isotank is not one.
            const allCylinders = s.sizes.every((x) => x.container === "Cylinder");
            const unitPrices = rangeLabel(s.unitRange, family.perUnit ? t("perUnit") : allCylinders ? t("perCylinder") : t("perContainer"));
            const breakdown = s.sizes.map((x) => t("breakdownItem", { count: x.stock, size: `${kg(x.weight)} kg${x.container === "Cylinder" ? "" : ` ${x.container.toLowerCase()}`}` }));
            return (
              <section key={family.id} className={`${CARD} overflow-hidden`} data-family={family.label} data-family-open={open}>
                {/* Header: the whole bar toggles. */}
                <button
                  type="button"
                  onClick={() => toggle(family.id)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  data-family-toggle={family.label}
                  className="flex w-full items-center gap-3.5 p-3.5 text-left transition-colors hover:bg-slate-900/[.025] md:gap-4 md:p-4 dark:hover:bg-white/[.03]"
                >
                  <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-[13px] border border-slate-900/[.06] bg-slate-100 dark:border-white/[.06] dark:bg-white/[.05]">
                    {family.imageSrc ? (
                      <Image src={family.imageSrc} alt="" width={48} height={48} sizes="48px" className="h-full w-full object-contain p-1" />
                    ) : (
                      <Package size={18} strokeWidth={1.8} className="text-slate-400 dark:text-slate-500" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold tracking-[-.02em]">{family.label}</span>
                      {family.familyKey && <span className="rounded-md bg-slate-900/[.06] px-1.5 py-0.5 font-mono text-[10.5px] text-slate-500 dark:bg-white/[.08] dark:text-slate-400">{family.familyKey}</span>}
                      {family.perUnit && <span className="rounded-md bg-slate-900/[.06] px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500 dark:bg-white/[.08] dark:text-slate-400">{t("soldPerUnit")}</span>}
                      {s.dirty > 0 && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">{t("unsavedCount", { count: s.dirty })}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-slate-500 tabular-nums dark:text-slate-400" data-family-breakdown>
                      {family.perUnit ? family.sizes[0].sku : breakdown.length > 3 ? `${t("sizesCount", { count: breakdown.length })} · ${breakdown.join(" · ")}` : breakdown.join(" · ")}
                    </span>
                  </span>

                  <span className="hidden flex-none flex-col items-end gap-1 md:flex">
                    <span className="flex items-center gap-1.5">
                      {s.waiting > 0 && (
                        <span className={`${PILL} border-blue-500/30 bg-blue-500/[.1] text-blue-700 dark:text-blue-400`} data-family-waiting={s.waiting}>
                          <BellRing size={12} strokeWidth={2.2} />
                          {t("waiting", { count: s.waiting })}
                        </span>
                      )}
                      {stockBadge(s.total, s.outSizes, family.sizes.length)}
                    </span>
                    <span className="text-[11.5px] text-slate-500 tabular-nums dark:text-slate-400">
                      {[
                        family.perUnit ? null : <span key="kg" data-family-kg>{t("kgTotal", { kg: kg(s.kgOnHand) })}</span>,
                        unitPrices ? <span key="price" data-family-price>{unitPrices}</span> : null,
                      ]
                        .filter(Boolean)
                        .flatMap((node, i) => (i === 0 ? [node] : [" · ", node]))}
                    </span>
                    {!family.perUnit && s.perKgRange && <span className="text-[11px] text-slate-400 tabular-nums dark:text-slate-500">{rangeLabel(s.perKgRange, t("perKg"))}</span>}
                  </span>

                  {/* Phone: the essentials only. */}
                  <span className="flex flex-none flex-col items-end gap-1 md:hidden">
                    {stockBadge(s.total, s.outSizes, family.sizes.length)}
                    {s.waiting > 0 && <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">{t("waiting", { count: s.waiting })}</span>}
                  </span>

                  <ChevronDown size={18} strokeWidth={2} className={`flex-none text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={panelId}
                      key="panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                      className="overflow-hidden"
                      data-family-panel={family.label}
                    >
                      <div className="border-t border-slate-900/[.07] dark:border-white/[.07]">
                        {!family.perUnit && (
                          <div className={`hidden border-b border-slate-900/[.06] px-4 py-2 text-[10.5px] font-semibold tracking-[.07em] text-slate-400 uppercase dark:border-white/[.06] dark:text-slate-500 ${ROW_GRID}`} aria-hidden>
                            <span>{t("colVariant")}</span>
                            <span>{t("colSize")}</span>
                            <span>{t("colPricing")}</span>
                            <span>{t("colStock")}</span>
                            <span />
                          </div>
                        )}

                        {family.sizes.map((row) => {
                          const draft = draftFor(row);
                          const dirty = isDirty(row);
                          const rowBusy = pending && (busy === row.id || familyBusy);
                          const moveBusy = pending && busy === `move:${row.id}`;
                          const deleteBusy = pending && busy === `delete:${row.id}`;
                          const armed = armedDelete === row.id;
                          const showMore = moreOpen === row.id;
                          return (
                            <div key={row.id} className="border-b border-slate-900/[.06] px-4 py-3.5 last:border-b-0 dark:border-white/[.06]" data-variant-row={row.sku} data-dirty={dirty}>
                              {family.perUnit ? (
                                // Sold per unit: no sizes and no price editor here — stock only.
                                <div className="flex flex-wrap items-end gap-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[13.5px] font-semibold">{row.name}</div>
                                    <div className="mt-0.5 font-mono text-[11.5px] text-slate-500">{row.sku}</div>
                                    <div className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                                      {t("unitPriceNote", { price: eur(cylinderGasPrice(row.pricePerKg, row.weightKg)) })}
                                    </div>
                                  </div>
                                  {stockStepper(row, draft, rowBusy)}
                                  <div className="flex items-center gap-2 self-end">
                                    {dirty && (
                                      <button type="button" onClick={() => setDrafts((all) => without(all, row.id))} disabled={rowBusy} className="h-9 rounded-[10px] px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-900/[.05] dark:hover:bg-white/[.06]">
                                        {t("reset")}
                                      </button>
                                    )}
                                    <button type="button" onClick={() => saveRow(family, row)} disabled={!dirty || rowBusy} data-save-variant={row.sku} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-40">
                                      {pending && busy === row.id && <Loader2 size={13} className="animate-spin" />}
                                      {t("save")}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className={ROW_GRID}>
                                    {sizeFields(draft, (d) => setDraft(row, d), rowBusy, row.sku)}
                                    <div className="mt-2 md:mt-0">{stockStepper(row, draft, rowBusy)}</div>
                                    {/* Row actions */}
                                    <div className="mt-3 flex items-center justify-end gap-1.5 md:mt-[18px]">
                                      {dirty && (
                                        <button type="button" onClick={() => setDrafts((all) => without(all, row.id))} disabled={rowBusy} title={t("reset")} className="h-9 rounded-[10px] px-2.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-900/[.05] dark:hover:bg-white/[.06]">
                                          {t("reset")}
                                        </button>
                                      )}
                                      <button type="button" onClick={() => saveRow(family, row)} disabled={!dirty || rowBusy} data-save-variant={row.sku} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-blue-700 px-3.5 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-40">
                                        {pending && busy === row.id && <Loader2 size={13} className="animate-spin" />}
                                        {t("save")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setMoreOpen(showMore ? null : row.id)}
                                        aria-expanded={showMore}
                                        aria-label={t("moreFor", { sku: row.sku })}
                                        title={t("moreFor", { sku: row.sku })}
                                        data-more={row.sku}
                                        className={`flex h-9 w-9 items-center justify-center rounded-[10px] border transition-colors ${showMore ? "border-slate-900/30 bg-slate-900/[.06] dark:border-white/30 dark:bg-white/[.08]" : "border-slate-900/[.12] hover:bg-slate-900/[.05] dark:border-white/[.14] dark:hover:bg-white/[.07]"}`}
                                      >
                                        <MoreHorizontal size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => remove(row)}
                                        onBlur={() => setArmedDelete((id) => (id === row.id ? null : id))}
                                        disabled={deleteBusy}
                                        data-delete-size={row.sku}
                                        aria-label={armed ? t("confirmDeleteFor", { sku: row.sku }) : t("deleteFor", { sku: row.sku })}
                                        title={t("deleteHint")}
                                        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border transition-colors disabled:opacity-40 ${
                                          armed ? "border-red-600 bg-red-600 px-3 text-[12px] font-semibold text-white hover:bg-red-700" : "w-9 border-red-500/30 text-red-600 hover:bg-red-500/[.08] dark:text-red-400"
                                        }`}
                                      >
                                        {deleteBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} strokeWidth={2.1} />}
                                        {armed && t("confirmDelete")}
                                      </button>
                                    </div>
                                  </div>

                                  {(dirty || row.crmManaged) && (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      {dirty && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300" data-unsaved>{t("unsaved")}</span>}
                                      {row.crmManaged && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{t("crmManaged")}</span>}
                                    </div>
                                  )}

                                  {/* Secondary: family key / move — out of the main inputs. */}
                                  {showMore && (
                                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-[12px] bg-slate-900/[.035] p-3 dark:bg-white/[.04]" data-more-panel={row.sku}>
                                      <label className="min-w-[200px] flex-1">
                                        <span className={LABEL}>{t("familyKeyLabel")}</span>
                                        <input
                                          className={`${INPUT} font-mono text-[12px]`}
                                          placeholder={row.familyKey ?? t("familyKeyPlaceholder")}
                                          value={familyDrafts[row.id] ?? ""}
                                          onChange={(e) => setFamilyDrafts((f) => ({ ...f, [row.id]: e.target.value }))}
                                          disabled={moveBusy}
                                          data-family-input={row.sku}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => moveFamily(row)}
                                        disabled={familyDrafts[row.id] === undefined || moveBusy}
                                        data-move-family={row.sku}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-slate-900/[.14] bg-white/80 px-3.5 text-[12.5px] font-semibold disabled:opacity-40 dark:border-white/[.14] dark:bg-white/[.06]"
                                      >
                                        {moveBusy && <Loader2 size={13} className="animate-spin" />}
                                        {t("move")}
                                      </button>
                                      <p className="m-0 w-full text-[11px] leading-[1.5] text-slate-500 dark:text-slate-400">{t("familyKeyHint")}</p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}

                        {/* New size (gas families only) */}
                        {addDraft && (
                          <div className="border-t border-dashed border-blue-600/40 bg-blue-600/[.04] px-4 py-3.5" data-new-size={family.label}>
                            <div className={ROW_GRID}>
                              {sizeFields(addDraft, (d) => setAdding((a) => ({ ...a, [family.id]: d })), addBusy, `new:${family.label}`)}
                              <div className="mt-2 md:mt-0">
                                <span className={LABEL}>{t("fieldStock")}</span>
                                <input
                                  className={`${INPUT} w-[64px] text-center font-semibold`}
                                  inputMode="numeric"
                                  value={addDraft.stockQuantity}
                                  disabled={addBusy}
                                  onChange={(e) => setAdding((a) => ({ ...a, [family.id]: { ...addDraft, stockQuantity: e.target.value.replace(/[^\d]/g, "") } }))}
                                  data-field={`new:${family.label}:stock`}
                                />
                              </div>
                              <div className="mt-3 flex items-center justify-end gap-1.5 md:mt-[18px]">
                                <button type="button" onClick={() => setAdding((all) => without(all, family.id))} disabled={addBusy} className="inline-flex h-9 items-center gap-1 rounded-[10px] px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-900/[.05] dark:hover:bg-white/[.06]">
                                  <X size={13} /> {t("cancel")}
                                </button>
                                <button type="button" onClick={() => create(family)} disabled={addBusy} data-create-size={family.label} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-blue-700 px-3.5 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-45">
                                  {addBusy && <Loader2 size={13} className="animate-spin" />}
                                  {t("addSize")}
                                </button>
                              </div>
                            </div>
                            <p className="m-0 mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t("addSizeHint")}</p>
                          </div>
                        )}

                        {/* Footer: add a size · save the family's changes */}
                        {(!family.perUnit || s.dirty > 0) && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-900/[.07] bg-slate-900/[.015] px-4 py-3 dark:border-white/[.07] dark:bg-white/[.015]">
                            {!family.perUnit && !addDraft && (
                              <button
                                type="button"
                                onClick={() => setAdding((a) => ({ ...a, [family.id]: blankFor(family) }))}
                                data-add-size={family.label}
                                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-slate-900/[.12] px-3 text-[12.5px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.14] dark:hover:bg-white/[.06]"
                              >
                                <Plus size={14} strokeWidth={2.2} /> {t("addSize")}
                              </button>
                            )}
                            <span className="flex-1" />
                            {s.dirty > 0 && (
                              <>
                                <button type="button" onClick={() => setDrafts((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !family.sizes.some((r) => r.id === id))))} disabled={familyBusy} className="h-9 rounded-[10px] px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-900/[.05] dark:hover:bg-white/[.06]">
                                  {t("discard")}
                                </button>
                                <button type="button" onClick={() => saveFamily(family)} disabled={familyBusy} data-save-family={family.label} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-45">
                                  {familyBusy && <Loader2 size={13} className="animate-spin" />}
                                  {t("saveFamily", { count: s.dirty })}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })}
        </div>

        {/* ── Archived sizes ── */}
        {archived.length > 0 && (
          <div className={`${CARD} mt-8 p-4 md:p-5`} data-archived-sizes>
            <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold tracking-[-.02em]">
              <Archive size={15} strokeWidth={2} /> {t("archivedTitle")}
            </div>
            <p className="m-0 mb-3 text-[12px] leading-[1.55] text-slate-500 dark:text-slate-400">{t("archivedBody")}</p>
            <div className="flex flex-col gap-2">
              {archived.map((size) => {
                const restoring = pending && busy === `restore:${size.id}`;
                return (
                  <div key={size.id} className="flex flex-wrap items-center gap-3 rounded-[13px] border border-slate-900/[.06] px-3 py-2.5 dark:border-white/[.06]" data-archived-row={size.sku}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{size.name}</div>
                      <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {size.sku} · {size.variant} · {t("archivedOn", { date: format.dateTime(new Date(size.archivedAt), { dateStyle: "medium" }) })}
                      </div>
                    </div>
                    <button type="button" onClick={() => restore(size)} disabled={restoring} data-restore-size={size.sku} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-slate-900/[.12] px-3 text-[12px] font-semibold disabled:opacity-40 dark:border-white/[.14]">
                      {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} strokeWidth={2.1} />}
                      {t("restore")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
