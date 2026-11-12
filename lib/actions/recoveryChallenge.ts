"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { checkPassword } from "@/lib/loginThrottle";
import { withinActionLimit } from "@/lib/actionRateLimit";
import { GOOGLE_2FA_COOKIE, verifyGoogleTwoFactorChallenge } from "@/lib/googleTwoFactor";
import { recoveryChallengeFor, type RecoveryChallenge } from "@/lib/recoveryPhrase";

/**
 * The recovery-phrase challenge at the 2FA step of sign-in.
 *
 * Before a session exists, so it must not tell a stranger anything: it
 * answers only someone who has already passed the first factor — the
 * password again (counted by the same per-account lockout), or the signed
 * HttpOnly cookie of a Google sign-in paused for 2FA — and only for accounts
 * that actually use two-factor sign-in. Everyone else gets NONE, which is
 * also what a wrong password gets: no hint, no positions, no "has a phrase".
 */

const PasswordInput = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });

const select = {
  id: true,
  password: true,
  loginLockedUntil: true,
  isTwoFactorEnabled: true,
  recoveryPhraseHash: true,
  recoveryPhraseHint: true,
  recoveryPhraseType: true,
  recoveryPhraseSalt: true,
} as const;

export async function getLoginRecoveryChallenge(raw: unknown): Promise<RecoveryChallenge> {
  if (!(await withinActionLimit("login-recovery-challenge", { limit: 20, windowMs: 60_000 }))) return { type: "NONE" };

  if (raw && typeof raw === "object" && "google" in raw) {
    const pending = verifyGoogleTwoFactorChallenge((await cookies()).get(GOOGLE_2FA_COOKIE)?.value);
    if (!pending) return { type: "NONE" };
    const user = await prisma.user.findUnique({ where: { id: pending.userId }, select });
    return user?.isTwoFactorEnabled ? recoveryChallengeFor(user, "login") : { type: "NONE" };
  }

  const parsed = PasswordInput.safeParse(raw);
  if (!parsed.success) return { type: "NONE" };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select });
  if (!user?.password || !user.isTwoFactorEnabled) return { type: "NONE" };
  if ((await checkPassword(user, parsed.data.password)) !== "ok") return { type: "NONE" };
  return recoveryChallengeFor(user, "login");
}
