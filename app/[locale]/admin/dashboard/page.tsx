import { Suspense } from "react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import StatCardRow from "@/components/admin/analytics/StatCardRow";
import RevenueChart from "@/components/admin/analytics/RevenueChart";
import CylinderDebtTable from "@/components/admin/analytics/CylinderDebtTable";
import TopProducts from "@/components/admin/analytics/TopProducts";
import {
  ChartSkeleton,
  StatCardRowSkeleton,
  TableSkeleton,
} from "@/components/admin/analytics/primitives";

export const metadata: Metadata = {
  title: "Analytics — My Energy",
  description: "Revenue, cylinder debt and product performance.",
};

/**
 * Admin analytics.
 *
 * The page awaits exactly ONE thing — the admin guard — and then returns.
 * Every aggregation sits behind its own Suspense boundary, so the shell
 * paints as soon as the session is verified and a slow query can only ever
 * hold up its own panel. The boundaries are separate rather than one wrapper
 * for the same reason: the cylinder debt table should not wait on the chart.
 *
 * Each fallback mirrors the real block's height, so content drops in without
 * moving anything below it.
 */
export default async function AdminAnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Before any data is even requested. guardAdmin never returns on failure —
  // redirect() throws — so no branch below can render for a non-admin.
  await guardAdmin(params);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-8 md:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">
            Analytics
          </p>
          <h1 className="m-0 mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-.045em] md:text-[38px]">
            Dashboard
          </h1>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/admin"
            className="inline-flex min-h-[38px] items-center rounded-[12px] border border-slate-900/[.12] px-4 text-[13px] font-semibold transition-colors hover:bg-slate-900/[.04] dark:border-white/[.14] dark:hover:bg-white/[.06]"
          >
            Vault
          </Link>
          <Link
            href="/admin/inventory"
            className="inline-flex min-h-[38px] items-center rounded-[12px] border border-slate-900/[.12] px-4 text-[13px] font-semibold transition-colors hover:bg-slate-900/[.04] dark:border-white/[.14] dark:hover:bg-white/[.06]"
          >
            Inventory
          </Link>
        </nav>
      </header>

      <div className="flex flex-col gap-5">
        <Suspense fallback={<StatCardRowSkeleton />}>
          <StatCardRow />
        </Suspense>

        {/* Chart and debt table stream independently, side by side on wide
            screens. The 1.6/1 split keeps the time series readable while the
            table stays comfortably narrow. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart days={30} />
          </Suspense>

          <Suspense fallback={<TableSkeleton rows={5} />}>
            <CylinderDebtTable limit={5} />
          </Suspense>
        </div>

        <Suspense fallback={<TableSkeleton rows={5} />}>
          <TopProducts limit={5} days={90} />
        </Suspense>
      </div>
    </div>
  );
}
