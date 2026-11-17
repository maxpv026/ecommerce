"use client";

import { Loader2, ScanFace } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * "Confirm with Face ID / Touch ID" on the sign-in code step — shown only
 * when the account has a passkey on this domain (useAuthFlow asks the
 * server after the password step). The code boxes stay below it as the
 * fallback for a different device.
 */
export default function PasskeyLoginButton({ onClick, busy, disabled }: { onClick: () => void; busy: boolean; disabled?: boolean }) {
  const t = useTranslations("Passkeys");
  return (
    <div className="flex flex-col gap-3" data-passkey-login>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        data-passkey-login-button
        className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 px-4 text-[15px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,.7)] transition-[background-color,transform] hover:bg-slate-800 active:scale-[.99] disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {busy ? <Loader2 size={18} className="flex-none animate-spin" /> : <ScanFace size={19} strokeWidth={1.9} className="flex-none" />}
        <span className="truncate">{busy ? t("verifying") : t("loginButton")}</span>
      </button>
      <div className="flex items-center gap-3 text-[11.5px] font-medium text-slate-500 dark:text-slate-400" aria-hidden>
        <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
        {t("loginOr")}
        <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
      </div>
    </div>
  );
}
