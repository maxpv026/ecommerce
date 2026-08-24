"use client";

import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuthFlow } from "@/lib/hooks/useAuthFlow";
import GoogleGlyph from "./GoogleGlyph";

const inputClasses =
  "h-[52px] w-full rounded-2xl border border-slate-900/[.12] bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500";

export default function MobileAuthLayout() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/profile";
  const modeParam = searchParams.get("mode");
  const initialMode = modeParam === "register" ? "register" : modeParam === "signin" ? "signin" : undefined;
  const initialEmail = searchParams.get("email") ?? undefined;
  const {
    t,
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
  } = useAuthFlow(callbackUrl, { initialMode, initialEmail });

  const isSignIn = mode === "signin";

  return (
    <div className="relative flex w-full min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000_0%,#000_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_70%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite]" />
          <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse]" />
        </div>

        <div className="relative flex flex-col items-center px-6 pb-8 pt-[calc(4rem+env(safe-area-inset-top))] text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-slate-900 dark:border-slate-50" />
          {step === "credentials" ? (
            <>
              <h1 className="m-0 text-[24px] font-semibold tracking-[-.035em]">{t("welcomeTitle")}</h1>
              <p className="mt-2 text-[13.5px] text-slate-500 dark:text-slate-400">{t("welcomeSubtitle")}</p>
            </>
          ) : (
            <>
              <h1 className="m-0 text-[24px] font-semibold tracking-[-.035em]">{t("checkEmailTitle")}</h1>
              <p className="mt-2 max-w-[280px] text-[13.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
                {t.rich("checkEmailSubtitle", {
                  email,
                  strong: (chunks) => (
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{chunks}</span>
                  ),
                })}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-[calc(100px+env(safe-area-inset-bottom))]">
        {step === "credentials" ? (
          <>
            <div className="relative mb-5 grid grid-cols-2 rounded-full bg-slate-900/5 p-[3px] dark:bg-white/5">
              <div
                className="absolute bottom-[3px] top-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.04)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] dark:bg-slate-700"
                style={{ transform: isSignIn ? "translateX(0)" : "translateX(100%)" }}
              />
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`relative z-[1] h-[38px] rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors duration-200 ${
                  isSignIn ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t("signInTab")}
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`relative z-[1] h-[38px] rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors duration-200 ${
                  !isSignIn ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t("createAccountTab")}
              </button>
            </div>

            <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                  {t("emailLabel")}
                </label>
                <div className="relative">
                  <Mail
                    size={17}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    strokeWidth={1.8}
                  />
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    className={`${inputClasses} pl-11`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <Lock
                    size={17}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    strokeWidth={1.8}
                  />
                  <input
                    required
                    type="password"
                    autoComplete={isSignIn ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                    className={`${inputClasses} pl-11`}
                  />
                </div>
              </div>

              {!isSignIn && (
                <div>
                  <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                    {t("confirmPasswordLabel")}
                  </label>
                  <div className="relative">
                    <Lock
                      size={17}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                      strokeWidth={1.8}
                    />
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("confirmPasswordPlaceholder")}
                      className={`${inputClasses} pl-11`}
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-[12.5px] font-medium text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting && <Loader2 size={17} strokeWidth={2} className="animate-spin" />}
                {t("continue")}
              </button>

              <div className="my-1.5 flex items-center gap-3 text-[11px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                <span className="h-px flex-1 bg-slate-900/[.08] dark:bg-white/10" />
                {t("or")}
                <span className="h-px flex-1 bg-slate-900/[.08] dark:bg-white/10" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-slate-900/[.14] bg-white text-[14.5px] font-semibold tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 disabled:opacity-60 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:hover:border-white/30"
              >
                {googleLoading ? <Loader2 size={17} strokeWidth={2} className="animate-spin" /> : <GoogleGlyph size={18} />}
                {t("continueWithGoogle")}
              </button>

              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                <ShieldCheck size={13} strokeWidth={2} className="flex-none" />
                {t("googleSecurityNote")}
              </p>
            </form>
          </>
        ) : (
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
                  aria-label={t("digitAriaLabel", { position: idx + 1 })}
                  className="h-[58px] w-[46px] rounded-2xl border-[1.5px] border-slate-900/[.14] bg-white text-center text-[22px] font-semibold text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50"
                />
              ))}
            </div>

            {error && <p className="text-center text-[12.5px] font-medium text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={verifying}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              {verifying && <Loader2 size={17} strokeWidth={2} className="animate-spin" />}
              {t("verifyAndContinue")}
            </button>

            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={goBackToCredentials}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400"
              >
                <ArrowLeft size={14} strokeWidth={2.2} />
                {t("changeEmail")}
              </button>
              <button
                type="button"
                onClick={resendCode}
                disabled={submitting}
                className="text-[12.5px] font-semibold text-blue-700 disabled:opacity-60 dark:text-blue-400"
              >
                {t("resendCode")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
