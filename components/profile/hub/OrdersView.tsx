"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, FileDown, RotateCw, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MicroBadge, ICON_TILE, ROW_ACTION_DONE, ROW_ACTION_GHOST, SURFACE, type BadgeTone } from "@/components/home/ui";
import { cartLineFromOrderItem, useCartStore } from "@/lib/store/cart";
import { STAGE_LABEL_KEY, STEP_LABEL_KEY, type OrderTrackingView } from "@/lib/tracking";
import type { UserOrder } from "@/lib/data";
import { EmptyRow, SurfaceHead } from "./parts";

const COLLAPSED = 8;

/** Who carries it, in words a buyer recognises: "DHL · JD014…", "DB Schenker", "Own ADR vehicle", "Warehouse pickup". */
function carrierLine(tr: OrderTrackingView | undefined, tc: (k: string) => string): string {
  if (!tr) return "—";
  if (tr.method === "PICKUP") return tc("methodPickup");
  if (tr.method === "OWN_FLEET") return [tc("methodOwnFleet"), tr.fleet?.vehiclePlate].filter(Boolean).join(" · ");
  const name = tr.carrier?.name || (tr.method === "DHL" ? tc("methodDhl") : null);
  return [name, tr.carrier?.trackingNumber].filter(Boolean).join(" · ") || "—";
}

const stageTone = (stage: string): BadgeTone => (stage === "DELIVERED" ? "ok" : stage === "ORDER_PLACED" ? "warn" : "info");

export default function OrdersView({ orders, tracking }: { orders: UserOrder[]; tracking: Record<string, OrderTrackingView> }) {
  const t = useTranslations("ProfileHub");
  const tc = useTranslations("Checkout");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [repeated, setRepeated] = useState<string | null>(null);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const shown = all ? orders : orders.slice(0, COLLAPSED);
  const spent = orders.filter((o) => o.paymentStatus !== "FAILED").reduce((n, o) => n + o.totalAmount, 0);

  const repeat = (order: UserOrder) => {
    for (const item of order.items) addItem(cartLineFromOrderItem(item), item.quantity);
    setRepeated(order.id);
    window.setTimeout(() => setRepeated((r) => (r === order.id ? null : r)), 1800);
  };

  return (
    <div className={SURFACE} data-profile-orders>
      <SurfaceHead title={t("ordersTitle")} meta={[t("ordersCount", { count: orders.length }), orders.length ? t("ordersSpent", { amount: eur(spent) }) : null]} id="orders">
        <Link href="/profile/orders" className={ROW_ACTION_GHOST}>
          {t("ordersAll")}
          <ArrowRight size={14} strokeWidth={2.4} />
        </Link>
      </SurfaceHead>
      {orders.length === 0 ? (
        <EmptyRow>{t("ordersEmpty")}</EmptyRow>
      ) : (
        shown.map((order) => {
          const tr = tracking[order.id];
          const steps = tr?.steps ?? [];
          const reached = steps.filter((s) => s.state !== "upcoming").length;
          const stage = tr?.stage ?? "ORDER_PLACED";
          const expanded = open === order.id;
          const cylinders = order.items.reduce((n, i) => n + i.quantity, 0);
          return (
            <div key={order.id} className="border-b border-slate-900/[.06] last:border-b-0 dark:border-white/[.06]" data-order-row={order.orderNumber}>
              <div className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-4">
                <span className={ICON_TILE}>
                  <Truck size={17} strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/profile/orders/${order.id}`} className="font-mono text-[13.5px] font-semibold hover:text-blue-700 dark:hover:text-blue-400">
                      {order.orderNumber}
                    </Link>
                    <MicroBadge tone={stageTone(stage)} data-order-stage={stage}>
                      {tc(STAGE_LABEL_KEY[stage])}
                    </MicroBadge>
                    {order.paymentStatus === "PENDING" && <MicroBadge tone="warn">{t("unpaid")}</MicroBadge>}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
                    {day(order.createdAt)} · {t("cylindersCount", { count: cylinders })} · <span data-order-carrier>{carrierLine(tr, tc)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1" aria-hidden data-order-progress={reached}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={`h-1.5 w-8 rounded-full ${i < reached ? (stage === "DELIVERED" ? "bg-emerald-500" : "bg-blue-600") : "bg-slate-900/[.1] dark:bg-white/[.12]"}`} />
                    ))}
                  </div>
                </div>
                <div className="text-right text-[15px] font-semibold tabular-nums tracking-[-.02em]">{eur(order.totalAmount)}</div>
                <div className="flex items-center gap-1.5">
                  {order.invoiceId && (
                    <a href={`/api/invoices/${order.invoiceId}/download`} className={ROW_ACTION_GHOST} data-order-invoice title={t("invoicePdf")}>
                      <FileDown size={14} strokeWidth={2.2} />
                      PDF
                    </a>
                  )}
                  <button type="button" onClick={() => repeat(order)} data-order-repeat className={repeated === order.id ? ROW_ACTION_DONE : ROW_ACTION_GHOST}>
                    {repeated === order.id ? <Check size={14} strokeWidth={2.6} /> : <RotateCw size={14} strokeWidth={2.2} />}
                    {repeated === order.id ? t("addedToCart") : t("repeat")}
                  </button>
                  <button type="button" onClick={() => setOpen(expanded ? null : order.id)} aria-expanded={expanded} aria-label={t("orderDetails")} data-order-toggle className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/[.05] dark:hover:bg-white/[.08]">
                    <ChevronDown size={16} strokeWidth={2.2} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
              {expanded && (
                <div className="grid grid-cols-[1.2fr_1fr] gap-6 border-t border-slate-900/[.06] bg-slate-900/[.015] px-5 py-4 dark:border-white/[.06] dark:bg-white/[.02]" data-order-details>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="min-w-0 truncate">
                          <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.productName} <span className="text-slate-500 dark:text-ink-muted">· {item.variant}</span>
                        </span>
                        <span className="flex-none font-semibold tabular-nums">{eur(item.priceAtPurchase * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {steps.map((s) => (
                      <li key={s.key} className={`flex items-center gap-2 text-[12.5px] ${s.state === "upcoming" ? "text-slate-400 dark:text-slate-500" : ""}`}>
                        <span className={`h-2 w-2 flex-none rounded-full ${s.state === "upcoming" ? "bg-slate-900/[.15] dark:bg-white/[.15]" : s.state === "current" ? "bg-blue-600" : "bg-emerald-500"}`} />
                        <span className="min-w-0 flex-1 truncate">{tc(STEP_LABEL_KEY[s.label])}</span>
                        {s.timestamp && <span className="flex-none text-[11px] text-slate-500 tabular-nums dark:text-ink-muted">{format.dateTime(new Date(s.timestamp), { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })
      )}
      {orders.length > COLLAPSED && (
        <button type="button" onClick={() => setAll((v) => !v)} className="flex w-full items-center justify-center gap-1.5 border-t border-slate-900/[.06] py-3 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-900/[.02] dark:border-white/[.06] dark:text-slate-300 dark:hover:bg-white/[.03]" data-orders-more>
          {all ? t("showFewer") : t("showAll", { count: orders.length })}
          <ChevronDown size={14} className={all ? "rotate-180" : ""} />
        </button>
      )}
    </div>
  );
}
