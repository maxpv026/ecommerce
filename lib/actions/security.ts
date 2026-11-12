"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth, unstable_update } from "@/auth";
import prisma from "@/lib/prisma";
import { listDeviceSessions, type DeviceSessionView } from "@/lib/deviceSessions";
import { mintRestamp } from "@/lib/sessionRevocation";
import { readStepUp, satisfies } from "@/lib/stepUp";
import {
  MAX_HINT_LENGTH,
  MAX_PHRASE_LENGTH,
  MIN_CUSTOM_LENGTH,
  generateRecoveryPhrase,
  hashRecoveryPhrase,
  looksLikePhrase,
  normalizePhrase,
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
  phrase: { set: boolean; hint: string | null; setAt: string | null };
}

type Fail = { ok: false; code: "UNAUTHENTICATED" | "STEP_UP_REQUIRED" | "STEP_UP_STRONG_REQUIRED" | "NOT_FOUND" | "INVALID" | "HINT_REVEALS" | "FAILED" };
export type SecurityResult = ({ ok: true; state: SecurityState } & { phrase?: string }) | Fail;

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
      select: { isTwoFactorEnabled: true, recoveryCodes: true, recoveryPhraseHash: true, recoveryPhraseHint: true, recoveryPhraseSetAt: true },
    }),
    listDeviceSessions(userId, sid),
  ]);
  return {
    sessions,
    twoFactor: Boolean(user?.isTwoFactorEnabled),
    recoveryCodesLeft: user?.recoveryCodes.length ?? 0,
    phrase: { set: Boolean(user?.recoveryPhraseHash), hint: user?.recoveryPhraseHint ?? null, setAt: user?.recoveryPhraseSetAt?.toISOString() ?? null },
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

const PhraseInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate"), hint: z.string().trim().max(MAX_HINT_LENGTH).optional() }),
  z.object({ mode: z.literal("custom"), phrase: z.string().min(MIN_CUSTOM_LENGTH).max(MAX_PHRASE_LENGTH), hint: z.string().trim().max(MAX_HINT_LENGTH).optional() }),
]);

/**
 * Sets (or replaces) the recovery phrase. A generated phrase is returned
 * exactly once, here; only its hash is stored. Strong step-up when 2FA is
 * on: the phrase can stand in for the authenticator at sign-in.
 */
export async function setRecoveryPhrase(raw: unknown): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = PhraseInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const input = parsed.data;
  const phrase = input.mode === "generate" ? generateRecoveryPhrase() : input.phrase;
  if (input.mode === "custom" && !looksLikePhrase(phrase)) return { ok: false, code: "INVALID" };
  const hint = input.hint?.trim() || null;
  // A hint that contains the phrase is the phrase in plain text.
  if (hint && normalizePhrase(hint).includes(normalizePhrase(phrase))) return { ok: false, code: "HINT_REVEALS" };

  const denied = await gate(c.userId, c.sid, true);
  if (denied) return denied;
  await prisma.user.update({
    where: { id: c.userId },
    data: { recoveryPhraseHash: await hashRecoveryPhrase(phrase), recoveryPhraseHint: hint, recoveryPhraseSetAt: new Date() },
  });
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null), ...(input.mode === "generate" ? { phrase } : {}) };
}

export async function removeRecoveryPhrase(): Promise<SecurityResult> {
  const c = await caller();
  if (!c) return { ok: false, code: "UNAUTHENTICATED" };
  const denied = await gate(c.userId, c.sid, true);
  if (denied) return denied;
  await prisma.user.update({ where: { id: c.userId }, data: { recoveryPhraseHash: null, recoveryPhraseHint: null, recoveryPhraseSetAt: null } });
  refresh();
  return { ok: true, state: await securityState(c.userId, c.sid ?? null) };
}
