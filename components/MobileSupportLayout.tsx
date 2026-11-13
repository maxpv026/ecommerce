"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, MessageCircle } from "lucide-react";
import { openAiChat } from "@/lib/aiChatEvents";
import MobileSubPageHeader from "./MobileSubPageHeader";

/**
 * /profile/support on a phone. The way to reach the team is the support chat
 * (the AI answers first and hands the conversation to a person on request) —
 * there is no separate support inbox or phone line to publish, so none is
 * shown. The answers describe the site as it works today.
 */
const FAQ = ["track", "fgas", "vat", "address", "cylinders"] as const;

export default function MobileSupportLayout() {
  const t = useTranslations("ProfileHub");
  const [open, setOpen] = useState<string | null>(FAQ[0]);

  return (
    <div className="relative min-h-screen w-full bg-slate-50 dark:bg-slate-950" data-mobile-support>
      <MobileSubPageHeader title={t("helpTitle")} />
      <div className="flex flex-col gap-5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => openAiChat()}
          data-support-chat
          className="mx-4 flex items-center gap-3 rounded-3xl bg-white p-5 text-left shadow-sm dark:bg-slate-900"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <MessageCircle size={18} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold tracking-[-.015em]">{t("helpChat")}</span>
            <span className="mt-0.5 block text-[12px] leading-[1.45] text-slate-500 dark:text-slate-400">{t("helpChatBody")}</span>
          </span>
        </button>

        <div className="px-4">
          <div className="mb-2.5 px-1.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-slate-500">{t("helpFaq")}</div>
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-slate-900">
            {FAQ.map((id, idx) => {
              const isOpen = open === id;
              return (
                <div key={id} className={idx === FAQ.length - 1 ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"} data-faq={id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-5 py-4 text-left">
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold tracking-[-.015em]">{t(`faqQ_${id}`)}</span>
                    <ChevronDown size={16} strokeWidth={2} className={`flex-none text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && <div className="px-5 pb-4 text-[12.5px] leading-[1.55] text-slate-500 dark:text-slate-400">{t(`faqA_${id}`)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
