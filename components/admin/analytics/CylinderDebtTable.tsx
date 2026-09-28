import { getCylinderDebt } from "@/lib/admin/analytics";
import { EmptyRow, Panel } from "./primitives";

/**
 * Who is holding our cylinders.
 *
 * The email is a mailto rather than a link into an admin user page — there is
 * no such page, and a link that 404s is worse than none. Chasing a deposit
 * starts with an email anyway.
 */
export default async function CylinderDebtTable({ limit = 5 }: { limit?: number }) {
  const debt = await getCylinderDebt(limit);

  return (
    <Panel
      title="Cylinders outstanding"
      hint={`${debt.totalOutstanding} OUT · ${debt.debtorCount} HOLDER${debt.debtorCount === 1 ? "" : "S"}`}
    >
      {debt.topDebtors.length === 0 ? (
        <EmptyRow>Every cylinder is accounted for.</EmptyRow>
      ) : (
        <ul className="m-0 list-none divide-y divide-slate-900/[.05] p-0 dark:divide-hairline/60">
          {debt.topDebtors.map((d) => (
            <li
              key={d.userId}
              data-debtor={d.userId}
              className="flex items-center justify-between gap-4 px-6 py-[15px]"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold tracking-[-.015em]">
                  {d.companyName || d.name || "Unnamed account"}
                </div>
                {d.email ? (
                  <a
                    href={`mailto:${d.email}?subject=${encodeURIComponent(`Cylinder return — ${d.outstanding} outstanding`)}`}
                    className="mt-0.5 block truncate text-[11.5px] text-blue-700 underline-offset-4 hover:underline dark:text-blue-400"
                  >
                    {d.email}
                  </a>
                ) : null}
              </div>
              <div className="flex flex-none items-baseline gap-2.5">
                <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  {d.borrowed}↑ {d.returned}↓
                </span>
                <span className="text-[17px] font-semibold tabular-nums tracking-[-.03em]">
                  {d.outstanding}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
