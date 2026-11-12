"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth, unstable_update } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { listDeviceSessions, type DeviceSessionView } from "@/lib/deviceSessions";
import { mintRestamp } from "@/lib/sessionRevocation";
import { readStepUp, satisfies } from "@/lib/stepUp";
import { randomUUID } from "node:crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  MAX_HINT_LENGTH,
  MAX_PHRASE_LENGTH,
  MIN_CUSTOM_LENGTH,
  SETUP_CONFIRM_WORDS,
  SETUP_TTL_MS,
  createSeedPhrase,
  hashCustomPhrase,
  issueChallenge,
  looksLikePhrase,
  normalizePhrase,
  phraseTypeOf,
  pickPositions,
  readChallenge,
  seedWordsMatch,
  type RecoveryPhraseType,
} from "@/lib/recoveryPhrase";

/**
 * Security changes that require step-up (lib/stepUp): ending sessions,
 * turning 2FA off, and setting or removing the recovery phrase.
 *
 * Every action answers STEP_UP_REQUIRED when there is no fresh proof, and
 * the UI opens the verification dialog and retries — so the server, not the
 * page, decides that a check is due.
 */

export interface SecurityState {
  sessions: DeviceSessionView[];
  twoFactor: boolean;
  recoveryCodesLeft: number;
  phrase: { set: boolean; type: RecoveryPhraseType | null; hint: string | null; setAt: string | null };
}

type Fail = {
  ok: false;
  code: "UNAUTHENTICATED" | "STEP_UP_REQUIRED" | "STEP_UP_STRONG_REQUIRED" | "NOT_FOUND" | "INVALID" | "HINT_REVEALS" | "WRONG_WORDS" | "EXPIRED" | "RATE_LIMITED" | "FAILED";
};
export type SecurityResult = { ok: true; state: SecurityState } | Fail;

async function caller() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { userId, sid: session.user.sessionId };
}

export async function getSecurityState(): Promise<SecurityState | null> {
  const c = await caller();
  return c ? securityState(c.userId, c.sid ?? null) : null;
}

async function securityState(userId: string, sid: string | null): Promise<SecurityState> {
  const [user, sessions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { isTwoFactorEnabled: true, recoveryCodes: true, recoveryPhraseHash: true, recoveryPhraseHint: true, recoveryPhraseSetAt: true, recoveryPhraseType: true, recoveryPhraseSalt: true },
    }),
    listDeviceSessions(userId, sid),
  ]);
  return {
    sessions,
    twoFactor: Boolean(user?.isTwoFactorEnabled),
    recoveryCodesLeft: user?.recoveryCodes.length ?? 0,
    phrase: (() => {
      const type = user ? phraseTypeOf(user) : null;
      return { set: type !== null, type, hint: type === "CUSTOM_PHRASE" ? (user?.recoveryPhraseHint ?? null) : null, setAt: user?.recoveryPhraseSetAt?.toISOString() ?? null };
    })(),
  };
}

/** Is there a fresh step-up proof — a strong one when `strongIf2fa` and 2FA is on? */
async function gate(userId: string, sid: string | undefined, strongIf2fa: boolean): Promise<Fail | null> {
  const method = await readStepUp(userId, sid);
  if (!method) return { ok: false, code: "STEP_UP_REQUIRED" };
  if (strongIf2fa) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isTwoFactorEnabled: true } });
    if (user?.isTwoFactorEnabled && !satisfies(method, true)) return { ok: false, code: "STEP_UP_STRONG_REQUIRED" };
  }
  return null;
}

const refresh = () => {
  revalidatePath("/[locale]/profile/settings", "page");
  revalidatePath("/[locale]/notifications", "page");
};

/** Ends one other device's session. Its next request is signed out (auth.ts). */
export async function revokeDeviceSession(id: unknown): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  if (typeof id !== "string" || id.length > 64) return { ok: false, code: "INVALID" };
  const denied = await gate(c.userId, c.sid, false);
  if (denied) return denied;
  const { count } = await prisma.userSession.updateMany({
    // Never this device — that is "sign out", not "end a session".
    where: { id, userId: c.userId, revokedAt: null, ...(c.sid ? { NOT: { sessionTokenId: c.sid } } : {}) },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return { ok: false, code: "NOT_FOUND" };
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
}

/**
 * Ends every other session: the listed rows, and — through the account-wide
 * revocation time (lib/sessionRevocation) — any older token that has not
 * been seen since rows existed. This device re-stamps itself and stays in.
 */
export async function revokeOtherDeviceSessions(): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const denied = await gate(c.userId, c.sid, false);
  if (denied) return denied;
  try {
    const now = new Date();
    await prisma.$transaction([
      prisma.userSession.updateMany({
        where: { userId: c.userId, revokedAt: null, ...(c.sid ? { NOT: { sessionTokenId: c.sid } } : {}) },
        data: { revokedAt: now },
      }),
      prisma.user.update({ where: { id: c.userId }, data: { sessionsRevokedAt: now } }),
    ]);
    try {
      await unstable_update({ restamp: mintRestamp(c.userId, now) } as Parameters<typeof unstable_update>[0]);
    } catch (error) {
      console.error("revokeOtherDeviceSessions: could not keep this device signed in:", error);
    }
    refresh();
    return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
  } catch (error) {
    console.error("revokeOtherDeviceSessions failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/**
 * Turns the authenticator off. Requires a STRONG step-up (the authenticator,
 * a recovery code or the recovery phrase): an emailed code or the password
 * must not be enough to remove the factor that protects against exactly
 * someone who has those.
 */
export async function disableTwoFactorWithStepUp(): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const denied = await gate(c.userId, c.sid, true);
  if (denied) return denied;
  await prisma.user.update({
    where: { id: c.userId },
    data: { isTwoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null, twoFactorFailedAttempts: 0, twoFactorLockedUntil: null, recoveryCodes: [] },
  });
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
}

const CLEAR_SEED = { recoveryPhraseType: null, recoveryPhraseSalt: null, recoveryWordHashes: Prisma.DbNull, recoveryPhrasePending: Prisma.DbNull, recoveryLastChallengeAt: null };

const CustomInput = z.object({ phrase: z.string().min(MIN_CUSTOM_LENGTH).max(MAX_PHRASE_LENGTH), hint: z.string().trim().max(MAX_HINT_LENGTH).optional() });

/**
 * CUSTOM_PHRASE: the buyer's own passphrase + optional hint (Telegram-style).
 * Strong step-up when 2FA is on: the phrase can stand in for the
 * authenticator at sign-in. Replaces any 12-word phrase.
 */
export async function setCustomRecoveryPhrase(raw: unknown): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = CustomInput.safeParse(raw);
  if (!parsed.success || !looksLikePhrase(parsed.data.phrase) || parsed.data.phrase.trim().startsWith("seed:")) return { ok: false, code: "INVALID" };
  const hint = parsed.data.hint?.trim() || null;
  // A hint that contains (or is) the phrase is the phrase in plain text.
  if (hint && normalizePhrase(hint).includes(normalizePhrase(parsed.data.phrase))) return { ok: false, code: "HINT_REVEALS" };

  const denied = await gate(c.userId, c.sid, true);
  if (denied) return denied;
  await prisma.user.update({
    where: { id: c.userId },
    data: { ...CLEAR_SEED, recoveryPhraseType: "CUSTOM_PHRASE", recoveryPhraseHash: await hashCustomPhrase(parsed.data.phrase), recoveryPhraseHint: hint, recoveryPhraseSetAt: new Date() },
  });
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
}

interface PendingSeed {
  id: string;
  salt: string;
  hashes: string[];
  createdAt: number;
}

export type StartSeedResult = { ok: true; words: string[]; confirm: { indices: number[]; token: string } } | Fail;

/**
 * SEED_12, step 1: twelve fresh words. Only their hashes are kept, as a
 * PENDING record — nothing changes for sign-in until the buyer proves they
 * wrote the words down (confirmSeedPhrase). The words leave the server once,
 * in this response.
 */
export async function startSeedPhrase(): Promise<StartSeedResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const denied = await gate(c.userId, c.sid, true);
  if (denied) return denied;
  const { words, record } = await createSeedPhrase();
  const pending: PendingSeed = { id: randomUUID(), salt: record.salt, hashes: record.hashes, createdAt: Date.now() };
  await prisma.user.update({ where: { id: c.userId }, data: { recoveryPhrasePending: pending as unknown as Prisma.InputJsonValue } });
  const indices = pickPositions(SETUP_CONFIRM_WORDS);
  return { ok: true, words, confirm: { indices, token: issueChallenge(c.userId, "setup", indices, pending.id, SETUP_TTL_MS) } };
}

const ConfirmInput = z.object({ token: z.string().min(10).max(400), words: z.array(z.string().max(40)).length(SETUP_CONFIRM_WORDS) });

/**
 * SEED_12, step 2: the buyer types 3 random positions back. Checked against
 * the pending hashes; on a match the pending record becomes the active one
 * (replacing any custom phrase). Bound to that exact pending record and
 * valid for 30 minutes — long enough to write twelve words by hand.
 */
export async function confirmSeedPhrase(raw: unknown): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = ConfirmInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  if (!checkRateLimit(`seed-confirm:${c.userId}`, { limit: 8, windowMs: 10 * 60_000 }).success) return { ok: false, code: "RATE_LIMITED" };

  const row = await prisma.user.findUnique({ where: { id: c.userId }, select: { recoveryPhrasePending: true } });
  const pending = row?.recoveryPhrasePending as PendingSeed | null;
  const challenge = readChallenge(parsed.data.token, c.userId, "setup");
  if (!pending || !challenge || challenge.b !== pending.id || Date.now() - pending.createdAt > SETUP_TTL_MS) return { ok: false, code: "EXPIRED" };
  if (!(await seedWordsMatch({ salt: pending.salt, hashes: pending.hashes }, challenge.i, parsed.data.words))) return { ok: false, code: "WRONG_WORDS" };

  await prisma.user.update({
    where: { id: c.userId },
    data: {
      recoveryPhraseType: "SEED_12",
      recoveryPhraseSalt: pending.salt,
      recoveryWordHashes: pending.hashes,
      recoveryPhrasePending: Prisma.DbNull,
      recoveryLastChallengeAt: null,
      recoveryPhraseHash: null,
      recoveryPhraseHint: null,
      recoveryPhraseSetAt: new Date(),
    },
  });
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
}

export async function removeRecoveryPhrase(): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const denied = await gate(c.userId, c.sid, true);
  if (denied) return denied;
  await prisma.user.update({ where: { id: c.userId }, data: { ...CLEAR_SEED, recoveryPhraseHash: null, recoveryPhraseHint: null, recoveryPhraseSetAt: null } });
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
}
