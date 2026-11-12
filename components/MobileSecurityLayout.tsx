"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, KeyRound, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import MobileSubPageHeader from "./MobileSubPageHeader";
import DeviceSessions from "./security/DeviceSessions";
import TwoFactorManager from "./security/TwoFactorManager";
import type { SecurityState } from "@/lib/actions/security";

/**
 * /profile/security on a phone: the account's real security state — the
 * authenticator, the recovery phrase and the signed-in devices — with the
 * same step-up-guarded actions as desktop Settings. Nothing here is sample
 * data; a guest (no session) sees nothing to manage.
 */
export default function MobileSecurityLayout({ security, email, now }: { security: SecurityState | null; email: string; now: number }) {
  const t = useTranslations("SecurityCenter");
  const tA = useTranslations("AccountSettings");
  const [state, setState] = useState(security);
  const [managing, setManaging] = useState(false);

  const chip = (ok: boolean) =>
    `inline-flex items-center rounded-full border px-2 py-px text-[10.5px] font-semibold whitespace-nowrap ${
      ok ? "border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] text-[#047857] dark:text-[#34d399]" : "border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.14)] text-[#b45309] dark:text-[#fbbf24]"
    }`;

  return (
    <div className="relative min-h-screen w-full bg-slate-50 dark:bg-slate-950" data-mobile-security>
      <MobileSubPageHeader title={tA("securityHeading")} />

      {state ? (
        <div className="flex flex-col gap-3.5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
          <button type="button" onClick={() => setManaging(true)} data-twofa-manage className="mx-4 flex items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm dark:bg-slate-900">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-900/[.08] bg-slate-50 text-slate-500 dark:border-white/[.08] dark:bg-white/[.04]">
              <KeyRound size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold tracking-[-.02em]">{tA("twoFaTitleShort")}</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <span className={chip(state.twoFactor)} data-twofa-status={state.twoFactor ? "on" : "off"}>
                  {state.twoFactor ? tA("twoFaOn") : tA("twoFaOff")}
                </span>
                <span className={chip(state.phrase.set)}>{state.phrase.set ? tA("phraseActiveBadge") : tA("phraseAddBadge")}</span>
              </span>
            </span>
            <ChevronRight size={16} className="flex-none text-slate-400" />
          </button>

          <Link href="/profile/settings/password" className="mx-4 flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-900/[.08] bg-slate-50 text-slate-500 dark:border-white/[.08] dark:bg-white/[.04]">
              <Lock size={17} />
            </span>
            <span className="min-w-0 flex-1 text-[14px] font-semibold tracking-[-.02em]">{t("changePassword")}</span>
            <ChevronRight size={16} className="flex-none text-slate-400" />
          </Link>

          <div className="mx-4 overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-slate-900 [&_ul]:pl-5">
            <DeviceSessions sessions={state.sessions} now={now} onChange={setState} />
          </div>
        </div>
      ) : null}

      {managing && state && <TwoFactorManager state={state} email={email} onClose={() => setManaging(false)} onChange={setState} />}
    </div>
  );
}
