import { getQuickStats } from "@/lib/admin/analytics";
import { StatCard, formatEur } from "./primitives";

/** The four headline figures. Server component — nothing here is interactive. */
export default async function StatCardRow() {
  const stats = await getQuickStats();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        accent
        label="Revenue this month"
        value={formatEur(stats.monthRevenue.value)}
        trendPercent={stats.monthRevenue.trendPercent}
        comparedTo={stats.monthRevenue.comparedTo}
      />
      <StatCard
        label="Active orders"
        value={String(stats.activeOrders.value)}
        trendPercent={stats.activeOrders.trendPercent}
        comparedTo={stats.activeOrders.comparedTo}
      />
      <StatCard
        label="Pending invoices"
        value={String(stats.pendingInvoices.value)}
        trendPercent={stats.pendingInvoices.trendPercent}
        comparedTo={stats.pendingInvoices.comparedTo}
      />
      <StatCard
        label="Cylinders in circulation"
        value={String(stats.cylindersInCirculation.value)}
        trendPercent={stats.cylindersInCirculation.trendPercent}
        comparedTo={stats.cylindersInCirculation.comparedTo}
      />
    </div>
  );
}
