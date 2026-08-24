"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ACCOUNT_ORDERS } from "@/lib/account";
import { useCartStore } from "@/lib/store/cart";
import type { UserOrder } from "@/lib/data";
import type { AccountOrderStatus } from "@/lib/types";
import type { OrderStatus } from "@/lib/generated/prisma/enums";

const MOCK_STATUS_STYLES: Record<AccountOrderStatus, string> = {
  "In Transit":
    "bg-blue-50 text-blue-700 border-blue-700/20 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/25",
  Delivered:
    "bg-slate-100 text-slate-600 border-slate-900/10 dark:bg-white/5 dark:text-slate-400 dark:border-white/10",
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING:
    "bg-amber-50 text-amber-700 border-amber-600/20 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/25",
  IN_TRANSIT:
    "bg-blue-50 text-blue-700 border-blue-700/20 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/25",
  DELIVERED:
    "bg-slate-100 text-slate-600 border-slate-900/10 dark:bg-white/5 dark:text-slate-400 dark:border-white/10",
};

const STATUS_LABEL_KEYS: Record<OrderStatus, string> = {
  PENDING: "statusPending",
  IN_TRANSIT: "statusInTransit",
  DELIVERED: "statusDelivered",
};

const ROW_GRID = "grid-cols-[1.1fr_1fr_1.1fr_.9fr_auto]";

interface OrderHistoryCardProps {
  /** Live Prisma orders; null renders the signed-out placeholder rows. */
  orders: UserOrder[] | null;
}

export default function OrderHistoryCard({ orders }: OrderHistoryCardProps) {
  const t = useTranslations("AccountProfile");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const [reorderedId, setReorderedId] = useState<string | null>(null);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  // Puts every line of a past order back into the live cart at the
  // product's current catalog data (placeOrder re-prices from the DB anyway).
  const reorder = (order: UserOrder) => {
    for (const item of order.items) {
      addItem(
        { sku: item.sku, name: item.productName, variant: item.variant, price: item.priceAtPurchase },
        item.quantity
      );
    }
    setReorderedId(order.id);
  };

  const orderCountLabel = orders?.length ?? ACCOUNT_ORDERS.length;

  return (
    <div
      id="orders"
      className="scroll-mt-[88px] rounded-[22px] border border-white/75 bg-white/68 p-6.5 pb-5.5 shadow-[0_24px_56px_-28px_rgba(15,23,42,0.26)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60"
    >
      <div className="mb-5 flex items-end justify-between gap-5">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em]">{t("orderHistoryTitle")}</h2>
        <span className="text-[12.5px] text-slate-600 dark:text-slate-400">
          {t("viewAll", { count: orderCountLabel })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div
            className={`grid ${ROW_GRID} gap-4 border-b border-slate-900/[.08] pb-3 text-[10.5px] tracking-[.08em] text-slate-400 dark:border-white/[.08] dark:text-slate-500`}
          >
            <span>{t("colOrder")}</span>
            <span>{t("colDate")}</span>
            <span>{t("colStatus")}</span>
            <span className="text-right">{t("colTotal")}</span>
            <span />
          </div>

          {orders ? (
            orders.length > 0 ? (
              orders.map((order) => {
                const isReordered = reorderedId === order.id;
                return (
                  <div
                    key={order.id}
                    className={`grid ${ROW_GRID} items-center gap-4 border-b border-slate-900/[.06] py-3.5 dark:border-white/[.06]`}
                  >
                    <span className="text-[13.5px] font-semibold tracking-[-.01em]">#{order.orderNumber}</span>
                    <span className="text-[13px] text-slate-500 dark:text-slate-400">
                      {format.dateTime(new Date(order.createdAt), { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span
                      className={`justify-self-start rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tracking-[-.01em] ${STATUS_STYLES[order.status]}`}
                    >
                      {t(STATUS_LABEL_KEYS[order.status])}
                    </span>
                    <span className="text-right text-[13.5px] font-semibold tracking-[-.015em]">
                      {eur(order.totalAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => reorder(order)}
                      disabled={isReordered}
                      className={
                        isReordered
                          ? "h-[34px] rounded-[10px] bg-blue-700 px-3.5 text-[12.5px] font-semibold tracking-[-.01em] text-white"
                          : "h-[34px] rounded-[10px] border border-slate-900/[.14] bg-white/85 px-3.5 text-[12.5px] font-semibold tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
                      }
                    >
                      {isReordered ? t("added") : t("reorder")}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-10 text-center text-[13px] text-slate-400 dark:text-slate-500">
                {t("noOrdersYet")}
              </div>
            )
          ) : (
            ACCOUNT_ORDERS.map((order) => (
              <div
                key={order.id}
                className={`grid ${ROW_GRID} items-center gap-4 border-b border-slate-900/[.06] py-3.5 dark:border-white/[.06]`}
              >
                <span className="text-[13.5px] font-semibold tracking-[-.01em]">{order.id}</span>
                <span className="text-[13px] text-slate-500 dark:text-slate-400">{order.date}</span>
                <span
                  className={`justify-self-start rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tracking-[-.01em] ${MOCK_STATUS_STYLES[order.status]}`}
                >
                  {t(order.status === "In Transit" ? "statusInTransit" : "statusDelivered")}
                </span>
                <span className="text-right text-[13.5px] font-semibold tracking-[-.015em]">{order.total}</span>
                <span />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
