"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, X } from "lucide-react";
import type { FgasCheck } from "@/lib/fgas";

/**
 * The itemised result of an F-Gas check: one row per criterion, with what
 * was found. Used by the verification window, the cart gate and the profile.
 */
export default function FgasChecklist({ checks, only, compact = false }: { checks: FgasCheck[]; only?: Array<FgasCheck["outcome"]>; compact?: boolean }) {
  const t = useTranslations("FgasChecks");
  const rows = only ? checks.filter((c) => only.includes(c.outcome)) : checks;
  if (rows.length === 0) return null;
  return (
    <ul className={`m-0 flex list-none flex-col p-0 ${compact ? "gap-1.5" : "gap-2"}`} data-fgas-checklist>
      {rows.map((c) => {
        const tone =
          c.outcome === "pass"
            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            : c.outcome === "review"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-red-500/12 text-red-700 dark:text-red-300";
        const Icon = c.outcome === "pass" ? Check : c.outcome === "review" ? AlertTriangle : X;
        return (
          <li key={`${c.id}-${c.code}`} data-check={c.id} data-outcome={c.outcome} className="flex items-start gap-2.5">
            <span className={`mt-[1px] flex h-5 w-5 flex-none items-center justify-center rounded-full ${tone}`}>
              <Icon size={11} strokeWidth={3} />
            </span>
            <span className="min-w-0 text-[12.5px] leading-[1.45]">
              <span className="font-semibold">{t(`label_${c.id}`)}</span>
              <span className="text-slate-500 dark:text-ink-muted"> · {t(`${c.id}_${c.code}`, { detail: c.detail ?? "" })}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "DE" → 🇩🇪 */
export const flagOf = (code: string | null | undefined) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : "";
