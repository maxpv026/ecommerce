"use client";

import { CalendarCheck, Globe, Receipt, ShieldCheck } from "lucide-react";
import MobileSubPageHeader from "./MobileSubPageHeader";

export default function MobileTaxLayout() {
  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title="VAT / Tax ID" />

      <div className="flex flex-col gap-3.5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                <Receipt size={17} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold tracking-[-.02em]">NL 8412 5567 B01</span>
                <span className="mt-[2px] block text-[11.5px] text-slate-400 dark:text-slate-500">Appexoft HVAC</span>
              </span>
            </span>
            <span className="flex flex-none items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-50 px-2.5 py-[6px] text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck size={13} strokeWidth={2} />
              Verified
            </span>
          </div>
        </div>

        <div className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <Globe size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-[-.02em]">Issuing Registry</div>
            <div className="mt-[3px] text-[12px] text-slate-400 dark:text-slate-500">EU VIES (VAT Information Exchange System)</div>
          </div>
        </div>

        <div className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <CalendarCheck size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-[-.02em]">Last Verified</div>
            <div className="mt-[3px] text-[12px] text-slate-400 dark:text-slate-500">Aug 12, 2026 · re-checked monthly</div>
          </div>
        </div>

        <div className="mx-4 rounded-3xl border border-blue-700/[.12] bg-blue-50 p-5 text-[12px] leading-[1.55] text-blue-800 dark:border-blue-400/20 dark:bg-blue-950/60 dark:text-blue-300">
          A verified VAT ID applies reverse-charge (0%) VAT to eligible EU B2B orders. Reach out to Billing if your
          registration details change.
        </div>
      </div>
    </div>
  );
}
