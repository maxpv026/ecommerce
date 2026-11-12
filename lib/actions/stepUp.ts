"use server";

import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { createOtp, otpRecentlySent, verifyAndConsumeOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mail";
import { checkPassword } from "@/lib/loginThrottle";
import { consumeRecoveryCode, looksLikeRecoveryCode, verifyTotpForUser } from "@/lib/twoFactor";
import { phraseTypeOf, recoveryChallengeFor, verifyRecoveryForUser, type RecoveryChallenge } from "@/lib/recoveryPhrase";
import { grantStepUp, readStepUp, type StepUpMethod } from "@/lib/stepUp";

/**
 * Step-up verification (see lib/stepUp). Any method the account actually
 * has: the authenticator (or a recovery code), a code emailed to the
 * account address — available to every account, Google-only ones included —
 * the password, or the recovery phrase. Each method keeps its own existing
 * brakes: the TOTP/phrase lockout, the password lockout, the five-guess OTP.
 */

export interface StepUpOptions {
  totp: boolean;
  email: string | null;
  password: boolean;
  phrase: boolean;
  /** The method of a proof still valid on this device, if any. */
  active: StepUpMethod | null;
}

async function caller() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      password: true,
      loginLockedUntil: true,
      isTwoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorLastStep: true,
      twoFactorFailedAttempts: true,
      twoFactorLockedUntil: true,
      recoveryCodes: true,
      recoveryPhraseHash: true,
      recoveryPhraseHint: true,
      recoveryPhraseType: true,
      recoveryPhraseSalt: true,
      recoveryWordHashes: true,
      recoveryLastChallengeAt: true,
    },
  });
  return user ? { user, sid: session?.user?.sessionId } : null;
}

export async function getStepUpOptions(): Promise<StepUpOptions | null> {
  const c = await caller();
  if (!c) return null;
  return {
    totp: c.user.isTwoFactorEnabled && Boolean(c.user.twoFactorSecret),
    email: c.user.email,
    password: Boolean(c.user.password),
    phrase: phraseTypeOf(c.user) !== null,
    active: await readStepUp(c.user.id, c.sid),
  };
}

export type SendStepUpCodeResult = { ok: true } | { ok: false; code: "UNAUTHENTICATED" | "NO_EMAIL" | "SEND_FAILED" };

export async function sendStepUpEmailCode(): Promise<SendStepUpCodeResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const email = c.user.email?.toLowerCase();
  if (!email) return { ok: false, code: "NO_EMAIL" };
  // A code sent seconds ago is still valid: don't mail another.
  if (await otpRecentlySent(email, "step-up")) return { ok: true };
  try {
    await sendOtpEmail(email, await createOtp(email, "step-up"));
    return { ok: true };
  } catch (error) {
    console.error("[step-up] could not send the code:", error);
    return { ok: false, code: "SEND_FAILED" };
  }
}

// 600: a word-challenge answer carries its signed token (lib/recoveryPhrase).
const Input = z.object({ method: z.enum(["totp", "email", "password", "phrase"]), secret: z.string().min(1).max(600) });

export type VerifyStepUpResult =
  | { ok: true; method: StepUpMethod; expiresAt: number }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID" | "LOCKED" | "UNAVAILABLE" | "RATE_LIMITED"; retryAfterMinutes?: number };

export async function verifyStepUp(raw: unknown): Promise<VerifyStepUpResult> {
  const c = await caller();
  if (!c || !c.sid) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  if (!checkRateLimit(`step-up:${c.user.id}`, { limit: 10, windowMs: 10 * 60_000 }).success) return { ok: false, code: "RATE_LIMITED" };
  const { method, secret } = parsed.data;
  const { user } = c;
  const locked = (ms?: number) => ({ ok: false as const, code: "LOCKED" as const, retryAfterMinutes: Math.ceil((ms ?? 15 * 60_000) / 60_000) });

  let passed = false;
  if (method === "totp") {
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) return { ok: false, code: "UNAVAILABLE" };
    // A printed recovery code is the authenticator's own fallback.
    const check = looksLikeRecoveryCode(secret) ? await consumeRecoveryCode(prisma, user, secret) : await verifyTotpForUser(prisma, user, secret.trim());
    if (!check.ok && check.reason === "LOCKED") return locked(check.retryAfterMs);
    passed = check.ok;
  } else if (method === "email") {
    if (!user.email) return { ok: false, code: "UNAVAILABLE" };
    passed = /^\d{6}$/.test(secret.trim()) && (await verifyAndConsumeOtp(user.email.toLowerCase(), secret.trim(), "step-up"));
  } else if (method === "password") {
    if (!user.password) return { ok: false, code: "UNAVAILABLE" };
    const check = await checkPassword(user, secret);
    if (check === "locked") return locked();
    passed = check === "ok";
  } else {
    if (!phraseTypeOf(user)) return { ok: false, code: "UNAVAILABLE" };
    const check = await verifyRecoveryForUser(prisma, user, secret, "step-up");
    if (!check.ok && check.reason === "LOCKED") return locked(check.retryAfterMs);
    passed = check.ok;
  }

  if (!passed) return { ok: false, code: "INVALID" };
  const expiresAt = await grantStepUp(user.id, c.sid, method);
  return { ok: true, method, expiresAt };
}

/**
 * What the recovery-phrase tab must ask for: 4 random word positions (a
 * signed, single-use challenge) for a 12-word phrase, or the passphrase with
 * its hint. Signed-in only — this is step-up, the person is already known.
 */
export async function getStepUpPhraseChallenge(): Promise<RecoveryChallenge | null> {
  const c = await caller();
  return c ? recoveryChallengeFor(c.user, "step-up") : null;
}
