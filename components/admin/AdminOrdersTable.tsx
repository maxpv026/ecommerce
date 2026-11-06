"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, Check, ChevronDown, CircleDollarSign, Clock, FileText, Loader2, PackageCheck, Search, Truck, Undo2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { cancelUnpaidOrder, markOrderPaidByAdmin, updateOrderStatus } from "@/lib/actions/adminOrders";
import type { AdminOrderFilter, AdminOrderRow, AdminOrdersPage, OrderStage } from "@/lib/adminOrders";

/**
 * Admin → Orders. URL-driven (?filter, ?q, ?page), like Admin → Users.
 * Buttons appear only for the moves lib/actions/adminOrders allows from the
 * row's state, and every action re-checks that state on the server.
 */

const CARD = "rounded-[22px] border border-slate-900/[.08] bg-white dark:border-white/[.08] dark:bg-surface";

const FILTERS: Array<{ id: AdminOrderFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "awaiting_payment", label: "Awaiting payment" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

const STAGE: Record<OrderStage, { label: string; icon: typeof Clock; tone: string }> = {
  awaiting_payment: { label: "Awaiting payment", icon: Clock, tone: "border-amber-600/25 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300" },
  processing: { label: "Processing", icon: PackageCheck, tone: "border-blue-600/25 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-300" },
  shipped: { label: "Shipped", icon: Truck, tone: "border-cyan-600/25 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300" },
  delivered: { label: "Delivered", icon: Check, tone: "border-emerald-600/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", icon: Ban, tone: "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[.05] dark:text-slate-400" },
};

type Dialog =
  | { kind: "ship"; order: AdminOrderRow }
  | { kind: "deliver"; order: AdminOrderRow }
  | { kind: "paid"; order: AdminOrderRow }
  | { kind: "cancel"; order: AdminOrderRow }
  | { kind: "undo"; order: AdminOrderRow; to: "PENDING" | "IN_TRANSIT" };

const eur = (n: number) => n.toLocaleString("en-IE", { style: "currency", currency: "EUR" });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function AdminOrdersTable({ data, filter, query }: { data: AdminOrdersPage; filter: AdminOrderFilter; query: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [tracking, setTracking] = useState("");
  const [pending, startTransition] = useTransition();

  const href = (next: { filter?: AdminOrderFilter; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    const q = next.q ?? query;
    if (f !== "all") params.set("filter", f);
    if (q) params.set("q", q);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const s = params.toString();
    return `/admin/orders${s ? `?${s}` : ""}`;
  };

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => {
    startTransition(async () => {
      const result = await action().catch(() => null);
      if (!result?.ok) {
        toast.error(result?.ok === false ? result.error : "Couldn't save the change.");
        return;
      }
      toast.success(success);
      setDialog(null);
      setTracking("");
      router.refresh();
    });
  };

  const confirm = () => {
    if (!dialog) return;
    const o = dialog.order;
    if (dialog.kind === "ship") run(() => updateOrderStatus(o.id, "IN_TRANSIT", tracking), `${o.orderNumber} marked shipped.`);
    if (dialog.kind === "deliver") run(() => updateOrderStatus(o.id, "DELIVERED"), `${o.orderNumber} marked delivered.`);
    if (dialog.kind === "paid") run(() => markOrderPaidByAdmin(o.id), `Payment recorded for ${o.orderNumber}.`);
    if (dialog.kind === "cancel") run(() => cancelUnpaidOrder(o.id), `${o.orderNumber} cancelled and restocked.`);
    if (dialog.kind === "undo") run(() => updateOrderStatus(o.id, dialog.to), `${o.orderNumber} moved back.`);
  };

  const actionsFor = (o: AdminOrderRow) => {
    const btn = "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-semibold";
    switch (o.stage) {
      case "awaiting_payment":
        return (
          <>
            <button type="button" data-action="paid" onClick={() => setDialog({ kind: "paid", order: o })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <CircleDollarSign size={13} /> Mark paid
            </button>
            <button type="button" data-action="cancel" onClick={() => setDialog({ kind: "cancel", order: o })} className={`${btn} border border-red-600/30 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-400/10`}>
              <Ban size={13} /> Cancel
            </button>
          </>
        );
      case "processing":
        return (
          <button type="button" data-action="ship" onClick={() => { setTracking(o.trackingNumber ?? ""); setDialog({ kind: "ship", order: o }); }} className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>
            <Truck size={13} /> Mark shipped
          </button>
        );
      case "shipped":
        return (
          <button type="button" data-action="deliver" onClick={() => setDialog({ kind: "deliver", order: o })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            <Check size={13} /> Mark delivered
          </button>
        );
      default:
        return <span className="text-[12px] text-slate-400">—</span>;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <Link
                key={f.id}
                href={href({ filter: f.id, page: 1 })}
                role="tab"
                aria-selected={on}
                data-filter={f.id}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors ${
                  on ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.12] text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-300 dark:hover:bg-white/[.06]"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/15" : "bg-slate-900/[.06] dark:bg-white/[.08]"}`}>{data.counts[f.id]}</span>
              </Link>
            );
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); router.replace(href({ q: search.trim(), page: 1 })); }} className="relative w-full sm:w-[300px]">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order no., email, company, tracking"
            aria-label="Search orders"
            data-order-search
            className="h-10 w-full rounded-[12px] border border-slate-900/[.12] bg-white pl-10 pr-3 text-[13px] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.03]"
          />
        </form>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="bg-[#0B1020] text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-400">
                <th className="px-5 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Next step</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">
                    No orders match{query ? ` “${query}”` : " this filter"}.
                  </td>
                </tr>
              )}
              {data.rows.map((o) => {
                const s = STAGE[o.stage];
                const expanded = open === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr className="border-t border-slate-900/[.06] align-top dark:border-white/[.06]" data-order-row={o.orderNumber}>
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => setOpen(expanded ? null : o.id)} aria-expanded={expanded} className="flex items-start gap-2 text-left">
                          <ChevronDown size={14} className={`mt-1 flex-none text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          <span>
                            <span className="block font-mono text-[12.5px] font-semibold">{o.orderNumber}</span>
                            <span className="block text-[11.5px] text-slate-400">{day(o.createdAt)}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-[12.5px]">
                        <span className="block font-medium">{o.customer.companyName ?? o.customer.name ?? "—"}</span>
                        <span className="block text-slate-500 dark:text-slate-400">{o.customer.email}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="block text-[13.5px] font-semibold tabular-nums">{eur(o.totalAmount)}</span>
                        <span className="block text-[11px] text-slate-400">
                          {o.paymentStatus === "PAID" ? `Paid ${day(o.paidAt)}` : o.paymentStatus === "FAILED" ? "Not paid" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.tone}`} data-order-stage={o.stage}>
                          <s.icon size={12} strokeWidth={2.2} />
                          {s.label}
                        </span>
                        {o.stage === "shipped" && o.paymentStatus === "PENDING" && (
                          <span className="ml-1.5 rounded-full border border-amber-600/25 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unpaid</span>
                        )}
                        {o.trackingNumber && <span className="mt-1 block font-mono text-[11px] text-slate-400">DHL {o.trackingNumber}</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">{actionsFor(o)}</div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/70 dark:bg-white/[.02]" data-order-details={o.orderNumber}>
                        <td colSpan={5} className="px-5 pb-5 pt-1">
                          <div className="grid gap-5 md:grid-cols-[1.6fr_1fr]">
                            <table className="w-full border-collapse text-[12.5px]">
                              <thead>
                                <tr className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">
                                  <th className="py-1.5 text-left font-semibold">Item</th>
                                  <th className="py-1.5 text-right font-semibold">Qty</th>
                                  <th className="py-1.5 text-right font-semibold">Unit</th>
                                  <th className="py-1.5 text-right font-semibold">Deposit</th>
                                  <th className="py-1.5 text-right font-semibold">Line</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((i) => (
                                  <tr key={i.id} className="border-t border-slate-900/[.05] dark:border-white/[.05]">
                                    <td className="py-1.5">
                                      <span className="font-medium">{i.name}</span> <span className="font-mono text-[11px] text-slate-400">{i.sku}</span>
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">{i.quantity}</td>
                                    <td className="py-1.5 text-right tabular-nums">{eur(i.unitPrice)}</td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">{i.deposit > 0 ? eur(i.deposit) : "—"}</td>
                                    <td className="py-1.5 text-right font-semibold tabular-nums">{eur((i.unitPrice + i.deposit) * i.quantity)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
                              <div className="col-span-2">
                                <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">Ship to</dt>
                                <dd className="m-0 mt-0.5 whitespace-pre-line">{o.shippingAddress ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">Payment</dt>
                                <dd className="m-0 mt-0.5">{o.paymentMethod ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">Est. delivery</dt>
                                <dd className="m-0 mt-0.5">{day(o.estimatedDelivery)}</dd>
                              </div>
                              <div>
                                <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">VAT</dt>
                                <dd className="m-0 mt-0.5 font-mono text-[11.5px]">{o.customer.vatNumber ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">Invoice</dt>
                                <dd className="m-0 mt-0.5">
                                  {o.invoice ? (
                                    // Plain <a>: /api isn't locale-prefixed. Admins may download any invoice.
                                    <a href={`/api/invoices/${o.invoice.id}/download`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-400">
                                      <FileText size={12} /> {o.invoice.invoiceNumber}
                                    </a>
                                  ) : "—"}
                                  {o.invoice && <span className="ml-1 text-[11px] text-slate-400">({o.invoice.status.toLowerCase()})</span>}
                                </dd>
                              </div>
                              {(o.stage === "shipped" || o.stage === "delivered") && (
                                <div className="col-span-2">
                                  <button
                                    type="button"
                                    data-action="undo"
                                    onClick={() => setDialog({ kind: "undo", order: o, to: o.stage === "delivered" ? "IN_TRANSIT" : "PENDING" })}
                                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                  >
                                    <Undo2 size={13} />
                                    Move back to {o.stage === "delivered" ? "Shipped" : "Processing"}
                                  </button>
                                </div>
                              )}
                            </dl>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-900/[.06] px-5 py-3 text-[12.5px] dark:border-white/[.06]">
            <span className="text-slate-500 dark:text-slate-400">Page {data.page} of {data.pageCount} · {data.total} orders</span>
            <div className="flex gap-2">
              {data.page > 1 && <Link href={href({ page: data.page - 1 })} className="rounded-[10px] border border-slate-900/[.12] px-3 py-1.5 font-semibold dark:border-white/[.12]">Previous</Link>}
              {data.page < data.pageCount && <Link href={href({ page: data.page + 1 })} className="rounded-[10px] border border-slate-900/[.12] px-3 py-1.5 font-semibold dark:border-white/[.12]">Next</Link>}
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="order-dialog-title" onClick={() => !pending && setDialog(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[460px] max-w-full rounded-[24px] bg-white p-7 shadow-2xl dark:bg-surface" data-order-dialog={dialog.kind}>
            <h3 id="order-dialog-title" className="m-0 text-[19px] font-semibold tracking-[-.03em]">
              {dialog.kind === "ship" && `Ship ${dialog.order.orderNumber}`}
              {dialog.kind === "deliver" && `Mark ${dialog.order.orderNumber} delivered?`}
              {dialog.kind === "paid" && `Record payment for ${dialog.order.orderNumber}?`}
              {dialog.kind === "cancel" && `Cancel ${dialog.order.orderNumber}?`}
              {dialog.kind === "undo" && `Move ${dialog.order.orderNumber} back?`}
            </h3>
            <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-slate-600 dark:text-slate-400">
              {dialog.kind === "ship" && "The customer's order page will show live DHL tracking for this number."}
              {dialog.kind === "ship" && dialog.order.paymentStatus === "PENDING" && " This order hasn't been paid yet."}
              {dialog.kind === "deliver" && "Confirms the cylinders have reached the customer."}
              {dialog.kind === "paid" && `Confirms ${eur(dialog.order.totalAmount)} has arrived. The order moves to Processing and the invoice is marked paid.`}
              {dialog.kind === "cancel" && "The reserved cylinders go back into stock, the invoice is cancelled and the cylinders are booked back on the customer's deposit ledger. This can't be undone."}
              {dialog.kind === "undo" && `Corrects a mistaken step: the order goes back to ${dialog.to === "PENDING" ? "Processing" : "Shipped"}.`}
            </p>
            {dialog.kind === "ship" && (
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="DHL tracking number"
                autoFocus
                data-tracking-input
                className="mt-4 h-11 w-full rounded-[12px] border border-slate-900/[.12] bg-slate-50 px-3.5 font-mono text-[13.5px] uppercase focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.03]"
              />
            )}
            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" disabled={pending} onClick={() => setDialog(null)} className="h-11 rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.14]">
                Back
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending || (dialog.kind === "ship" && tracking.replace(/\s+/g, "").length < 8)}
                data-confirm-order-action
                className={`inline-flex h-11 items-center gap-2 rounded-[14px] px-5 text-[13.5px] font-semibold text-white disabled:opacity-50 ${dialog.kind === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-blue-700 hover:bg-blue-800"}`}
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                {dialog.kind === "ship" ? "Mark shipped" : dialog.kind === "cancel" ? "Cancel order" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
