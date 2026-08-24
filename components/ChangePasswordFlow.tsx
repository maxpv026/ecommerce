"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Lock, MailCheck, ShieldCheck } from "lucide-react";
import { changePassword, checkPasswordOtp, requestPasswordChangeOtp } from "@/lib/actions/password";

const ACCENT = "#1d4ed8";

type Step = "idle" | "code" | "password";

interface ChangePasswordFlowProps {
  email: string;
  /** ISO date of the last verified change, when known. */
  passwordChangedAt: string | null;
  /** Guests see the static row only. */
  disabled?: boolean;
}

/**
 * Inline email-verified password change: idle → 6-digit code → new password.
 * The OTP is purpose-scoped ("password-change") and only consumed together
 * with the final write (bcrypt cost 12) in the changePassword action.
 */
export default function ChangePasswordFlow({ email, passwordChangedAt, disabled }: ChangePasswordFlowProps) {
  const t = useTranslations("ProfileDashboard");
  const tAccount = useTranslations("AccountProfile");
  const tAuth = useTranslations("Auth");
  const format = useFormatter();
  const router = useRouter();

  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);

  const lastChangedLine = passwordChangedAt
    ? t("pwLastChanged", {
        date: format.dateTime(new Date(passwordChangedAt), { month: "short", day: "numeric", year: "numeric" }),
      })
    : tAccount("lastChanged");

  const start = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    const result = await requestPasswordChangeOtp();
    setBusy(false);
    if (!result.ok) {
      toast.error(tAuth("errorSendCode"));
      return;
    }
    setCode("");
    setPassword("");
    setStep("code");
  };

  const verifyCode = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setError(tAuth("errorIncompleteCode"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await checkPasswordOtp(code);
    setBusy(false);
    if (!result.ok) {
      setError(tAuth("errorInvalidCode"));
      return;
    }
    setStep("password");
  };

  const submitPassword = async () => {
    if (busy) return;
    if (password.length < 8 || !/[\p{L}]/u.test(password) || !/\d/.test(password)) {
      setError(t("pwErrorComplexity"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await changePassword(code, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.code === "WEAK_PASSWORD" ? t("pwErrorComplexity") : tAuth("errorInvalidCode"));
      return;
    }
    toast.success(t("pwToastChanged"));
    setStep("idle");
    setCode("");
    setPassword("");
    router.refresh();
  };

  const inputClasses =
    "h-12 w-full rounded-[14px] border bg-slate-50 px-4 text-[13.5px] tracking-[-.01em] text-slate-900 transition-[border-color,box-shadow] duration-[240ms] focus:outline-none dark:bg-white/[.04] dark:text-slate-50 dark:placeholder:text-slate-600";
  const focusStyle = (key: string, hasError: boolean) => ({
    borderColor: hasError ? "#ef4444" : focusField === key ? ACCENT : "var(--hc-border-idle, rgba(255,255,255,.1))",
    boxShadow:
      focusField === key
        ? `0 0 0 4px ${hasError ? "#ef444426" : ACCENT + "26"}, 0 0 22px -8px ${hasError ? "#ef4444" : ACCENT}`
        : "none",
  });

  return (
    <div className="pt-[18px]">
      <div className="flex items-center justify-between gap-5">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-[-.025em]">{tAccount("passwordTitle")}</span>
          <span className="mt-[5px] block text-[12.5px] text-slate-600 dark:text-ink-muted">{lastChangedLine}</span>
        </span>
        {step === "idle" && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={start}
            disabled={busy || disabled}
            className="flex h-11 flex-none items-center justify-center gap-2 rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-900/[.05] disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
          >
            {busy && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
            {tAccount("changePassword")}
          </motion.button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === "code" && (
          <motion.div
            key="code"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-[18px] border border-slate-900/[.07] bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[.03]">
              <div className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-ink-muted">
                <MailCheck size={14} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                {t("pwCodeSentNote", { email })}
              </div>
              <div className="mt-3 flex gap-2.5">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onFocus={() => setFocusField("code")}
                  onBlur={() => setFocusField(null)}
                  inputMode="numeric"
                  placeholder="••••••"
                  aria-label={t("pwCodeLabel")}
                  className={`${inputClasses} max-w-[180px] text-center font-mono text-[17px] tracking-[.4em]`}
                  style={focusStyle("code", Boolean(error))}
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={verifyCode}
                  disabled={busy}
                  className="flex h-12 flex-none items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[13.5px] font-semibold tracking-[-.015em] text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={15} strokeWidth={2.2} className="animate-spin" /> : <ShieldCheck size={15} strokeWidth={2} />}
                  {t("pwVerify")}
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setStep("idle"); setError(null); }}
                  className="flex h-12 flex-none items-center justify-center px-2 text-[12.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:text-ink-muted dark:hover:text-slate-300"
                >
                  {t("adrCancel")}
                </button>
              </div>
              {error && <p className="m-0 mt-2.5 text-[12px] font-medium text-red-500 dark:text-red-400">{error}</p>}
            </div>
          </motion.div>
        )}

        {step === "password" && (
          <motion.div
            key="password"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-[18px] border border-slate-900/[.07] bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[.03]">
              <div className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-ink-muted">
                <Lock size={14} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                {t("pwNewLabel")}
              </div>
              <div className="mt-3 flex gap-2.5">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusField("password")}
                  onBlur={() => setFocusField(null)}
                  autoComplete="new-password"
                  aria-label={t("pwNewLabel")}
                  className={`${inputClasses} max-w-[280px]`}
                  style={focusStyle("password", Boolean(error))}
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={submitPassword}
                  disabled={busy}
                  className="flex h-12 flex-none items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[13.5px] font-semibold tracking-[-.015em] text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  {busy && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
                  {t("pwSave")}
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setStep("idle"); setError(null); }}
                  className="flex h-12 flex-none items-center justify-center px-2 text-[12.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:text-ink-muted dark:hover:text-slate-300"
                >
                  {t("adrCancel")}
                </button>
              </div>
              <p className="m-0 mt-2.5 text-[11.5px] text-slate-400 dark:text-ink-muted">{t("pwErrorComplexity")}</p>
              {error && <p className="m-0 mt-1.5 text-[12px] font-medium text-red-500 dark:text-red-400">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
