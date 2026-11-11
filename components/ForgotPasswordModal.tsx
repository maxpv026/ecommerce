"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { checkPasswordResetCode, completePasswordReset, requestPasswordReset, type PasswordResetResult } from "@/lib/actions/passwordReset";

/**
 * Forgot password, in three steps over its own window (lib/actions/passwordReset):
 *
 *   email     → "if an account exists, a code is on its way" (the same words
 *               whatever the address — no account enumeration)
 *   code      → 6 digits; wrong ones count against the code's 5 tries
 *   password  → new password + confirmation
 *   done      → every device signed out; sign in again
 */

type Step = "email" | "code" | "password" | "done";
const ERROR_KEY: Record<Exclude<PasswordResetResult, { ok: true }>["code"], string> = {
  INVALID_INPUT: "errorInvalidEmail",
  RATE_LIMITED: "errorRateLimited",
  INVALID_CODE: "errorInvalidCode",
  WEAK_PASSWORD: "errorWeak",
  FAILED: "errorFailed",
};

export default function ForgotPasswordModal({ open, initialEmail = "", onClose }: { open: boolean; initialEmail?: string; onClose: () => void }) {
  return <AnimatePresence>{open && <Dialog key="forgot" initialEmail={initialEmail} onClose={onClose} />}</AnimatePresence>;
}

function Dialog({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const t = useTranslations("PasswordReset");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const run = async (fn: () => Promise<PasswordResetResult>, next: Step | null) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (!result.ok) return setError(t(ERROR_KEY[result.code]));
      if (next) setStep(next);
    } catch {
      setError(t("errorFailed"));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (step === "email") return run(() => requestPasswordReset({ email, locale }), "code");
    if (step === "code") return run(() => checkPasswordResetCode({ email, code }), "password");
    if (step === "password") {
      if (password !== confirm) return setError(t("errorMismatch"));
      return run(() => completePasswordReset({ email, code, password }), "done");
    }
  };

  const resend = async () => {
    await run(() => requestPasswordReset({ email, locale }), null);
    setNotice(t("resent"));
  };

  const input =
    "h-12 w-full rounded-[14px] border border-slate-900/[.12] bg-slate-50 px-4 text-[14px] text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-50";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="fixed inset-0 z-[130] flex items-end justify-center bg-[#090A0C]/75 backdrop-blur-md sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 14, transition: { duration: 0.2 } }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
        data-forgot-modal={step}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full rounded-t-[26px] bg-white p-6 shadow-[0_40px_120px_-30px_rgba(4,10,25,.75)] sm:w-[440px] sm:rounded-[24px] dark:bg-[#141518]"
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label={t("close")} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/5 text-slate-600 hover:bg-slate-900/10 disabled:opacity-40 dark:bg-white/5 dark:text-slate-300">
          <X size={15} strokeWidth={2} />
        </button>
        <div className="flex items-center gap-3 pr-8">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-blue-700 text-white">
            {step === "done" ? <ShieldCheck size={18} strokeWidth={2} /> : <KeyRound size={18} strokeWidth={2} />}
          </span>
          <h2 id="forgot-title" className="m-0 text-[18px] font-semibold tracking-[-.03em]">
            {step === "done" ? t("doneTitle") : t("title")}
          </h2>
        </div>

        {step === "done" ? (
          <div data-forgot-done>
            <p className="m-0 mt-4 text-[13.5px] leading-[1.6] text-slate-600 dark:text-ink-muted">{t("doneBody")}</p>
            <button type="button" onClick={onClose} className="mt-5 flex h-12 w-full items-center justify-center rounded-[14px] bg-blue-700 text-[14px] font-semibold text-white hover:bg-blue-800">
              {t("backToSignIn")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3" noValidate>
            <p className="m-0 text-[13px] leading-[1.6] text-slate-600 dark:text-ink-muted">
              {step === "email" ? t("emailIntro") : step === "code" ? t("codeIntro", { email }) : t("passwordIntro")}
            </p>
            {step === "email" && (
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailLabel")} aria-label={t("emailLabel")} data-forgot-email className={input} />
            )}
            {step === "code" && (
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                aria-label={t("codeLabel")}
                data-forgot-code
                className={`${input} text-center font-mono text-[22px] tracking-[.4em]`}
              />
            )}
            {step === "password" && (
              <>
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("newPassword")} aria-label={t("newPassword")} data-forgot-password className={input} />
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("confirmPassword")} aria-label={t("confirmPassword")} data-forgot-confirm className={input} />
              </>
            )}
            {error && (
              <p role="alert" data-forgot-error className="m-0 text-[12.5px] font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {notice && !error && <p className="m-0 text-[12.5px] text-emerald-700 dark:text-emerald-300">{notice}</p>}
            <button
              type="submit"
              disabled={busy || (step === "email" ? !email.trim() : step === "code" ? code.length !== 6 : !password || !confirm)}
              data-forgot-submit
              className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[14px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {step === "email" ? t("sendCode") : step === "code" ? t("verify") : t("save")}
            </button>
            {step === "code" && (
              <div className="flex items-center justify-between text-[12.5px]">
                <button type="button" onClick={() => setStep("email")} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                  <ArrowLeft size={13} /> {t("changeEmail")}
                </button>
                <button type="button" onClick={resend} disabled={busy} data-forgot-resend className="font-semibold text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400">
                  {t("resend")}
                </button>
              </div>
            )}
            {step === "email" && <p className="m-0 text-[11.5px] leading-[1.5] text-slate-400">{t("googleHint")}</p>}
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
