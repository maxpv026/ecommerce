import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, BadgeCheck, Boxes, Headset, Receipt, Send, ShoppingBag, Users, Wallet } from "lucide-react";
import prisma from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { getAccountingReport } from "@/lib/admin/accounting";
import { LISTED } from "@/lib/productFamily";
import { can } from "@/lib/rbac";
import { botToken } from "@/lib/telegram/api";

export const metadata: Metadata = {
  title: "Admin — My Energy",
  description: "My Energy administration.",
};

/** A product at or below this many units on hand is "low stock". */
const LOW_STOCK = 5;

type Href = "/admin/orders" | "/admin/inventory" | "/admin/users" | "/admin/support" | "/admin/analytics";

function Card({ icon: Icon, label, value, note, href, testid }: { icon: typeof Users; label: string; value: ReactNode; note?: string; href?: Href; testid: string }) {
  const body = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-900/[.08] bg-slate-50 text-slate-600 dark:border-white/[.08] dark:bg-white/[.04] dark:text-slate-300">
        <Icon size={16} />
      </span>
      <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="mt-0.5 block font-mono text-[22px] font-semibold tabular-nums tracking-[-.02em] text-slate-900 dark:text-white">{value}</span>
      {note && <span className="mt-0.5 block text-[11.5px] text-slate-500 dark:text-slate-400">{note}</span>}
      {href && <ArrowRight size={14} className="absolute right-4 top-4 text-slate-300 transition-colors group-hover:text-blue-600" />}
    </>
  );
  const cls = "group relative block rounded-[22px] border border-slate-900/[.08] bg-white/80 p-4 dark:border-white/[.08] dark:bg-white/[.03]";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-blue-600/30`} data-overview-card={testid}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-overview-card={testid}>
      {body}
    </div>
  );
}

/**
 * /admin — one overview, shaped by role (lib/rbac):
 *   operations (SUPER_ADMIN, ADMIN): what needs doing today;
 *   finance (SUPER_ADMIN, ACCOUNTANT): the last 30 days in money.
 * Every card links only to a section the viewer may open.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const admin = await guardAdmin(params, "dashboard.view");
  const [t, tRole, format] = await Promise.all([getTranslations("AdminOverview"), getTranslations("AdminRbac"), getFormatter()]);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const showOps = can(admin.role, "orders.manage");
  const showFinance = can(admin.role, "analytics.view");

  const showTelegram = can(admin.role, "telegram.link");

  const [ops, finance, totals, tg, tTg] = await Promise.all([
    showOps
      ? Promise.all([
          prisma.order.count({ where: { status: "PENDING", paymentStatus: { not: "FAILED" } } }),
          prisma.order.count({ where: { paymentStatus: "PENDING" } }),
          prisma.product.count({ where: { ...LISTED, stockQuantity: { lte: LOW_STOCK } } }),
          prisma.user.count({ where: { OR: [{ fGasStatus: "PENDING_REVIEW" }, { fGasPendingSubmissionId: { not: null } }] } }),
          prisma.chatSession.count({ where: { status: "ESCALATED_TO_HUMAN" } }),
        ])
      : null,
    showFinance ? getAccountingReport(30) : null,
    admin.role === "SUPER_ADMIN" ? Promise.all([prisma.user.count(), prisma.order.count()]) : null,
    showTelegram ? prisma.user.findUnique({ where: { id: admin.adminId }, select: { telegramChatId: true, telegramUsername: true } }) : null,
    getTranslations("AdminTelegram"),
  ]);
  const tgState = !botToken() ? "unconfigured" : tg?.telegramChatId ? "linked" : "unlinked";

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-8" data-admin-overview data-role={admin.role}>
      <header className="mb-8">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[.09em] text-slate-400">{tRole(`badge_${admin.role}`)}</p>
        <h1 className="m-0 mt-1.5 text-[32px] font-semibold leading-[1.1] tracking-[-.04em] text-slate-900 dark:text-white">{t("title")}</h1>
        <p className="m-0 mt-1.5 text-[13.5px] text-slate-500 dark:text-slate-400">{t("welcome", { name: admin.name })}</p>
      </header>

      <div className="flex flex-col gap-8">
        {showTelegram && (
          <Link
            href="/admin/telegram"
            className="group flex items-center gap-3.5 rounded-[22px] border border-slate-900/[.08] bg-white/80 p-4 transition-colors hover:border-blue-600/30 dark:border-white/[.08] dark:bg-white/[.03]"
            data-overview-telegram={tgState}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#229ED9]/10 text-[#1C8ACB]">
              <Send size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-slate-900 dark:text-white">{tTg("title")}</span>
              <span className={`block text-[12.5px] ${tgState === "linked" ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                {tgState === "unconfigured"
                  ? tTg("cardUnconfigured")
                  : tgState === "linked"
                    ? tg?.telegramUsername
                      ? tTg("connectedAs", { username: `@${tg.telegramUsername}` })
                      : tTg("connected")
                    : tTg("cardUnlinked")}
              </span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-slate-300 transition-colors group-hover:text-blue-600" />
          </Link>
        )}

        {ops && (
          <section data-overview-ops>
            <h2 className="m-0 mb-3 text-[15px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">{t("opsTitle")}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Card testid="pendingOrders" icon={ShoppingBag} label={t("pendingOrders")} value={ops[0]} href="/admin/orders" />
              <Card testid="unpaidOrders" icon={Receipt} label={t("unpaidOrders")} value={ops[1]} href="/admin/orders" />
              <Card testid="lowStock" icon={Boxes} label={t("lowStock")} value={ops[2]} note={t("lowStockNote", { n: LOW_STOCK })} href="/admin/inventory" />
              <Card testid="pendingFgas" icon={BadgeCheck} label={t("pendingFgas")} value={ops[3]} href="/admin/users" />
              <Card testid="openSupport" icon={Headset} label={t("openSupport")} value={ops[4]} href="/admin/support" />
            </div>
          </section>
        )}

        {finance && (
          <section data-overview-finance>
            <h2 className="m-0 mb-3 text-[15px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">{t("financeTitle")}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Card testid="gross" icon={Wallet} label={t("gross30")} value={eur(finance.ledger.gross)} note={t("ordersCount", { count: finance.ledger.orders })} href="/admin/analytics" />
              <Card testid="vat" icon={Receipt} label={t("vat30")} value={eur(finance.ledger.vat)} href="/admin/analytics" />
              <Card testid="deposits" icon={Boxes} label={t("deposits30")} value={eur(finance.ledger.deposits)} href="/admin/analytics" />
              <Card testid="aov" icon={ShoppingBag} label={t("aov30")} value={eur(finance.ledger.aov)} href="/admin/analytics" />
              <Card testid="customers" icon={Users} label={t("customers")} value={finance.customers.customers} note={t("activeBuyers", { count: finance.customers.activeBuyers })} href="/admin/analytics" />
            </div>
          </section>
        )}

        {totals && (
          <section data-overview-owner>
            <h2 className="m-0 mb-3 text-[15px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">{t("ownerTitle")}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Card testid="users" icon={Users} label={t("allUsers")} value={totals[0]} href="/admin/users" />
              <Card testid="orders" icon={ShoppingBag} label={t("allOrders")} value={totals[1]} href="/admin/orders" />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
