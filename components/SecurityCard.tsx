"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function SecurityCard() {
  const t = useTranslations("AccountProfile");
  const [twoFaEnabled, setTwoFaEnabled] = useState(true);

  return (
    <div
      id="security"
      className="scroll-mt-[88px] rounded-[22px] border border-white/75 bg-white/68 p-6.5 shadow-[0_24px_56px_-28px_rgba(15,23,42,0.26)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60"
    >
      <h2 className="m-0 mb-5 text-[17px] font-semibold tracking-[-.025em]">{t("accountSecurityTitle")}</h2>

      <div className="flex items-center justify-between gap-6 border-b border-slate-900/[.08] pb-5 dark:border-white/[.08]">
        <div>
          <div className="text-[13.5px] font-semibold tracking-[-.015em]">
            {t("twoFaTitle")}
          </div>
          <div className="mt-[5px] max-w-[400px] text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
            {twoFaEnabled ? t("twoFaEnabledBody") : t("twoFaDisabledBody")}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={twoFaEnabled}
          aria-label={t("toggleTwoFaAria")}
          onClick={() => setTwoFaEnabled((v) => !v)}
          className={`relative h-[31px] w-[51px] flex-none rounded-full p-0 transition-colors duration-200 ${
            twoFaEnabled ? "bg-green-600" : "bg-slate-900/[.16] dark:bg-white/20"
          }`}
        >
          <span
            className="absolute left-0.5 top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_5px_rgba(15,23,42,0.28)] transition-transform duration-200 ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ transform: twoFaEnabled ? "translateX(20px)" : "translateX(0)" }}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-6 pt-5">
        <div>
          <div className="text-[13.5px] font-semibold tracking-[-.015em]">{t("passwordTitle")}</div>
          <div className="mt-[5px] text-[12.5px] text-slate-500 dark:text-slate-400">
            {t("lastChanged")}
          </div>
        </div>
        <button
          type="button"
          className="h-10 flex-none rounded-xl border border-slate-900/[.14] bg-white/80 px-4.5 text-[13px] font-semibold tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
        >
          {t("changePassword")}
        </button>
      </div>
    </div>
  );
}
