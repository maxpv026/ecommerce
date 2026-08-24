"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useAuthFlow } from "@/lib/hooks/useAuthFlow";

const ACCENT = "#1d4ed8";

type FieldKey = "email" | "password" | "confirm";

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

interface FloatingFieldProps {
  type: string;
  autoComplete: string;
  label: string;
  value: string;
  active: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function FloatingField({ type, autoComplete, label, value, active, onChange, onFocus, onBlur }: FloatingFieldProps) {
  const lifted = active || value.length > 0;
  return (
    <div className="relative">
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className="h-[54px] w-full rounded-[14px] border bg-white/60 px-[15px] pb-1.5 pt-[18px] text-[14.5px] text-slate-900 transition-[border-color,box-shadow,background-color] duration-200 focus:bg-white focus:outline-none dark:bg-white/[.04] dark:text-slate-50 dark:focus:bg-white/[.07]"
        style={{
          borderColor: active ? ACCENT : "var(--hc-border-idle)",
          boxShadow: active ? `0 0 0 3.5px ${ACCENT}1f` : "none",
        }}
      />
      <label
        className="pointer-events-none absolute left-4 transition-all duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          top: lifted ? 8 : 18,
          fontSize: lifted ? "10.5px" : "14.5px",
          letterSpacing: lifted ? ".04em" : "-.01em",
          textTransform: lifted ? "uppercase" : "none",
          color: active ? ACCENT : "var(--hc-label-idle)",
        }}
      >
        {label}
      </label>
    </div>
  );
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Where to land after a completed sign-in. Omit for the seamless in-place
   * experience: the modal closes and the current page re-renders with the
   * fresh session — no navigation at all.
   */
  callbackUrl?: string;
}

export default function AuthModal({ isOpen, onClose, callbackUrl }: AuthModalProps) {
  const t = useTranslations("AuthModal");
  const tAuth = useTranslations("Auth");
  const [focus, setFocus] = useState<FieldKey | null>(null);

  // The entire two-step flow (credentials → requestEmailOtp server action →
  // 6-digit code → signIn("credentials", { redirect: false, ... })) runs
  // through this hook with local state only — the URL never changes.
  const {
    mode,
    setMode,
    step,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    digits,
    boxRefs,
    error,
    submitting,
    verifying,
    googleLoading,
    handleCredentialsSubmit,
    handleDigitChange,
    handleDigitKeyDown,
    handlePaste,
    handleVerify,
    handleGoogle,
    resendCode,
    goBackToCredentials,
  } = useAuthFlow(callbackUrl ?? null, { onSuccess: onClose });

  // Escape closes; body scroll is locked while the modal is open so the
  // page behind the backdrop can't move.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSignIn = mode === "signin";
  const onCodeStep = step === "code";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#090A0C]/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        data-auth-modal
        onClick={(e) => e.stopPropagation()}
        className="relative w-[428px] max-w-full rounded-[26px] border border-white/60 bg-white/82 p-[34px] pb-7 shadow-[0_40px_120px_-20px_rgba(4,10,25,0.7),0_2px_6px_rgba(4,10,25,0.25)] backdrop-blur-2xl backdrop-saturate-150 [animation:hc-rise_.5s_cubic-bezier(.2,.8,.2,1)_both] dark:border-white/10 dark:bg-slate-900/85"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute right-4 top-4 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-900/5 text-slate-600 transition-colors hover:bg-slate-900/[.11] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
        >
          <X size={14} strokeWidth={2} />
        </button>

        <div className="mb-5 flex items-center gap-[9px]">
          <span className="block h-[13px] w-[13px] rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
          <span className="text-[16px] font-semibold tracking-[-.035em]">My Energy</span>
        </div>

        {onCodeStep ? (
          /* ---- Step 2: enter the emailed verification code, in place ---- */
          <>
            <h2 className="m-0 text-[25px] font-semibold tracking-[-.035em]">{tAuth("checkEmailTitle")}</h2>
            <p className="mb-[26px] mt-[7px] text-[13.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
              {tAuth.rich("checkEmailSubtitle", {
                email,
                strong: (chunks) => <span className="font-semibold text-slate-700 dark:text-slate-300">{chunks}</span>,
              })}
            </p>

            <form onSubmit={handleVerify} className="flex flex-col gap-5">
              <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      boxRefs.current[idx] = el;
                    }}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={tAuth("digitAriaLabel", { position: idx + 1 })}
                    className={`h-[58px] w-[46px] rounded-[15px] border-[1.5px] bg-white/70 text-center text-[22px] font-semibold text-slate-900 transition-[border-color,box-shadow] duration-200 focus:outline-none dark:bg-white/[.05] dark:text-slate-50 ${
                      error
                        ? "border-red-500/70 focus:border-red-500 focus:ring-[3.5px] focus:ring-red-500/[.14]"
                        : "border-slate-900/[.14] focus:border-blue-700 focus:ring-[3.5px] focus:ring-blue-700/[.14] focus:shadow-[0_0_18px_-4px_rgba(29,78,216,0.45)] dark:border-white/[.14]"
                    }`}
                  />
                ))}
              </div>

              {error && (
                <p className="m-0 text-center text-[12.5px] font-medium text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={verifying}
                className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-semibold tracking-[-.01em] text-white transition-transform duration-200 active:scale-[.99] disabled:opacity-60"
                style={{ background: ACCENT, boxShadow: `0 10px 24px -8px ${ACCENT}99` }}
              >
                {verifying && <Loader2 size={16} strokeWidth={2} className="animate-spin" />}
                {tAuth("verifyAndContinue")}
              </button>

              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={goBackToCredentials}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ArrowLeft size={14} strokeWidth={2.2} />
                  {tAuth("changeEmail")}
                </button>
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={submitting}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 disabled:opacity-60 dark:text-blue-400"
                >
                  {submitting && <Loader2 size={12} strokeWidth={2.2} className="animate-spin" />}
                  {tAuth("resendCode")}
                </button>
              </div>
            </form>
          </>
        ) : (
          /* ---- Step 1: credentials ---- */
          <>
            <h2 className="m-0 text-[25px] font-semibold tracking-[-.035em]">
              {isSignIn ? t("welcomeBack") : t("createAccountTitle")}
            </h2>
            <p className="mb-[22px] mt-[7px] text-[13.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
              {isSignIn ? t("signInSubtitle") : t("registerSubtitle")}
            </p>

            <div className="relative mb-6 grid grid-cols-2 rounded-full bg-slate-900/5 p-[3px] dark:bg-white/5">
              <div
                className="absolute bottom-[3px] top-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.04)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] dark:bg-slate-700"
                style={{ transform: isSignIn ? "translateX(0)" : "translateX(100%)" }}
              />
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`relative z-[1] h-[34px] rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors duration-200 ${
                  isSignIn ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t("signInTab")}
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`relative z-[1] h-[34px] rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors duration-200 ${
                  !isSignIn ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t("createAccountTab")}
              </button>
            </div>

            <form onSubmit={handleCredentialsSubmit}>
              <div className="flex flex-col gap-3">
                <FloatingField
                  type="email"
                  autoComplete="email"
                  label={t("emailLabel")}
                  value={email}
                  active={focus === "email"}
                  onChange={setEmail}
                  onFocus={() => setFocus("email")}
                  onBlur={() => setFocus(null)}
                />
                <FloatingField
                  type="password"
                  autoComplete={isSignIn ? "current-password" : "new-password"}
                  label={t("passwordLabel")}
                  value={password}
                  active={focus === "password"}
                  onChange={setPassword}
                  onFocus={() => setFocus("password")}
                  onBlur={() => setFocus(null)}
                />
                {!isSignIn && (
                  <FloatingField
                    type="password"
                    autoComplete="new-password"
                    label={t("confirmPasswordLabel")}
                    value={confirmPassword}
                    active={focus === "confirm"}
                    onChange={setConfirmPassword}
                    onFocus={() => setFocus("confirm")}
                    onBlur={() => setFocus(null)}
                  />
                )}
              </div>

              {isSignIn && (
                <div className="mt-[11px] flex justify-end">
                  <a href="#" className="text-[12.5px] text-slate-600 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400">
                    {t("forgotPassword")}
                  </a>
                </div>
              )}

              {error && (
                <p className="m-0 mt-3.5 text-center text-[12.5px] font-medium text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-semibold tracking-[-.01em] text-white transition-transform duration-200 active:scale-[.99] disabled:opacity-60"
                style={{
                  height: 50,
                  marginTop: isSignIn ? 14 : 18,
                  background: ACCENT,
                  boxShadow: `0 10px 24px -8px ${ACCENT}99`,
                }}
              >
                {submitting && <Loader2 size={16} strokeWidth={2} className="animate-spin" />}
                {isSignIn ? t("submitSignIn") : t("submitCreateAccount")}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
              <span className="text-[11px] tracking-[.06em] text-slate-400 dark:text-slate-500">{t("or")}</span>
              <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-slate-900/[.12] bg-white text-[13.5px] font-medium tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 disabled:opacity-60 dark:border-white/[.12] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
            >
              {googleLoading ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <GoogleIcon />}
              {t("continueWithGoogle")}
            </button>

            <p className="mt-5 text-center text-xs leading-[1.55] text-slate-400 dark:text-slate-500">
              {isSignIn ? t("protectedCheckout") : t("agreeTerms")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
