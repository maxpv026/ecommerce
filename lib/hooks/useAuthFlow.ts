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
/**
 * Which second factor the user is typing.
 *
 * Only offered to accounts whose factor is "totp": an emailed one-time code
 * has no recovery codes behind it, so showing the switch there would promise
 * something that cannot work.
 */
export type CodeMode = "totp" | "recovery";

/** Recovery codes are eight hex characters — see RECOVERY_CODE_* in lib/twoFactor. */
const RECOVERY_CODE_LENGTH = 8;

/**
 * Keeps only the characters a recovery code can contain, lowercased.
 *
 * The TOTP boxes strip everything non-numeric, which is correct for them and
 * is exactly why recovery codes were unreachable before this: a code like
 * "a3f0b91c" lost six of its eight characters on the way in, and the form
 * refused to submit anything that was not six digits. Separate input, separate
 * filter. Spaces and dashes are dropped so a code copied out of the printed
 * list still works.
 */
export function normalizeRecoveryInput(raw: string): string {
  return raw.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, RECOVERY_CODE_LENGTH);
}

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
  // Which second factor this account uses, so the code screen can say where
  // to look. Accounts with an authenticator are never emailed a code.
  const [factor, setFactor] = useState<"email" | "totp">("email");
  const [email, setEmail] = useState(options.initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [codeMode, setCodeMode] = useState<CodeMode>("totp");
  const [recoveryCode, setRecoveryCodeState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const recoveryRef = useRef<HTMLInputElement | null>(null);

  /** Only authenticator accounts have recovery codes to fall back to. */
  const canUseRecoveryCode = factor === "totp";

  const setRecoveryCode = (raw: string) => setRecoveryCodeState(normalizeRecoveryInput(raw));

  /**
   * Switches between the six digit boxes and the recovery field, clearing
   * whichever input is being left behind — a half-typed TOTP must not be
   * submitted as a recovery code, and vice versa.
   */
  const toggleCodeMode = () => {
    setError(null);
    setCodeMode((prev) => {
      const next = prev === "totp" ? "recovery" : "totp";
      if (next === "recovery") {
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => recoveryRef.current?.focus(), 50);
      } else {
        setRecoveryCodeState("");
        setTimeout(() => boxRefs.current[0]?.focus(), 50);
      }
      return next;
    });
  };

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
    setRecoveryCodeState("");
    setCodeMode("totp");
    setFactor(result.factor);
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

    // One field is live at a time, and each has its own completeness rule.
    // auth.ts tells the two apart by shape (six digits vs eight hex), so the
    // server needs no flag from us — but sending a half-finished value would
    // spend one of the account's five attempts before the lockout, which is
    // why both lengths are enforced here first.
    const code = codeMode === "recovery" ? recoveryCode : digits.join("");
    if (codeMode === "recovery") {
      if (code.length !== RECOVERY_CODE_LENGTH) {
        setError(t("errorIncompleteRecoveryCode"));
        return;
      }
    } else if (code.length !== 6) {
      setError(t("errorIncompleteCode"));
      return;
    }
    setError(null);
    setVerifying(true);

    const result = await signIn("credentials", { email, password, code, redirect: false });
    if (result?.error) {
      setVerifying(false);
      const key = codeMode === "recovery" ? "errorInvalidRecoveryCode" : "errorInvalidCode";
      setError(t(key));
      toast.error(t(key));
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
    setCodeMode("totp");
    setRecoveryCodeState("");
  };

  return {
    factor,
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
    codeMode,
    canUseRecoveryCode,
    toggleCodeMode,
    recoveryCode,
    setRecoveryCode,
    recoveryRef,
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
