import { getRevenueStats } from "@/lib/admin/analytics";
import { EmptyRow, Panel, formatEur } from "./primitives";
import RevenueChartMount from "./RevenueChartMount";

/**
 * Revenue over time. Server component: it fetches, then hands plain data to
 * the client canvas.
 *
 * The series is dated by `Order.createdAt`, not by settlement, and shows two
 * lines — booked and settled. That is a deliberate workaround, not a
 * preference: `Order.paidAt` is NULL on every order in production because
 * nothing calls `markOrderPaid()` yet, and `Invoice.status` never leaves
 * PENDING. Dating by either would have drawn a flat zero line that looked
 * like a working chart. When settlement is wired up, switch the `paid` series
 * to bucket on `paidAt` and this becomes a true cash-in curve.
 */
export default async function RevenueChart({ days = 30 }: { days?: number }) {
  const data = await getRevenueStats(days);
  const booked = data.reduce((n, d) => n + d.booked, 0);
  const paid = data.reduce((n, d) => n + d.paid, 0);
  const hasActivity = data.some((d) => d.booked > 0);

  return (
    <Panel title={`Revenue — last ${days} days`} hint={`${formatEur(booked)} BOOKED · ${formatEur(paid)} SETTLED`}>
      {hasActivity ? (
        <RevenueChartMount data={data} />
      ) : (
        <EmptyRow>No orders in this period yet.</EmptyRow>
      )}
      <div className="flex items-center gap-5 border-t border-slate-900/[.06] px-6 py-3 dark:border-hairline">
        <span className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-slate-400">
          <span className="h-[2px] w-4 rounded-full bg-slate-900 dark:bg-slate-200" />
          Booked
        </span>
        <span className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-slate-400">
          <span className="h-[2px] w-4 rounded-full bg-blue-700 dark:bg-blue-400" />
          Settled
        </span>
        <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
          Dated by order date — settlement dates are not recorded yet
        </span>
      </div>
    </Panel>
  );
}
