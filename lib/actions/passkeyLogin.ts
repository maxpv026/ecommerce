"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { checkPassword } from "@/lib/loginThrottle";
import { withinActionLimit } from "@/lib/actionRateLimit";
import { GOOGLE_2FA_COOKIE, verifyGoogleTwoFactorChallenge } from "@/lib/googleTwoFactor";
import { startAssertion } from "@/lib/passkeys";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

/**
 * Passkey options for the second step of sign-in (Face ID / Touch ID).
 *
 * Before a session exists, so like the recovery-phrase challenge it answers
 * only someone who has passed the first factor — the password again (counted
 * by the per-account lockout), or the signed cookie of a Google sign-in
 * paused for 2FA. Everyone else, and anyone without a passkey on THIS domain,
 * gets `null`: no "this account has a passkey" signal for a stranger.
 *
 * The client asks once when the code step opens and again after each
 * attempt: options carry a single-use, five-minute challenge (lib/passkeys),
 * and asking ahead keeps the Face ID prompt inside the tap that starts it —
 * Safari refuses one that follows a network round trip.
 */

const PasswordInput = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });

export async function getPasskeyLoginOptions(raw: unknown): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  if (!(await withinActionLimit("passkey-login-options", { limit: 20, windowMs: 60_000 }))) return null;

  let userId: string | null = null;
  if (raw && typeof raw === "object" && "google" in raw) {
    const pending = verifyGoogleTwoFactorChallenge((await cookies()).get(GOOGLE_2FA_COOKIE)?.value);
    userId = pending?.userId ?? null;
  } else {
    const parsed = PasswordInput.safeParse(raw);
    if (!parsed.success) return null;
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, password: true, loginLockedUntil: true, lockedAt: true } });
    if (!user?.password || user.lockedAt) return null;
    if ((await checkPassword(user, parsed.data.password)) !== "ok") return null;
    userId = user.id;
  }
  if (!userId) return null;
  const start = await startAssertion(userId, "login");
  return start.ok ? start.options : null;
}
