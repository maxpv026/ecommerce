"use client";

import { useState } from "react";
import { useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, ChevronLeft, MapPin, RefreshCw, Search } from "lucide-react";
import type { UserOrder } from "@/lib/data";
import type { OrderStatus } from "@/lib/generated/prisma/enums";

type OrdersTab = "active" | "completed";
type StepState = "done" | "active" | "pending";

interface MobileOrdersLayoutProps {
  initialTab?: OrdersTab;
  orders: UserOrder[];
  recipientName: string;
}

function statusLabel(status: OrderStatus): string {
  if (status === "PENDING") return "Pending";
  if (status === "IN_TRANSIT") return "In Transit";
  return "Delivered";
}

function buildSteps(status: OrderStatus): { label: string; state: StepState }[] {
  return [
    { label: "Order Placed", state: "done" },
    { label: "Processing", state: status === "PENDING" ? "active" : "done" },
    {
      label: "Out for Delivery",
      state: status === "IN_TRANSIT" ? "active" : status === "DELIVERED" ? "done" : "pending",
    },
    { label: "Delivered", state: status === "DELIVERED" ? "done" : "pending" },
  ];
}

function itemSummary(order: UserOrder): string {
  if (order.items.length === 0) return "";
  const [first, ...rest] = order.items;
  const restCount = rest.reduce((sum, i) => sum + i.quantity, 0);
  const suffix = restCount > 0 ? ` +${restCount} more` : "";
  return `${first.quantity}× ${first.productName}${suffix}`;
}

export default function MobileOrdersLayout({ initialTab = "active", orders, recipientName }: MobileOrdersLayoutProps) {
  const format = useFormatter();
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const [tab, setTab] = useState<OrdersTab>(initialTab);
  const [reorderedId, setReorderedId] = useState<string | null>(null);
  const isActive = tab === "active";

  const activeOrders = orders.filter((o) => o.status !== "DELIVERED");
  const completedOrders = orders.filter((o) => o.status === "DELIVERED");
  const featuredActive = activeOrders[0];

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header + tabs: ambient mesh gradient strictly at the top */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_56%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_56%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[180px] h-[410px] w-[410px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-50 blur-[82px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.5]" />
          <div className="absolute -right-[110px] -top-[150px] h-[370px] w-[370px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.46] blur-[82px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.44]" />
          <div className="absolute -top-[130px] left-[32%] h-[290px] w-[290px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-50 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.16]" />
        </div>

        <div className="relative px-4 pb-2.5 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              aria-label="Back to Profile"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </Link>
            <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">Orders</span>
            <Link
              href="/search"
              aria-label="Search orders"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Search size={19} strokeWidth={2} />
            </Link>
          </div>

          <div className="relative mt-4 grid grid-cols-2 rounded-full border border-white/70 bg-white/52 p-[3px] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/50">
            <div
              className="absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.16)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] dark:bg-slate-800"
              style={{ transform: isActive ? "translateX(0)" : "translateX(100%)" }}
            />
            <button
              type="button"
              onClick={() => setTab("active")}
              className={`relative z-10 h-9 rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors ${
                isActive ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Active ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("completed")}
              className={`relative z-10 h-9 rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors ${
                !isActive ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Completed
            </button>
          </div>
        </div>
      </div>

      <div className="pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {isActive && featuredActive && (
          <div className="px-4 pt-6">
            <div className="rounded-[26px] border border-slate-900/[.05] bg-white p-5 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.45)] dark:border-white/[.06] dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold tracking-[-.02em]">{featuredActive.orderNumber}</span>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-50 px-2.5 py-[5px] text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
                  <span className="h-[5px] w-[5px] rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  {statusLabel(featuredActive.status)}
                </span>
              </div>
              <div className="mt-1.5 text-[12px] text-slate-400 dark:text-slate-500">
                Delivered to {recipientName}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-700/[.12] bg-blue-50 px-[15px] py-3.5 dark:border-blue-400/20 dark:bg-blue-950/60">
                <div className="text-[10.5px] tracking-[.07em] text-blue-700 dark:text-blue-400">
                  ESTIMATED DELIVERY
                </div>
                <div className="mt-[5px] text-[15px] font-semibold tracking-[-.025em]">
                  {format.dateTime(new Date(featuredActive.estimatedDelivery), { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                {buildSteps(featuredActive.status).map((step, idx, steps) => {
                  const isLast = idx === steps.length - 1;
                  const done = step.state === "done";
                  const live = step.state === "active";
                  return (
                    <div key={step.label} className="flex gap-3.5">
                      <div className="flex w-[22px] flex-none flex-col items-center">
                        <span
                          className={`relative flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full ${
                            done || live ? "bg-blue-700" : "bg-slate-200 dark:bg-white/15"
                          }`}
                          style={live ? { boxShadow: "0 0 0 4px rgba(29,78,216,.12)" } : undefined}
                        >
                          {live && <span className="absolute inset-0 animate-ping rounded-full bg-blue-700" />}
                          {done && <Check size={10} strokeWidth={3.4} className="relative text-white" />}
                        </span>
                        {!isLast && (
                          <span
                            className={`mt-[3px] min-h-[26px] w-0.5 flex-1 rounded-full ${
                              done ? "bg-blue-700" : "bg-slate-200 dark:bg-white/15"
                            }`}
                          />
                        )}
                      </div>
                      <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-4.5"}`}>
                        <div
                          className={`text-[13.5px] font-semibold tracking-[-.02em] ${
                            step.state === "pending" ? "text-slate-400 dark:text-slate-500" : ""
                          }`}
                        >
                          {step.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-slate-900/[.05] bg-slate-50 p-3 dark:border-white/[.06] dark:bg-white/[.03]">
                <div className="relative flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5">
                  <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.04)_0_1px,transparent_1px_7px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.035)_0_1px,transparent_1px_7px)]" />
                  <div className="relative h-[62%] w-[36%] rounded-t-[20px] rounded-b-[5px] border border-dashed border-slate-900/[.22] bg-white/82 dark:border-white/20 dark:bg-white/10" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold tracking-[-.02em]">{itemSummary(featuredActive)}</div>
                  <div className="mt-[3px] text-[11.5px] text-slate-400 dark:text-slate-500">
                    {formatEur(featuredActive.totalAmount)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
              >
                <MapPin size={17} strokeWidth={2} />
                Live Tracking
              </button>
            </div>
          </div>
        )}

        {isActive && activeOrders.length === 0 && (
          <div className="px-4 pt-10 text-center text-[13.5px] text-slate-400 dark:text-slate-500">
            No active shipments right now.
          </div>
        )}

        <div className="px-4 pt-6">
          <div className="mb-2.5 px-1.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
            {isActive ? "PAST ORDERS" : "COMPLETED ORDERS"}
          </div>
          {completedOrders.length === 0 ? (
            <div className="py-10 text-center text-[13.5px] text-slate-400 dark:text-slate-500">
              No completed orders yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {completedOrders.map((order) => {
                const done = reorderedId === order.id;
                const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);
                return (
                  <div
                    key={order.id}
                    className="rounded-[20px] border border-slate-900/[.05] bg-white p-4 shadow-[0_8px_22px_-20px_rgba(15,23,42,0.4)] dark:border-white/[.06] dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold tracking-[-.02em]">{order.orderNumber}</div>
                        <div className="mt-1 text-[11.5px] text-slate-400 dark:text-slate-500">
                          {format.dateTime(new Date(order.createdAt), { dateStyle: "medium" })} ·{" "}
                          {totalQty} {totalQty === 1 ? "cylinder" : "cylinders"}
                        </div>
                      </div>
                      <span className="flex flex-none items-center rounded-full border border-slate-900/[.08] bg-slate-100 px-2.5 py-[5px] text-[10.5px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[.07] dark:text-slate-400">
                        Delivered
                      </span>
                    </div>
                    <div className="mt-3.5 flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold tracking-[-.035em] tabular-nums">
                        {formatEur(order.totalAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReorderedId(order.id)}
                        disabled={done}
                        className={`flex h-10 flex-none items-center justify-center gap-[7px] rounded-[13px] px-[15px] text-[12.5px] font-semibold tracking-[-.01em] transition-colors ${
                          done
                            ? "bg-blue-700 text-white"
                            : "border-[1.5px] border-blue-700/35 bg-white text-blue-700 hover:border-blue-700/60 dark:bg-transparent dark:text-blue-400"
                        }`}
                      >
                        <RefreshCw size={14} strokeWidth={2.2} />
                        {done ? "Added" : "Quick Reorder"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
