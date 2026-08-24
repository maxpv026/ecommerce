"use client";

import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ClipboardEvent } from "react";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { signIn, getSession } from "next-auth/react";
import { toast } from "sonner";
import { requestEmailOtp, type RequestOtpErrorCode } from "@/lib/actions/otp";

export type AuthMode = "signin" | "register";
export type AuthStep = "credentials" | "code";

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

const ERROR_KEY: Record<RequestOtpErrorCode, string> = {
  INVALID_EMAIL: "errorGeneric",
  PASSWORD_TOO_SHORT: "errorPasswordTooShort",
  EMAIL_EXISTS: "errorEmailExists",
  NO_ACCOUNT: "errorNoAccount",
  WRONG_PASSWORD: "errorWrongPassword",
  GOOGLE_ACCOUNT: "errorGoogleAccount",
  SEND_FAILED: "errorSendCode",
};

export interface AuthFlowOptions {
  /** Tab to open with (e.g. carried over from the AuthModal entry point). */
  initialMode?: AuthMode;
  /** Email to prefill (carried over from the AuthModal entry point). */
  initialEmail?: string;
  /** Runs right after a successful sign-in (e.g. closing the AuthModal). */
  onSuccess?: () => void;
}

/**
 * Shared two-step (credentials → emailed OTP) sign-in flow.
 *
 * `callbackUrl: null` means "sign in in place": no navigation on success —
 * the session is refreshed on the current page (the AuthModal's seamless
 * mode). A string navigates there once the code is verified (the /auth
 * page, or cart → /checkout).
 */
export function useAuthFlow(callbackUrl: string | null, options: AuthFlowOptions = {}) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const activeLocale = useLocale();

  const [mode, setModeState] = useState<AuthMode>(options.initialMode ?? "signin");
  const [step, setStep] = useState<AuthStep>("credentials");
  const [email, setEmail] = useState(options.initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  const setMode = (next: AuthMode) => {
    setModeState(next);
    setError(null);
  };

  const requestCode = async () => {
    setError(null);

    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const tooShort = parsed.error.issues.some((issue) => issue.path[0] === "password");
      setError(t(tooShort ? "errorPasswordTooShort" : "errorGeneric"));
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError(t("errorPasswordMismatch"));
      return;
    }

    setSubmitting(true);
    const result = await requestEmailOtp({ mode, email: parsed.data.email, password: parsed.data.password });
    setSubmitting(false);

    if (!result.ok) {
      setError(t(ERROR_KEY[result.code]));
      return;
    }

    setDigits(["", "", "", "", "", ""]);
    setStep("code");
    setTimeout(() => boxRefs.current[0]?.focus(), 50);
  };

  const handleCredentialsSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitting) void requestCode();
  };

  const setDigitAt = (idx: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const handleDigitChange = (idx: number, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(idx, value);
    if (value && idx < 5) boxRefs.current[idx + 1]?.focus();
  };

  const handleDigitKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      boxRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    boxRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError(t("errorIncompleteCode"));
      return;
    }
    setError(null);
    setVerifying(true);

    const result = await signIn("credentials", { email, password, code, redirect: false });
    if (result?.error) {
      setVerifying(false);
      setError(t("errorInvalidCode"));
      toast.error(t("errorInvalidCode"));
      return;
    }

    toast.success(t("toastSignedIn"));

    // The session now carries the user's saved locale (auth.ts's jwt/session
    // callbacks read it from the DB on sign-in) — if it differs from the
    // locale they're currently browsing in, send them to their saved one.
    const session = await getSession();
    setVerifying(false);
    options.onSuccess?.();
    if (callbackUrl !== null) {
      const targetLocale = session?.user?.locale;
      if (targetLocale && targetLocale !== activeLocale) {
        router.push(callbackUrl, { locale: targetLocale });
        router.refresh();
        return;
      }
      router.push(callbackUrl);
    }
    router.refresh();
  };

  const handleGoogle = () => {
    setGoogleLoading(true);
    // Without an explicit callback, next-auth returns to the current page.
    void signIn("google", callbackUrl !== null ? { callbackUrl } : undefined);
  };

  const resendCode = () => {
    if (!submitting) void requestCode();
  };

  const goBackToCredentials = () => {
    setStep("credentials");
    setError(null);
  };

  return {
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
  };
}
