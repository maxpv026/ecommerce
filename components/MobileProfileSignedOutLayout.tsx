"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Lock } from "lucide-react";

export default function MobileProfileSignedOutLayout() {
  const t = useTranslations("Auth");
  return (
    <div className="relative flex w-full min-h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)]">
        <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite]" />
        <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse]" />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-8 pb-[calc(100px+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-center">
        <span className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-blue-700/[.15] bg-blue-50 text-blue-700 shadow-[0_18px_40px_-18px_rgba(29,78,216,0.4)] dark:border-blue-400/20 dark:bg-blue-950 dark:text-blue-400">
          <Lock size={32} strokeWidth={1.6} />
        </span>

        <h1 className="m-0 text-[24px] font-semibold tracking-[-.035em]">{t("signedOutTitle")}</h1>
        <p className="mt-3 max-w-[280px] text-[13.5px] leading-[1.55] text-slate-500 dark:text-slate-400">
          {t("signedOutBody")}
        </p>

        <Link
          href="/auth"
          className="mt-8 flex h-[52px] w-full max-w-[320px] items-center justify-center rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
        >
          {t("loginOrCreateAccount")}
        </Link>
      </div>
    </div>
  );
}
