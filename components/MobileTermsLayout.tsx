"use client";

import { TERMS_SECTIONS } from "@/lib/mobileTerms";
import MobileSubPageHeader from "./MobileSubPageHeader";

export default function MobileTermsLayout() {
  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Phones get the sub-page bar; desktop has the global header, so a plain title. */}
      <div className="md:hidden">
        <MobileSubPageHeader title="Terms of Service" />
      </div>

      <div className="pb-[calc(120px+env(safe-area-inset-bottom))] pt-2 md:mx-auto md:max-w-[820px] md:px-8 md:pb-20 md:pt-14">
        <h1 className="m-0 mb-6 hidden text-[34px] font-semibold leading-[1.1] tracking-[-.04em] md:block">Terms of Service</h1>
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm md:mx-0 md:p-8 dark:bg-slate-900">
          <p className="mb-5 text-[11.5px] text-slate-400 dark:text-slate-500">Last updated: August 1, 2026</p>
          <div className="flex flex-col gap-5">
            {TERMS_SECTIONS.map((section) => (
              <div key={section.heading}>
                <h2 className="m-0 mb-1.5 text-[14px] font-semibold tracking-[-.02em]">{section.heading}</h2>
                <p className="m-0 text-[12.5px] leading-[1.6] text-slate-500 dark:text-slate-400">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
