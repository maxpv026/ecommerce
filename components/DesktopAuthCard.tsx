"use client";

import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuthFlow } from "@/lib/hooks/useAuthFlow";
import GoogleGlyph from "./GoogleGlyph";

const inputClasses =
  "h-[50px] w-full rounded-[14px] border border-slate-900/[.12] bg-white px-4 text-[14px] text-slate-900 transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-blue-700 focus:ring-[3.5px] focus:ring-blue-700/[.12] dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500";

export default function DesktopAuthCard() {
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 px-6 py-16 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -left-[160px] -top-[160px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] blur-[100px] [animation:hc-float_22s_ease-in-out_infinite]" />
        <div className="absolute -right-[140px] -bottom-[140px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] blur-[100px] [animation:hc-float_28s_ease-in-out_infinite_reverse]" />
      </div>

      <div
        className="relative w-[440px] max-w-full rounded-[26px] border border-white/60 bg-white/82 p-[34px] pb-7 shadow-[0_40px_120px_-20px_rgba(4,10,25,0.25),0_2px_6px_rgba(4,10,25,0.08)] backdrop-blur-2xl backdrop-saturate-150 [animation:hc-rise_.5s_cubic-bezier(.2,.8,.2,1)_both] dark:border-white/10 dark:bg-slate-900/85"
      >
        <div className="mb-5 flex items-center gap-[9px]">
          <span className="block h-[13px] w-[13px] rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
          <span className="text-[16px] font-semibold tracking-[-.035em]">My Energy</span>
        </div>

        {step === "credentials" ? (
          <>
            <h1 className="m-0 text-[25px] font-semibold tracking-[-.035em]">{t("welcomeTitle")}</h1>
            <p className="mb-[22px] mt-[7px] text-[13.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
              {t("welcomeSubtitle")}
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

            <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                  {t("emailLabel")}
                </label>
                <div className="relative">
                  <Mail
                    size={16}
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
                <label className="mb-1.5 block text-[11px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <Lock
                    size={16}
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
                  <label className="mb-1.5 block text-[11px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                    {t("confirmPasswordLabel")}
                  </label>
                  <div className="relative">
                    <Lock
                      size={16}
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
                className="mt-1 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_10px_24px_-8px_rgba(29,78,216,0.6)] transition-colors hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting && <Loader2 size={16} strokeWidth={2} className="animate-spin" />}
                {t("continue")}
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
              {googleLoading ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <GoogleGlyph size={17} />}
              {t("continueWithGoogle")}
            </button>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400 dark:text-slate-500">
              <ShieldCheck size={13} strokeWidth={2} className="flex-none" />
              {t("googleSecurityNote")}
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-[25px] font-semibold tracking-[-.035em]">{t("checkEmailTitle")}</h1>
            <p className="mb-[26px] mt-[7px] max-w-[340px] text-[13.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
              {t.rich("checkEmailSubtitle", {
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
                    aria-label={t("digitAriaLabel", { position: idx + 1 })}
                    className="h-[54px] w-[42px] rounded-[14px] border-[1.5px] border-slate-900/[.14] bg-white text-center text-[20px] font-semibold text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-[3.5px] focus:ring-blue-700/[.12] dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50"
                  />
                ))}
              </div>

              {error && <p className="text-center text-[12.5px] font-medium text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={verifying}
                className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_10px_24px_-8px_rgba(29,78,216,0.6)] transition-colors hover:bg-blue-800 disabled:opacity-60"
              >
                {verifying && <Loader2 size={16} strokeWidth={2} className="animate-spin" />}
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
          </>
        )}
      </div>
    </div>
  );
}
