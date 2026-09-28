"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { BellRing, Loader2, Package, PackageX } from "lucide-react";
import { updateInventory, type InventoryUpdateReport } from "@/lib/actions/adminInventory";

/**
 * Manual stock control, one row per product.
 *
 * The point of the screen is the thing Prisma Studio cannot do: taking a
 * product from 0 to a positive number here runs the same dispatcher the CRM
 * webhook runs, so the waitlist actually gets mailed. The row shows how many
 * people are waiting precisely so that consequence is visible before the
 * button is pressed.
 *
 * Deliberately untranslated, like the other admin tooling: an internal
 * operator screen does not earn 29 locale entries, and English here is
 * clearer than a machine-translated approximation.
 */

export interface AdminInventoryRow {
  id: string;
  sku: string;
  name: string;
  variant: string;
  category: string;
  inStock: boolean;
  stockQuantity: number;
  waitlistCount: number;
  imageSrc: string | null;
}

const CARD =
  "rounded-[20px] border border-slate-900/[.07] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]";

export default function AdminInventoryTable({ rows }: { rows: AdminInventoryRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Which row is mid-flight — one at a time, so the spinner sits where it belongs.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [lastReport, setLastReport] = useState<InventoryUpdateReport | null>(null);

  const totalWaiting = rows.reduce((n, r) => n + r.waitlistCount, 0);
  const outOfStock = rows.filter((r) => !r.inStock || r.stockQuantity === 0).length;

  const submit = (row: AdminInventoryRow) => {
    const raw = drafts[row.id];
    const next = Number(raw);
    if (raw === undefined || raw === "" || !Number.isInteger(next) || next < 0) {
      toast.error("Enter a whole number of units, zero or more.");
      return;
    }

    setBusyId(row.id);
    startTransition(async () => {
      try {
        // Awaited in full: the action does not resolve until the emails have
        // been handed to SMTP, so the toast reports real delivery.
        const report = await updateInventory({ productId: row.id, newQuantity: next });
        setLastReport(report);
        if (report.ok) {
          toast.success(report.message);
          setDrafts((d) => ({ ...d, [row.id]: "" }));
          // revalidatePath ran server-side; refresh pulls the new numbers in.
          router.refresh();
        } else {
          toast.error(report.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastReport({ ok: false, message, error: message });
        toast.error(message);
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <div className="flex-1 bg-slate-50 dark:bg-canvas">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-8 md:py-12">
        <header className="mb-6">
          <p className="m-0 text-[11px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">
            Admin · Inventory
          </p>
          <h1 className="m-0 mt-1.5 text-[26px] font-semibold tracking-[-.04em] md:text-[32px]">Stock levels</h1>
          <p className="m-0 mt-2 max-w-[640px] text-[13px] leading-[1.6] text-slate-600 dark:text-slate-400">
            Setting a product from <strong>0</strong> to any positive number here runs the same dispatcher the CRM
            webhook runs, so everyone on its waitlist is emailed. Editing the row in Prisma Studio does not — that
            writes the number and notifies nobody.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-900/[.1] bg-white/70 px-3 py-1.5 text-[12px] font-semibold dark:border-white/10 dark:bg-white/[.05]">
              <Package size={13} strokeWidth={2.2} />
              {rows.length} products
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/[.1] px-3 py-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
              <PackageX size={13} strokeWidth={2.2} />
              {outOfStock} out of stock
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/[.1] px-3 py-1.5 text-[12px] font-semibold text-blue-700 dark:text-blue-400">
              <BellRing size={13} strokeWidth={2.2} />
              {totalWaiting} waiting
            </span>
          </div>
        </header>

        {lastReport && (
          <div
            data-inventory-report
            className={`mb-5 rounded-[16px] border p-4 text-[12.5px] leading-[1.6] ${
              lastReport.ok
                ? "border-emerald-500/30 bg-emerald-500/[.08] text-emerald-900 dark:text-emerald-200"
                : "border-red-500/30 bg-red-500/[.08] text-red-900 dark:text-red-200"
            }`}
          >
            <div className="font-semibold">{lastReport.message}</div>
            {lastReport.error && (
              <div className="mt-2 rounded-[10px] bg-black/[.06] px-2.5 py-2 font-mono text-[11px] break-all dark:bg-white/[.08]">
                {lastReport.error}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {rows.map((row) => {
            const busy = busyId === row.id && pending;
            const empty = !row.inStock || row.stockQuantity === 0;
            return (
              <div
                key={row.id}
                data-inventory-row={row.sku}
                className={`${CARD} flex flex-col gap-3 p-3.5 md:flex-row md:items-center md:gap-4 md:p-4`}
              >
                <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-[13px] border border-slate-900/[.06] bg-slate-100 dark:border-white/[.06] dark:bg-white/[.05]">
                  {row.imageSrc ? (
                    // See OrderDetailView: the renders are 768x768, the box is
                    // 48 CSS px, so let the optimizer size them down.
                    <Image
                      src={row.imageSrc}
                      alt=""
                      width={48}
                      height={48}
                      sizes="48px"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <Package size={18} strokeWidth={1.8} className="text-slate-400 dark:text-slate-500" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold tracking-[-.02em]">{row.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                    {row.sku} · {row.variant}
                  </div>
                </div>

                <div className="flex flex-none items-center gap-2 md:w-[190px] md:justify-end">
                  <span
                    data-stock-badge
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tabular-nums ${
                      empty
                        ? "border-red-500/30 bg-red-500/[.1] text-red-700 dark:text-red-400"
                        : "border-emerald-500/30 bg-emerald-500/[.1] text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {row.stockQuantity} in stock
                  </span>
                  {row.waitlistCount > 0 && (
                    <span
                      data-waitlist-count
                      title="People who will be emailed when this goes from 0 to a positive number"
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/[.1] px-2.5 py-1 text-[11.5px] font-semibold text-blue-700 tabular-nums dark:text-blue-400"
                    >
                      <BellRing size={12} strokeWidth={2.2} />
                      {row.waitlistCount} waiting
                    </span>
                  )}
                </div>

                <div className="flex flex-none items-center gap-2">
                  <label className="sr-only" htmlFor={`qty-${row.id}`}>
                    New quantity for {row.sku}
                  </label>
                  <input
                    id={`qty-${row.id}`}
                    data-qty-input={row.sku}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder={String(row.stockQuantity)}
                    value={drafts[row.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit(row);
                    }}
                    disabled={busy}
                    className="h-11 w-[84px] rounded-[12px] border border-slate-900/[.14] bg-white/80 px-3 text-center text-[13.5px] font-semibold tabular-nums outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/20 disabled:opacity-60 dark:border-white/[.14] dark:bg-white/[.06]"
                  />
                  <button
                    type="button"
                    onClick={() => submit(row)}
                    disabled={busy}
                    data-update-button={row.sku}
                    className="flex h-11 flex-none items-center justify-center gap-2 rounded-[12px] bg-blue-700 px-4 text-[13px] font-semibold tracking-[-.015em] text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                  >
                    {busy && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
                    {busy ? "Sending…" : "Update"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
