"use client";

import { useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { BadgeCheck, Bell, ChevronRight, CircleX, Clock, PackageCheck, Recycle, Settings, ShieldAlert, ShoppingBag, Tag, Truck, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { FeedItem, FeedKind } from "@/lib/notificationFeed";
import { SURFACE } from "./home/ui";

/**
 * /notifications on phones: the account's real events (lib/notificationFeed),
 * newest first. "New" means newer than this device's previous visit — the
 * schema has no read state, so nothing pretends to be unread.
 */

const ICON: Record<FeedKind, typeof Bell> = {
  orderPlaced: ShoppingBag,
  orderPaid: Wallet,
  orderStage: Truck,
  orderCancelled: CircleX,
  fgasVerified: BadgeCheck,
  fgasRejected: ShieldAlert,
  fgasPending: Clock,
  fgasExpired: ShieldAlert,
  fgasExpiring: ShieldAlert,
  priceAlert: Tag,
  backInStock: PackageCheck,
  returnStatus: Recycle,
};
const TONE: Partial<Record<FeedKind, string>> = {
  orderPaid: "text-emerald-600 dark:text-emerald-400",
  fgasVerified: "text-emerald-600 dark:text-emerald-400",
  backInStock: "text-emerald-600 dark:text-emerald-400",
  orderCancelled: "text-red-600 dark:text-red-400",
  fgasRejected: "text-red-600 dark:text-red-400",
  fgasExpired: "text-red-600 dark:text-red-400",
  fgasExpiring: "text-amber-600 dark:text-amber-400",
};
const SEEN_KEY = "me-notifications-seen";

// The previous visit, read once per page load — and this visit recorded in its
// place. Server snapshot null: nothing is "new" until the browser knows.
let previousVisit: string | undefined;
const noSubscribe = () => () => undefined;
function readPreviousVisit(): string {
  if (previousVisit === undefined) {
    try {
      previousVisit = localStorage.getItem(SEEN_KEY) ?? "";
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      previousVisit = "";
    }
  }
  return previousVisit;
}

/** `now`: the server's clock at render, so the relative times hydrate identically. */
export default function NotificationsFeed({ items, now }: { items: FeedItem[]; now: string }) {
  const t = useTranslations("NotifFeed");
  const td = useTranslations("Dashboard");
  const format = useFormatter();
  const seenBefore = useSyncExternalStore<string | null>(noSubscribe, readPreviousVisit, () => null);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  const stageLabel = (s: string) =>
    td(({ ADR_PACKING: "stageAdrPacking", DISPATCHED: "dispatched", IN_TRANSIT: "inTransit", OUT_FOR_DELIVERY: "stageOutForDelivery", READY_FOR_PICKUP: "stageReadyForPickup", DELIVERED: "delivered" } as Record<string, string>)[s] ?? "stageOrderPlaced");
  const text = (i: FeedItem): { title: string; body: string } => {
    const v = i.v;
    switch (i.kind) {
      case "orderPlaced":
        return { title: t("orderPlaced", { number: String(v.number) }), body: t("orderPlacedBody", { lines: Number(v.lines), total: eur(Number(v.total)) }) };
      case "orderPaid":
        return { title: t("orderPaid", { number: String(v.number) }), body: eur(Number(v.total)) };
      case "orderStage":
        return { title: t("orderStage", { number: String(v.number), stage: stageLabel(String(v.stage)) }), body: v.stage === "DELIVERED" ? "" : t("eta", { date: date(String(v.eta)) }) };
      case "orderCancelled":
        return { title: t("orderCancelled", { number: String(v.number) }), body: "" };
      case "fgasExpiring":
        return { title: t("fgasExpiring", { date: date(String(v.date)) }), body: t("fgasExpiringBody", { days: Number(v.days) }) };
      case "priceAlert":
        return { title: t("priceAlert", { gas: String(v.gas) }), body: t("priceAlertBody", { target: eur(Number(v.target)) }) };
      case "backInStock":
        return { title: t("backInStock", { name: String(v.name) }), body: "" };
      case "returnStatus":
        return { title: t(`return_${String(v.status)}`, { count: Number(v.quantity) }), body: "" };
      default:
        return { title: t(i.kind), body: String(v.reason ?? "") };
    }
  };

  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:px-8 sm:pt-9" data-notifications-feed>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("title")}</h1>
          <p className="m-0 mt-2 text-[14px] text-slate-500 dark:text-ink-muted">{t("lead")}</p>
        </div>
        <Link href="/profile/settings" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 text-[13px] font-semibold text-slate-800 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100" data-notifications-settings>
          <Settings size={14} strokeWidth={2} />
          {t("settings")}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-900/[.14] px-6 py-12 text-center dark:border-white/[.14]" data-notifications-empty>
          <Bell size={26} strokeWidth={1.7} className="mx-auto text-slate-400" />
          <p className="m-0 mt-3 text-[14px] font-semibold">{t("emptyTitle")}</p>
          <p className="m-0 mt-1 text-[13px] text-slate-500 dark:text-ink-muted">{t("emptyBody")}</p>
        </div>
      ) : (
        <ul className={`m-0 list-none p-0 ${SURFACE} divide-y divide-slate-900/[.06] dark:divide-white/[.06]`}>
          {items.map((i) => {
            const Icon = ICON[i.kind];
            const { title, body } = text(i);
            const isNew = seenBefore !== null && seenBefore !== "" && i.at > seenBefore;
            return (
              <li key={i.id}>
                <Link href={i.href} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-900/[.03] sm:px-5 dark:hover:bg-white/[.04]" data-feed-item={i.kind} data-feed-new={isNew ? "1" : "0"}>
                  <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-[11px] border border-slate-900/[.08] bg-slate-50 dark:border-white/[.1] dark:bg-white/[.05] ${TONE[i.kind] ?? "text-slate-600 dark:text-slate-300"}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-[14px] font-semibold leading-[1.35] tracking-[-.01em]">{title}</span>
                      {isNew && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-600" aria-label={t("new")} />}
                    </span>
                    {body && <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-slate-500 dark:text-ink-muted">{body}</span>}
                    <span className="mt-1 block text-[11.5px] text-slate-400 dark:text-ink-muted">{format.relativeTime(new Date(i.at), new Date(now))}</span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="mt-2.5 flex-none text-slate-300 dark:text-slate-600" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
