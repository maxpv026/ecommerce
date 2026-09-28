"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Leaf } from "lucide-react";
import { RECORDS_LINKS, type RecordsIconKey } from "@/lib/profileRecords";

/**
 * The "Records & Compliance" group, rendered on the desktop dashboard and the
 * mobile profile.
 *
 * The destinations live in lib/profileRecords.ts so the header's account menu
 * shows exactly the same entries, in the same order, without either surface
 * owning the list.
 */

const ICONS: Record<RecordsIconKey, typeof Leaf> = {
  carbon: Leaf,
};

export default function RecordsCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Records");

  return (
    <section
      className={`rounded-[22px] border border-slate-900/[.08] bg-white/70 dark:border-hairline dark:bg-glass ${
        compact ? "p-[18px]" : "p-6"
      }`}
    >
      <div className="mb-1 text-[10.5px] tracking-[.09em] text-slate-500 dark:text-slate-400">
        {t("title").toUpperCase()}
      </div>
      <p
        className={`m-0 text-slate-600 dark:text-ink-muted ${
          compact ? "text-[12.5px] leading-[1.5]" : "text-[13.5px] leading-[1.55]"
        }`}
      >
        {t("subtitle")}
      </p>

      {/* Two columns only when there is something to put in the second one.
          With the group down to a single destination, `grid-cols-2` left a
          half-width tile against dead space. */}
      <div
        className={`mt-4 grid gap-2.5 ${
          compact || RECORDS_LINKS.length < 2 ? "grid-cols-1" : "grid-cols-2"
        }`}
      >
        {RECORDS_LINKS.map((link) => {
          const Icon = ICONS[link.icon];
          return (
            <Link
              key={link.id}
              href={link.href}
              data-records-link={link.id}
              className="group flex min-h-[56px] items-center gap-3 rounded-[16px] border border-slate-900/[.06] bg-white/60 px-3.5 py-3 transition-colors hover:border-blue-700/25 hover:bg-blue-50/50 dark:border-white/[.06] dark:bg-white/[.03] dark:hover:border-blue-400/25 dark:hover:bg-blue-500/[.08]"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-slate-900/[.06] bg-white text-slate-500 transition-colors group-hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:group-hover:text-blue-400">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-.015em]">
                {t(link.labelKey)}
              </span>
              <ArrowUpRight
                size={14}
                strokeWidth={2}
                className="flex-none text-slate-300 transition-colors group-hover:text-blue-700 dark:text-slate-600 dark:group-hover:text-blue-400"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
