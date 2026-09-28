import "server-only";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateSync, generateURI, verifySync } from "otplib";
import type { PrismaClient } from "./generated/prisma/client";

/**
 * TOTP verification, shared by the setup actions and the sign-in flow so
 * both enforce the same rules.
 *
 * Two protections beyond "does the code match", because without them a
 * six-digit secret is not a second factor:
 *
 *   Replay — RFC 6238 §5.2 requires a code to be accepted at most once. A
 *   TOTP stays valid for its whole 30-second step (longer with a window), so
 *   a code seen over someone's shoulder, or captured by a phishing proxy, is
 *   reusable for a while. We record the time step of every accepted code and
 *   hand it to otplib as `afterTimeStep`, which refuses anything at or below
 *   it.
 *
 *   Brute force — six digits is 10^6, and a ±1 window makes three of those
 *   acceptable at any moment. An attacker who already has the password can
 *   grind that in hours. Consecutive failures are counted and the account's
 *   second factor locks for a spell once the ceiling is reached.
 */

/** Shown on the enrolment screen and inside the authenticator app. */
export const TOTP_ISSUER = "My Energy";

/**
 * Clock-drift allowance, in SECONDS (otplib v13 takes a tolerance in
 * seconds, not in steps — passing 1 here would mean one second, not one
 * 30-second step). ±30s accepts the adjacent step either side, the usual
 * allowance for a phone whose clock has wandered.
 */
const EPOCH_TOLERANCE_SECONDS = 30;

/** Consecutive failures before the second factor locks. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long it stays locked. Long enough to make grinding useless. */
export const LOCKOUT_MS = 15 * 60 * 1000;

/** How many single-use codes are issued at enrolment. */
export const RECOVERY_CODE_COUNT = 10;
/** bcrypt cost. 10 matches the password hashing already used at sign-in. */
const RECOVERY_SALT_ROUNDS = 10;

export type TwoFactorFailure = "INVALID_CODE" | "LOCKED" | "NOT_ENROLLED" | "REPLAYED";

/** A recovery code as issued: 8 lowercase hex characters. */
export function looksLikeRecoveryCode(code: string): boolean {
  return /^[0-9a-f]{8}$/i.test(code.trim().replace(/[\s-]/g, ""));
}

/** Normalises what a person actually types: case, spaces, and pasted dashes. */
export function normalizeRecoveryCode(code: string): string {
  return code.trim().replace(/[\s-]/g, "").toLowerCase();
}

/**
 * Mints a fresh set of recovery codes and their hashes.
 *
 * Returns the plaintext once, for the screen, and the hashes for the row.
 * The plaintext is never persisted: this array is the entire second factor
 * for someone who has lost their phone, so a database leak must not be
 * enough to sign in as them.
 */
export async function createRecoveryCodes(
  count = RECOVERY_CODE_COUNT
): Promise<{ plain: string[]; hashed: string[] }> {
  // 4 random bytes → 8 hex characters → 2^32 possibilities per code. Plenty
  // against online guessing, given the same lockout the TOTP path uses.
  const plain = Array.from({ length: count }, () => randomBytes(4).toString("hex"));
  const hashed = await Promise.all(plain.map((code) => bcrypt.hash(code, RECOVERY_SALT_ROUNDS)));
  return { plain, hashed };
}

export type TwoFactorCheck =
  | { ok: true; timeStep: number }
  | { ok: false; reason: TwoFactorFailure; retryAfterMs?: number };

/** Format check only — never a substitute for verifying against the secret. */
export function looksLikeTotp(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function createTotpSecret(): string {
  return generateSecret();
}

/** The `otpauth://` URI an authenticator app scans. */
export function totpUri(secret: string, accountLabel: string): string {
  return generateURI({ strategy: "totp", issuer: TOTP_ISSUER, label: accountLabel, secret });
}

/** Only for tests and tooling — never call this to "check" a user's code. */
export function currentTotp(secret: string): string {
  return generateSync({ secret, strategy: "totp" });
}

interface TwoFactorState {
  id: string;
  twoFactorSecret: string | null;
  twoFactorLastStep: number | null;
  twoFactorFailedAttempts: number;
  twoFactorLockedUntil: Date | null;
}

/**
 * Verifies one code against a user's secret and records the outcome.
 *
 * Always goes through the database so lockout and replay state survive
 * across requests and processes — an in-memory counter would reset on every
 * serverless invocation, which is no counter at all.
 */
export async function verifyTotpForUser(
  prisma: Pick<PrismaClient, "user">,
  user: TwoFactorState,
  rawCode: string,
  now: Date = new Date()
): Promise<TwoFactorCheck> {
  if (!user.twoFactorSecret) return { ok: false, reason: "NOT_ENROLLED" };

  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: "LOCKED",
      retryAfterMs: user.twoFactorLockedUntil.getTime() - now.getTime(),
    };
  }

  const code = rawCode.trim();
  const result = looksLikeTotp(code)
    ? verifySync({
        token: code,
        secret: user.twoFactorSecret,
        strategy: "totp",
        epochTolerance: EPOCH_TOLERANCE_SECONDS,
        // The replay guard: anything at or below the last accepted step is
        // refused even when it is arithmetically a valid code.
        ...(user.twoFactorLastStep !== null ? { afterTimeStep: user.twoFactorLastStep } : {}),
      })
    : { valid: false as const };

  if (!result.valid) {
    const attempts = user.twoFactorFailedAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          twoFactorFailedAttempts: locked ? 0 : attempts,
          twoFactorLockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : user.twoFactorLockedUntil,
        },
      })
      .catch((error) => console.error("[2fa] could not record a failed attempt:", error));

    return locked
      ? { ok: false, reason: "LOCKED", retryAfterMs: LOCKOUT_MS }
      : { ok: false, reason: "INVALID_CODE" };
  }

  const timeStep = "timeStep" in result && typeof result.timeStep === "number" ? result.timeStep : null;

  // Burn the step before returning success, so two requests racing with the
  // same code cannot both be accepted.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorLastStep: timeStep,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
    },
  });

  return { ok: true, timeStep: timeStep ?? 0 };
}

export type RecoveryCheck =
  | { ok: true; remaining: number }
  | { ok: false; reason: TwoFactorFailure; retryAfterMs?: number };

/**
 * Spends one recovery code.
 *
 * The consume is a conditional update, not a read-then-write: two sign-ins
 * racing with the same code would both find the matching hash, and a
 * plain update would let both through. The `where` still naming the hash
 * makes the database the arbiter — exactly one caller sees count 1.
 */
export async function consumeRecoveryCode(
  prisma: Pick<PrismaClient, "user">,
  user: TwoFactorState & { recoveryCodes: string[] },
  rawCode: string,
  now: Date = new Date()
): Promise<RecoveryCheck> {
  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: "LOCKED", retryAfterMs: user.twoFactorLockedUntil.getTime() - now.getTime() };
  }
  if (user.recoveryCodes.length === 0) return { ok: false, reason: "NOT_ENROLLED" };

  const code = normalizeRecoveryCode(rawCode);

  // Every hash is compared even after a match is found. Returning early
  // would make the response time reveal roughly where in the list a code
  // sits, and a wrong code cheaper than a right one.
  let matched: string | null = null;
  for (const hash of user.recoveryCodes) {
    const hit = await bcrypt.compare(code, hash).catch(() => false);
    if (hit && matched === null) matched = hash;
  }

  if (matched === null) {
    const attempts = user.twoFactorFailedAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          twoFactorFailedAttempts: locked ? 0 : attempts,
          twoFactorLockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : user.twoFactorLockedUntil,
        },
      })
      .catch((error) => console.error("[2fa] could not record a failed recovery attempt:", error));
    return locked
      ? { ok: false, reason: "LOCKED", retryAfterMs: LOCKOUT_MS }
      : { ok: false, reason: "INVALID_CODE" };
  }

  const remaining = user.recoveryCodes.filter((hash) => hash !== matched);
  const claim = await prisma.user.updateMany({
    // `has: matched` is the claim — the row must still carry this hash.
    where: { id: user.id, recoveryCodes: { has: matched } },
    data: { recoveryCodes: remaining, twoFactorFailedAttempts: 0, twoFactorLockedUntil: null },
  });
  // Someone else spent it first; that is a refusal, not a success.
  if (claim.count === 0) return { ok: false, reason: "INVALID_CODE" };

  return { ok: true, remaining: remaining.length };
}
