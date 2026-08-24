"use client";

import { Briefcase, CalendarCheck, MapPin, ShieldCheck, User } from "lucide-react";
import MobileSubPageHeader from "./MobileSubPageHeader";

export default function MobileCompanyLayout() {
  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title="Company & VAT" />

      <div className="flex flex-col gap-3.5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              <Briefcase size={17} strokeWidth={1.8} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-.02em]">Appexoft HVAC</span>
          </div>

          <div className="mt-5 flex flex-col gap-3.5 border-t border-slate-900/[.07] pt-4 dark:border-white/[.07]">
            <div className="flex items-baseline justify-between gap-3.5">
              <span className="text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">VAT / TAX ID</span>
              <span className="text-[13.5px] font-semibold tracking-[-.015em]">NL 8412 5567 B01</span>
            </div>
            <div className="flex items-baseline justify-between gap-3.5">
              <span className="text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">REGISTERED ADDRESS</span>
              <span className="max-w-[200px] text-right text-[13px] font-medium leading-[1.4] text-slate-600 dark:text-slate-300">
                Lviv, Ukraine
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3.5">
              <span className="text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">ENTITY TYPE</span>
              <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">HVAC Contractor</span>
            </div>
          </div>
        </div>

        <div className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <ShieldCheck size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-[-.02em]">VAT Verified</div>
            <div className="mt-[3px] text-[12px] text-slate-400 dark:text-slate-500">
              Confirmed via EU VIES registry
            </div>
          </div>
          <span className="flex-none rounded-full border border-emerald-600/20 bg-emerald-50 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
            Verified
          </span>
        </div>

        <div className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <User size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-[-.02em]">Authorized Representative</div>
            <div className="mt-[3px] text-[12px] text-slate-400 dark:text-slate-500">Пивоваров Максим Романович</div>
          </div>
        </div>

        <div className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <MapPin size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-[-.02em]">Primary Delivery Site</div>
            <div className="mt-[3px] text-[12px] text-slate-400 dark:text-slate-500">Office / Workspace · Lviv, Ukraine</div>
          </div>
        </div>

        <div className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <CalendarCheck size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-[-.02em]">B2B Account Since</div>
            <div className="mt-[3px] text-[12px] text-slate-400 dark:text-slate-500">2021 · My Energy verified customer</div>
          </div>
        </div>
      </div>
    </div>
  );
}
