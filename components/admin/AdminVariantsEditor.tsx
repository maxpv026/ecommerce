"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Archive, Layers, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { deleteProductSize, restoreProductSize, setVariantFamily, upsertVariant, type VariantInputData } from "@/lib/actions/inventory";
import { CONTAINER_TYPES, isContainerType, sizeLabel, type ContainerType } from "@/lib/productFamily";

/**
 * Sizes, grouped the way the storefront's size selector groups them. Each
 * line is one Product row; saving writes price, weight, container, deposit
 * and name, and hands a stock change to updateInventory (waitlist mail).
 *
 * Untranslated, like the rest of the admin tooling.
 */

export interface AdminVariantRow {
  id: string;
  sku: string;
  name: string;
  containerType: string;
  weightKg: number;
  pricePerKg: number;
  cylinderDeposit: number;
  stockQuantity: number;
  /** The explicit key, or null when grouped by refrigerant mark. */
  familyKey: string | null;
  /** True when a CRM pushes this row — it overwrites price and weight. */
  crmManaged: boolean;
}

/** A deleted size kept for its order/quote history. */
export interface AdminArchivedSize {
  id: string;
  sku: string;
  name: string;
  variant: string;
  archivedAt: string;
}

export interface AdminVariantFamily {
  /** resolveFamily() value — stable React key. */
  id: string;
  /** "R-134a" or the explicit key. */
  label: string;
  explicit: boolean;
  sizes: AdminVariantRow[];
}

interface Draft {
  name: string;
  sku: string;
  containerType: ContainerType;
  weightKg: string;
  pricePerKg: string;
  cylinderDeposit: string;
  stockQuantity: string;
}

const CARD =
  "rounded-[20px] border border-slate-900/[.07] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]";
const INPUT_BASE =
  "min-w-0 rounded-[11px] border border-slate-900/[.14] bg-white/80 px-2.5 text-[13px] tabular-nums outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/20 disabled:opacity-60 dark:border-white/[.14] dark:bg-white/[.06]";
const INPUT = `${INPUT_BASE} h-10 w-full`;
const LABEL = "mb-1 block text-[10.5px] font-semibold tracking-[.06em] text-slate-400 uppercase dark:text-slate-500";

const draftOf = (row: AdminVariantRow): Draft => ({
  name: row.name,
  sku: row.sku,
  containerType: isContainerType(row.containerType) ? row.containerType : "Cylinder",
  weightKg: String(row.weightKg),
  pricePerKg: String(row.pricePerKg),
  cylinderDeposit: String(row.cylinderDeposit),
  stockQuantity: String(row.stockQuantity),
});

const blankFor = (family: AdminVariantFamily): Draft => {
  const base = family.sizes[0];
  return {
    name: base?.name ?? "",
    sku: "",
    containerType: "Cylinder",
    weightKg: "",
    pricePerKg: base ? String(base.pricePerKg) : "",
    cylinderDeposit: base ? String(base.cylinderDeposit) : "15",
    stockQuantity: "0",
  };
};

/** Parses a draft into the action's input, or names the first bad field. */
function toInput(d: Draft): { ok: true; value: Omit<VariantInputData, "id" | "familyOf"> } | { ok: false; error: string } {
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
  const weightKg = num(d.weightKg);
  const pricePerKg = num(d.pricePerKg);
  const cylinderDeposit = num(d.cylinderDeposit);
  const stockQuantity = num(d.stockQuantity);
  if (!(weightKg > 0)) return { ok: false, error: "Enter the net weight in kg." };
  if (!(pricePerKg >= 0)) return { ok: false, error: "Enter the price per kg." };
  if (!(cylinderDeposit >= 0)) return { ok: false, error: "Enter the deposit (0 for none)." };
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return { ok: false, error: "Stock is a whole number, zero or more." };
  return {
    ok: true,
    value: { name: d.name, sku: d.sku, containerType: d.containerType, weightKg, pricePerKg, cylinderDeposit, stockQuantity },
  };
}

/** A copy of `record` without `key`. */
const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  const next = { ...record };
  delete next[key];
  return next;
};

const eur = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n);

export default function AdminVariantsEditor({
  families,
  archived = [],
}: {
  families: AdminVariantFamily[];
  archived?: AdminArchivedSize[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Family id → the "add a size" draft, when that form is open.
  const [adding, setAdding] = useState<Record<string, Draft>>({});
  const [familyDrafts, setFamilyDrafts] = useState<Record<string, string>>({});
  // Delete is two clicks: the first arms the row's button, the second sends.
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const sizeCount = useMemo(() => families.reduce((n, f) => n + f.sizes.length, 0), [families]);

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

  const save = (row: AdminVariantRow) => {
    const parsed = toInput(drafts[row.id] ?? draftOf(row));
    if (!parsed.ok) return void toast.error(parsed.error);
    run(row.id, async () => {
      const result = await upsertVariant({ id: row.id, ...parsed.value });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.stockMessage ? `${result.sku} saved. ${result.stockMessage}` : `${result.sku} saved.`);
      setDrafts((all) => without(all, row.id));
      return true;
    });
  };

  const create = (family: AdminVariantFamily) => {
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
      toast.success(result.stockMessage ? `${result.sku} added. ${result.stockMessage}` : `${result.sku} added.`);
      setAdding((all) => without(all, family.id));
      return true;
    });
  };

  const moveFamily = (row: AdminVariantRow) => {
    const next = familyDrafts[row.id];
    if (next === undefined) return;
    run(`family:${row.id}`, async () => {
      const result = await setVariantFamily({ productId: row.id, familyKey: next });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.familyKey ? `${row.sku} moved to family “${result.familyKey}”.` : `${row.sku} grouped by refrigerant again.`);
      setFamilyDrafts((all) => without(all, row.id));
      return true;
    });
  };

  const remove = (row: AdminVariantRow) => {
    if (armedDelete !== row.id) {
      setArmedDelete(row.id);
      return;
    }
    setArmedDelete(null);
    run(`delete:${row.id}`, async () => {
      const result = await deleteProductSize(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      const dropped = result.waitlistDropped > 0 ? ` ${result.waitlistDropped} waitlist sign-up${result.waitlistDropped === 1 ? "" : "s"} removed.` : "";
      if (result.mode === "deleted") toast.success(`${result.sku} deleted.${dropped}`);
      else {
        const history = [
          result.orders > 0 ? `${result.orders} order line${result.orders === 1 ? "" : "s"}` : null,
          result.quotes > 0 ? `${result.quotes} quote line${result.quotes === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" and ");
        toast.success(`${result.sku} archived — it's on ${history}, so the row is kept for those records and taken off sale.${dropped}`);
      }
      return true;
    });
  };

  const restore = (size: AdminArchivedSize) =>
    run(`restore:${size.id}`, async () => {
      const result = await restoreProductSize(size.id);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(`${result.sku} is back on sale.`);
      return true;
    });

  const field = (
    draft: Draft,
    onChange: (d: Draft) => void,
    disabled: boolean,
    testId: string
  ) => {
    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
    return (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-[1.4fr_1fr_.9fr_.8fr_.8fr_.75fr_.7fr]">
        <label className="col-span-2 md:col-span-1">
          <span className={LABEL}>Name</span>
          <input className={INPUT} value={draft.name} disabled={disabled} onChange={(e) => set("name", e.target.value)} data-field={`${testId}:name`} />
        </label>
        <label>
          <span className={LABEL}>SKU</span>
          <input className={`${INPUT} font-mono uppercase`} value={draft.sku} disabled={disabled} onChange={(e) => set("sku", e.target.value)} data-field={`${testId}:sku`} />
        </label>
        <label>
          <span className={LABEL}>Container</span>
          <select
            className={INPUT}
            value={draft.containerType}
            disabled={disabled}
            onChange={(e) => set("containerType", e.target.value as ContainerType)}
            data-field={`${testId}:container`}
          >
            {CONTAINER_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>Net kg</span>
          <input className={INPUT} inputMode="decimal" value={draft.weightKg} disabled={disabled} onChange={(e) => set("weightKg", e.target.value)} data-field={`${testId}:kg`} />
        </label>
        <label>
          <span className={LABEL}>€ / kg</span>
          <input className={INPUT} inputMode="decimal" value={draft.pricePerKg} disabled={disabled} onChange={(e) => set("pricePerKg", e.target.value)} data-field={`${testId}:price`} />
        </label>
        <label>
          <span className={LABEL}>Deposit €</span>
          <input className={INPUT} inputMode="decimal" value={draft.cylinderDeposit} disabled={disabled} onChange={(e) => set("cylinderDeposit", e.target.value)} data-field={`${testId}:deposit`} />
        </label>
        <label>
          <span className={LABEL}>Stock</span>
          <input className={INPUT} inputMode="numeric" value={draft.stockQuantity} disabled={disabled} onChange={(e) => set("stockQuantity", e.target.value)} data-field={`${testId}:stock`} />
        </label>
      </div>
    );
  };

  /** What the storefront will show for this draft — so the effect is visible before saving. */
  const preview = (d: Draft) => {
    const kg = Number(d.weightKg.replace(",", "."));
    const perKg = Number(d.pricePerKg.replace(",", "."));
    if (!(kg > 0) || !(perKg >= 0)) return null;
    return `${sizeLabel(kg, d.containerType)} · ${perKg > 0 ? eur(Math.round(kg * perKg * 100) / 100) : "price on request"}`;
  };

  return (
    <section className="mt-12" data-variants-editor>
      <header className="mb-5">
        <p className="m-0 text-[11px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">Admin · Variants</p>
        <h2 className="m-0 mt-1.5 text-[22px] font-semibold tracking-[-.035em] md:text-[26px]">Sizes</h2>
        <p className="m-0 mt-2 max-w-[680px] text-[13px] leading-[1.6] text-slate-600 dark:text-slate-400">
          Every size is its own product row — own SKU, price, stock and order history — and the rows in a family are the
          sizes offered in the product page&rsquo;s selector. Without a family key a row is grouped by its refrigerant
          mark; give rows the same key to group them yourself, e.g. to keep reclaimed R-404A apart from virgin. Stock
          changes made here email the waitlist exactly like the stock list above.
        </p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-900/[.1] bg-white/70 px-3 py-1.5 text-[12px] font-semibold dark:border-white/10 dark:bg-white/[.05]">
          <Layers size={13} strokeWidth={2.2} />
          {families.length} families · {sizeCount} sizes
        </span>
      </header>

      <div className="flex flex-col gap-4">
        {families.map((family) => {
          const addDraft = adding[family.id];
          const addBusy = pending && busy === `add:${family.id}`;
          return (
            <div key={family.id} className={`${CARD} p-4 md:p-5`} data-family={family.label}>
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold tracking-[-.02em]">{family.label}</div>
                  <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                    {family.explicit ? "Family key" : "Grouped by refrigerant mark"} · {family.sizes.length} size
                    {family.sizes.length === 1 ? "" : "s"}
                  </div>
                </div>
                {!addDraft && (
                  <button
                    type="button"
                    onClick={() => setAdding((a) => ({ ...a, [family.id]: blankFor(family) }))}
                    data-add-size={family.label}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-slate-900/[.12] px-3 text-[12.5px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.14] dark:hover:bg-white/[.06]"
                  >
                    <Plus size={14} strokeWidth={2.2} /> Add size
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {family.sizes.map((row) => {
                  const draft = drafts[row.id] ?? draftOf(row);
                  const dirty = drafts[row.id] !== undefined;
                  const rowBusy = pending && busy === row.id;
                  const familyBusy = pending && busy === `family:${row.id}`;
                  const familyDraft = familyDrafts[row.id];
                  const armed = armedDelete === row.id;
                  const deleteBusy = pending && busy === `delete:${row.id}`;
                  return (
                    <div key={row.id} className="rounded-[15px] border border-slate-900/[.06] p-3 dark:border-white/[.06]" data-variant-row={row.sku}>
                      {field(draft, (d) => setDrafts((all) => ({ ...all, [row.id]: d })), rowBusy, row.sku)}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-[11.5px] text-slate-500 dark:text-slate-400" data-preview>
                          {preview(draft) ?? "—"}
                        </span>
                        {row.crmManaged && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/[.1] px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">
                            CRM-linked: its next push overwrites price, weight and stock
                          </span>
                        )}
                        <span className="flex-1" />
                        <input
                          aria-label={`Family key for ${row.sku}`}
                          placeholder={row.familyKey ?? "family key"}
                          value={familyDraft ?? ""}
                          onChange={(e) => setFamilyDrafts((f) => ({ ...f, [row.id]: e.target.value }))}
                          disabled={familyBusy}
                          data-family-input={row.sku}
                          className={`${INPUT_BASE} h-9 w-[160px] font-mono text-[12px]`}
                        />
                        <button
                          type="button"
                          onClick={() => moveFamily(row)}
                          disabled={familyDraft === undefined || familyBusy}
                          data-move-family={row.sku}
                          title="Empty moves it back to grouping by refrigerant mark"
                          className="h-9 rounded-[11px] border border-slate-900/[.12] px-3 text-[12px] font-semibold disabled:opacity-40 dark:border-white/[.14]"
                        >
                          {familyBusy ? <Loader2 size={13} className="animate-spin" /> : "Move"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          onBlur={() => setArmedDelete((id) => (id === row.id ? null : id))}
                          disabled={deleteBusy}
                          data-delete-size={row.sku}
                          aria-label={armed ? `Confirm deleting ${row.sku}` : `Delete ${row.sku}`}
                          title="Sizes with past orders or quotes are archived instead of deleted"
                          className={`inline-flex h-9 items-center gap-1.5 rounded-[11px] border px-3 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
                            armed
                              ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                              : "border-red-500/30 text-red-600 hover:bg-red-500/[.08] dark:text-red-400"
                          }`}
                        >
                          {deleteBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.1} />}
                          {armed ? "Confirm delete" : "Delete"}
                        </button>
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => setDrafts((all) => without(all, row.id))}
                            disabled={rowBusy}
                            className="h-9 rounded-[11px] px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-900/[.04] dark:hover:bg-white/[.06]"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => save(row)}
                          disabled={!dirty || rowBusy}
                          data-save-variant={row.sku}
                          className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-45"
                        >
                          {rowBusy && <Loader2 size={13} className="animate-spin" />}
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })}

                {addDraft && (
                  <div className="rounded-[15px] border border-dashed border-blue-600/40 bg-blue-600/[.04] p-3" data-new-size={family.label}>
                    {field(addDraft, (d) => setAdding((a) => ({ ...a, [family.id]: d })), addBusy, `new:${family.label}`)}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                        {preview(addDraft) ?? "New size — GWP, purity and category are copied from this family."}
                      </span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => setAdding((all) => without(all, family.id))}
                        disabled={addBusy}
                        className="inline-flex h-9 items-center gap-1 rounded-[11px] px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-900/[.04] dark:hover:bg-white/[.06]"
                      >
                        <X size={13} /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => create(family)}
                        disabled={addBusy}
                        data-create-size={family.label}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800 disabled:opacity-45"
                      >
                        {addBusy && <Loader2 size={13} className="animate-spin" />}
                        Add size
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className={`${CARD} mt-6 p-4 md:p-5`} data-archived-sizes>
          <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold tracking-[-.02em]">
            <Archive size={15} strokeWidth={2} /> Archived sizes
          </div>
          <p className="m-0 mb-3 text-[12px] leading-[1.55] text-slate-500 dark:text-slate-400">
            Deleted sizes that appear on past orders or quotes. They stay in the database for those records, and are
            hidden from the shop, checkout, quotes and the AI assistants.
          </p>
          <div className="flex flex-col gap-2">
            {archived.map((size) => {
              const restoring = pending && busy === `restore:${size.id}`;
              return (
                <div key={size.id} className="flex flex-wrap items-center gap-3 rounded-[13px] border border-slate-900/[.06] px-3 py-2.5 dark:border-white/[.06]" data-archived-row={size.sku}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{size.name}</div>
                    <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {size.sku} · {size.variant} · archived {new Date(size.archivedAt).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => restore(size)}
                    disabled={restoring}
                    data-restore-size={size.sku}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-slate-900/[.12] px-3 text-[12px] font-semibold disabled:opacity-40 dark:border-white/[.14]"
                  >
                    {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} strokeWidth={2.1} />}
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
