"use client";

import type { ReactNode } from "react";

/** The head row inside a SURFACE: title + middle-dot meta left, actions right. */
export function SurfaceHead({ title, meta, children, id }: { title: string; meta?: Array<string | null | false>; children?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]" data-surface-head={id}>
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em]">{title}</h2>
        {meta && meta.filter(Boolean).length > 0 && <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 tabular-nums dark:text-ink-muted">{meta.filter(Boolean).join(" · ")}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A label/value row in a divided list. Empty values read as muted "Not set". */
export function FieldRow({ label, value, mono = false, empty, data }: { label: string; value: ReactNode; mono?: boolean; empty: string; data?: string }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-baseline gap-4 border-b border-slate-900/[.06] px-5 py-3 last:border-b-0 dark:border-white/[.06]" data-field={data}>
      <dt className="text-[12.5px] text-slate-500 dark:text-ink-muted">{label}</dt>
      <dd className={`m-0 min-w-0 truncate text-[13.5px] ${missing ? "text-slate-400 dark:text-slate-500" : `font-medium ${mono ? "font-mono" : ""}`}`}>{missing ? empty : value}</dd>
    </div>
  );
}

/** A group title inside a surface. */
export function GroupTitle({ children }: { children: ReactNode }) {
  return <div className="border-b border-slate-900/[.06] bg-slate-900/[.015] px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:border-white/[.06] dark:bg-white/[.02] dark:text-ink-muted">{children}</div>;
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-[13px] text-slate-500 dark:text-ink-muted">{children}</div>;
}
