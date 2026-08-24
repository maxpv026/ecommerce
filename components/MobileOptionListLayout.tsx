"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import MobileSubPageHeader from "./MobileSubPageHeader";

export interface MobileOptionListItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface MobileOptionListLayoutProps {
  title: string;
  options: MobileOptionListItem[];
  defaultId: string;
}

export default function MobileOptionListLayout({ title, options, defaultId }: MobileOptionListLayoutProps) {
  const [selectedId, setSelectedId] = useState(defaultId);

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title={title} />

      <div className="pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-slate-900">
          {options.map((option, idx) => {
            const isLast = idx === options.length - 1;
            const selected = option.id === selectedId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedId(option.id)}
                className={`flex w-full min-h-[58px] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-900/[.02] dark:hover:bg-white/[.03] ${
                  isLast ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold tracking-[-.02em]">{option.label}</span>
                  {option.sublabel && (
                    <span className="mt-[2px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                      {option.sublabel}
                    </span>
                  )}
                </span>
                {selected && (
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-700 text-white">
                    <Check size={14} strokeWidth={2.6} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
