"use client";

import { useRouter } from "@/i18n/navigation";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

interface MobileSubPageHeaderProps {
  title: string;
  rightSlot?: ReactNode;
}

// Shared header for mobile sub-pages: ambient mesh gradient strictly at the
// top, glass ChevronLeft back button using router.back(), bold center title.
export default function MobileSubPageHeader({ title, rightSlot }: MobileSubPageHeaderProps) {
  const router = useRouter();

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)]">
        <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite]" />
        <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse]" />
      </div>

      <div className="relative flex items-center gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">{title}</span>
        <span className="flex w-11 flex-none items-center justify-center">{rightSlot}</span>
      </div>
    </div>
  );
}
