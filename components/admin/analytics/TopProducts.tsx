import { getTopProducts } from "@/lib/admin/analytics";
import { CAPTION, EmptyRow, Panel, formatEur } from "./primitives";

/**
 * Best sellers, both ways round.
 *
 * Volume and revenue are shown side by side rather than behind a toggle: they
 * frequently disagree — a cheap high-turnover line against a low-volume, high
 * margin one — and that disagreement is the interesting part. A toggle would
 * hide it behind a click.
 */
export default async function TopProducts({ limit = 5, days = 90 }: { limit?: number; days?: number }) {
  const { byVolume, byRevenue } = await getTopProducts(limit, days);
  const empty = byVolume.length === 0;

  return (
    <Panel title="Top products" hint={`LAST ${days} DAYS`}>
      {empty ? (
        <EmptyRow>No sales in this period yet.</EmptyRow>
      ) : (
        <div className="grid grid-cols-1 divide-y divide-slate-900/[.05] md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-hairline/60">
          <div className="p-6">
            <div className={CAPTION}>BY VOLUME</div>
            <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
              {byVolume.map((p) => (
                <li key={p.productId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-semibold tracking-[-.015em]">{p.sku}</span>
                    <span className="text-slate-400 dark:text-slate-500"> · {p.name}</span>
                  </span>
                  <span className="flex-none text-[13px] font-semibold tabular-nums">{p.units}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6">
            <div className={CAPTION}>BY REVENUE</div>
            <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
              {byRevenue.map((p) => (
                <li key={p.productId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-semibold tracking-[-.015em]">{p.sku}</span>
                    <span className="text-slate-400 dark:text-slate-500"> · {p.name}</span>
                  </span>
                  <span className="flex-none text-[13px] font-semibold tabular-nums">
                    {formatEur(p.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}
