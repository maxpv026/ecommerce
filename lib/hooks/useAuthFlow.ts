"use client";

import { useEffect, useRef, useState } from "react";
import { getPasskeyLoginOptions } from "@/lib/actions/passkeyLogin";
import { PASSKEY_CODE_PREFIX, passkeysSupported, runPasskeyAssertion } from "@/lib/passkeyClient";
import type { PublicKeyCredentialRequestOptionsJSON as PasskeyRequestOptions } from "@simplewebauthn/browser";
import type { FormEvent, KeyboardEvent, ClipboardEvent } from "react";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { signIn, getSession } from "next-auth/react";
import { toast } from "sonner";
import { requestEmailOtp, type RequestOtpErrorCode } from "@/lib/actions/otp";
import { cancelGoogleTwoFactor, completeGoogleTwoFactor } from "@/lib/actions/googleTwoFactor";
import { getLoginRecoveryChallenge } from "@/lib/actions/recoveryChallenge";
import { recoveryAnswer, type RecoveryChallenge } from "@/lib/recoveryPhraseFormat";
import { callbackPath } from "@/lib/callbackPath";

export type AuthMode = "signin" | "register";
/** "secure": the post-registration "Secure your account" step (components/auth/SecurityOnboarding). */
export type AuthStep = "credentials" | "code" | "secure";
/**
 * Which second factor the user is typing.
 *
 * Only offered to accounts whose factor is "totp": an emailed one-time code
 * has no recovery codes behind it, so showing the switch there would promise
 * something that cannot work.
 */
export type CodeMode = "totp" | "recovery" | "phrase";



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
  TOO_MANY_ATTEMPTS: "errorTooManyAttempts",
  SEND_FAILED: "errorSendCode",
};

export interface AuthFlowOptions {
  /** Tab to open with (e.g. carried over from the AuthModal entry point). */
  initialMode?: AuthMode;
  /** Email to prefill (carried over from the AuthModal entry point). */
  initialEmail?: string;
  /** Runs right after a successful sign-in (e.g. closing the AuthModal). */
  onSuccess?: () => void;
  /**
   * `?error=` on /auth — set by NextAuth (pages.error) or by our own
   * signIn callback when a Google sign-in is refused.
   */
  initialErrorCode?: string | null;
  /**
   * `?step=google-2fa` on /auth: Google already confirmed who this is and
   * the login is paused for the authenticator code (lib/googleTwoFactor).
   * Opens straight on the code step.
   */
  pendingGoogleTwoFactor?: boolean;
}

/** NextAuth / auth.ts error codes → the Auth message that explains them. */
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  "google-2fa-expired": "errorGoogleTwoFactorExpired",
  "google-unverified": "errorGoogleUnverified",
  OAuthAccountNotLinked: "errorGoogleNotLinked",
  AccessDenied: "errorGoogleGeneric",
  OAuthCallbackError: "errorGoogleGeneric",
  OAuthSignInError: "errorGoogleGeneric",
  Configuration: "errorGoogleGeneric",
};

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
  const tPasskey = useTranslations("Passkeys");
  const router = useRouter();
  const activeLocale = useLocale();

  const [mode, setModeState] = useState<AuthMode>(options.initialMode ?? "signin");
  // A paused Google sign-in (see AuthFlowOptions.pendingGoogleTwoFactor)
  // finishes through completeGoogleTwoFactor instead of the password route.
  const [googlePending, setGooglePending] = useState(Boolean(options.pendingGoogleTwoFactor));
  const [step, setStep] = useState<AuthStep>(options.pendingGoogleTwoFactor ? "code" : "credentials");
  // Which second factor this account uses, so the code screen can say where
  // to look. Accounts with an authenticator are never emailed a code.
  const [factor, setFactor] = useState<"email" | "totp">(options.pendingGoogleTwoFactor ? "totp" : "email");
  const [email, setEmail] = useState(options.initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [codeMode, setCodeMode] = useState<CodeMode>("totp");
  const [recoveryCode, setRecoveryCodeState] = useState("");
  const [phrase, setPhrase] = useState("");
  // The recovery-phrase challenge for this sign-in: word positions to type
  // (12-word phrase) or the passphrase hint — fetched when the mode opens.
  const [phraseChallenge, setPhraseChallenge] = useState<RecoveryChallenge | null>(null);
  const [phraseWords, setPhraseWords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(() => {
    const code = options.initialErrorCode;
    if (!code) return null;
    return t(ERROR_MESSAGE_KEYS[code] ?? "errorGoogleGeneric");
  });
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const recoveryRef = useRef<HTMLInputElement | null>(null);
  const phraseRef = useRef<HTMLInputElement | null>(null);

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

  /**
   * Picks one of the three second-factor inputs directly — the recovery
   * phrase sits beside the recovery code — clearing the others for the
   * same reason toggleCodeMode does.
   */
  const setCodeModeTo = (next: CodeMode) => {
    setError(null);
    setDigits(["", "", "", "", "", ""]);
    setRecoveryCodeState("");
    setPhrase("");
    setPhraseWords([]);
    setPhraseChallenge(null);
    setCodeMode(next);
    if (next === "phrase") {
      // The challenge proves the first factor again (password, or the
      // paused Google sign-in's cookie) — it reveals nothing otherwise.
      void getLoginRecoveryChallenge(googlePending ? { google: true } : { email, password })
        .catch(() => ({ type: "NONE" as const }))
        .then(setPhraseChallenge);
    }
    setTimeout(() => (next === "totp" ? boxRefs.current[0] : next === "recovery" ? recoveryRef.current : phraseRef.current)?.focus(), 50);
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

  // ── Six-digit code: submits itself ──
  // The moment the sixth digit lands — typed, pasted, or filled by the
  // phone's one-time-code autofill — the code is verified; no button. One
  // request at a time (inFlight), and a rejected code clears the boxes and
  // puts the cursor back in the first one, which can only happen once the
  // boxes are enabled again (focusFirstAfterVerify → the effect below).
  const inFlight = useRef(false);
  const focusFirstAfterVerify = useRef(false);
  useEffect(() => {
    if (!verifying && focusFirstAfterVerify.current) {
      focusFirstAfterVerify.current = false;
      boxRefs.current[0]?.focus();
    }
  }, [verifying]);

  /** Fills the boxes from `idx` with `chars`; verifies when all six are set. */
  const fillDigits = (idx: number, chars: string) => {
    const next = [...digits];
    for (let i = 0; i < chars.length && idx + i < 6; i++) next[idx + i] = chars[i];
    setDigits(next);
    if (error) setError(null);
    const code = next.join("");
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      boxRefs.current[5]?.blur();
      void verify(code);
    } else {
      boxRefs.current[Math.min(idx + chars.length, 5)]?.focus();
    }
  };

  const handleDigitChange = (idx: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return setDigitAt(idx, "");
    // The phone's one-time-code autofill drops the whole code into one box:
    // spread it from the first box. Otherwise it's one keystroke — a box that
    // already held a digit receives "old+new", and the new digit wins.
    if (typed.length >= 6) return fillDigits(0, typed.slice(0, 6));
    fillDigits(idx, typed.slice(-1));
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
    // A pasted code always starts over at the first box.
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    if (error) setError(null);
    if (pasted.length === 6) {
      boxRefs.current[5]?.blur();
      void verify(pasted);
    } else {
      boxRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  // ── Face ID / Touch ID (lib/passkeys) ──
  // Options are fetched ahead — when the code step opens and after every
  // attempt (each challenge is single-use) — so the tap goes straight to the
  // system prompt: Safari refuses one that follows a network round trip.
  const [passkeyOptions, setPasskeyOptions] = useState<PasskeyRequestOptions | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const refreshPasskeyOptions = async () => {
    if (!passkeysSupported()) return setPasskeyOptions(null);
    const next = await getPasskeyLoginOptions(googlePending ? { google: true } : { email, password }).catch(() => null);
    setPasskeyOptions(next);
  };
  const passkeyFetchKey = step === "code" ? `${googlePending ? "g" : email}` : null;
  useEffect(() => {
    if (!passkeyFetchKey) return;
    let alive = true;
    // Deferred a tick: a state update from a timer, not from the effect body.
    const id = window.setTimeout(() => {
      if (!passkeysSupported()) return;
      void getPasskeyLoginOptions(googlePending ? { google: true } : { email, password })
        .catch(() => null)
        .then((next) => alive && setPasskeyOptions(next));
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // Re-fetched per sign-in attempt (email) or paused Google sign-in; the password is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passkeyFetchKey]);

  const verifyWithPasskey = async () => {
    if (!passkeyOptions || passkeyBusy || inFlight.current) return;
    setPasskeyBusy(true);
    setError(null);
    const outcome = await runPasskeyAssertion(passkeyOptions);
    setPasskeyBusy(false);
    if (!outcome.ok) {
      setError(outcome.cancelled ? tPasskey("cancelled") : tPasskey("failed"));
      void refreshPasskeyOptions();
      return;
    }
    await verify(outcome.code);
  };

  /** The form's submit — still how the recovery code and the phrase are sent. */
  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    void verify();
  };

  const verify = async (typedCode?: string) => {
    if (inFlight.current) return;
    // A Face ID / Touch ID assertion (`pk:…`) replaces whichever code this step asks for.
    const viaPasskey = typeof typedCode === "string" && typedCode.startsWith(PASSKEY_CODE_PREFIX);

    // One field is live at a time, and each has its own completeness rule.
    // auth.ts tells the two apart by shape (six digits vs eight hex), so the
    // server needs no flag from us — but sending a half-finished value would
    // spend one of the account's five attempts before the lockout, which is
    // why both lengths are enforced here first.
    const answer = codeMode === "phrase" ? recoveryAnswer(phraseChallenge, phraseWords, phrase) : null;
    const code = viaPasskey ? typedCode : codeMode === "recovery" ? recoveryCode : codeMode === "phrase" ? (answer ?? "") : (typedCode ?? digits.join(""));
    if (viaPasskey) {
      // Nothing to check client-side: the server verifies the assertion.
    } else if (codeMode === "phrase") {
      if (!answer) {
        setError(t(phraseChallenge?.type === "SEED_12" ? "errorIncompleteWords" : "errorIncompletePhrase"));
        return;
      }
    } else if (codeMode === "recovery") {
      if (code.length !== RECOVERY_CODE_LENGTH) {
        setError(t("errorIncompleteRecoveryCode"));
        return;
      }
    } else if (code.length !== 6) {
      setError(t("errorIncompleteCode"));
      return;
    }
    setError(null);
    inFlight.current = true;
    setVerifying(true);
    // A rejected six-digit code: empty the boxes, cursor back to the first.
    const rejectDigits = () => {
      if (codeMode !== "totp") return;
      setDigits(["", "", "", "", "", ""]);
      focusFirstAfterVerify.current = true;
    };

    if (googlePending) {
      const result = await completeGoogleTwoFactor(code).catch(() => null);
      if (!result?.ok) {
        inFlight.current = false;
        rejectDigits();
        setVerifying(false);
        if (result?.code === "EXPIRED") {
          // The five-minute window passed: start the Google step again.
          setGooglePending(false);
          setStep("credentials");
          setError(t("errorGoogleTwoFactorExpired"));
          return;
        }
        const message =
          result?.code === "LOCKED"
            ? t("errorTwoFactorLockedMinutes", { minutes: result.retryAfterMinutes ?? 15 })
            : viaPasskey
              ? tPasskey("failed")
              : t(codeMode === "recovery" ? "errorInvalidRecoveryCode" : codeMode === "phrase" ? "errorInvalidPhrase" : "errorInvalidCode");
        setError(message);
        toast.error(message);
        void refreshPasskeyOptions();
        return;
      }
      setGooglePending(false);
    } else {
      const result = await signIn("credentials", { email, password, code, redirect: false }).catch(() => ({ error: "network" }) as const);
      if (result?.error) {
        inFlight.current = false;
        rejectDigits();
        setVerifying(false);
        const message = viaPasskey ? tPasskey("failed") : t(codeMode === "recovery" ? "errorInvalidRecoveryCode" : codeMode === "phrase" ? "errorInvalidPhrase" : "errorInvalidCode");
        setError(message);
        toast.error(message);
        void refreshPasskeyOptions();
        return;
      }
    }

    toast.success(t("toastSignedIn"));

    // The session now carries the user's saved locale (auth.ts's jwt/session
    // callbacks read it from the DB on sign-in) — if it differs from the
    // locale they're currently browsing in, send them to their saved one.
    const session = await getSession();
    // The modal's hook outlives this sign-in (it is reopened later), so the lock is released here too.
    inFlight.current = false;
    setVerifying(false);
    // A brand-new account: offer Face ID / Touch ID and the authenticator
    // before leaving — the modal stays open on the "secure" step and the
    // usual completion runs when they continue or skip.
    if (mode === "register") {
      pendingLocale.current = session?.user?.locale ?? null;
      setStep("secure");
      return;
    }
    complete(session?.user?.locale ?? null);
  };

  const pendingLocale = useRef<string | null>(null);
  /** "Continue" / "Skip for now" on the onboarding step. */
  const finishOnboarding = () => {
    // The modal's hook is reused on its next opening: start that one fresh.
    setStep("credentials");
    complete(pendingLocale.current);
  };

  const complete = (targetLocale: string | null) => {
    options.onSuccess?.();
    if (callbackUrl !== null) {
      // Locale-free and same-site only: the next-intl router adds the
      // locale itself (see lib/callbackPath).
      const destination = callbackPath(callbackUrl);
      if (targetLocale && targetLocale !== activeLocale) {
        router.push(destination, { locale: targetLocale });
        router.refresh();
        return;
      }
      router.push(destination);
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
    if (googlePending) {
      // Abandoning the paused Google sign-in: drop its challenge cookie.
      setGooglePending(false);
      void cancelGoogleTwoFactor().catch(() => {});
    }
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
    phrase,
    setPhrase,
    phraseRef,
    phraseChallenge,
    phraseWords,
    setPhraseWords,
    setCodeModeTo,
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
    finishOnboarding,
    passkeyAvailable: passkeyOptions !== null,
    passkeyBusy,
    verifyWithPasskey,
    handleGoogle,
    resendCode,
    goBackToCredentials,
    googlePending,
  };
}
