"use server";

import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import prisma from "@/lib/prisma";
import { GOOGLE_2FA_COOKIE, verifyGoogleTwoFactorChallenge } from "@/lib/googleTwoFactor";

export type GoogleTwoFactorResult =
  | { ok: true }
  | { ok: false; code: "EXPIRED" | "INVALID" | "LOCKED"; retryAfterMinutes?: number };

/**
 * Finishes a Google sign-in that paused for the authenticator code.
 *
 * The challenge comes from the HttpOnly cookie /api/two-factor/start set —
 * never from the client — and the "google-2fa" provider in auth.ts checks it
 * and the code before NextAuth issues the session cookie on this response.
 */
export async function completeGoogleTwoFactor(code: unknown): Promise<GoogleTwoFactorResult> {
  const jar = await cookies();
  const challenge = jar.get(GOOGLE_2FA_COOKIE)?.value;
  const parsed = verifyGoogleTwoFactorChallenge(challenge);
  if (!parsed) {
    jar.delete(GOOGLE_2FA_COOKIE);
    return { ok: false, code: "EXPIRED" };
  }
  if (typeof code !== "string" || code.trim().length < 6 || code.length > 200) return { ok: false, code: "INVALID" };

  try {
    await signIn("google-2fa", { challenge, code: code.trim(), redirect: false });
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    // authorize() can only say yes or no; read the row to tell a lockout
    // apart, so the screen can say "try again in 15 minutes" rather than
    // "wrong code" to someone typing the right one.
    const user = await prisma.user
      .findUnique({ where: { id: parsed.userId }, select: { twoFactorLockedUntil: true } })
      .catch(() => null);
    const lockedFor = user?.twoFactorLockedUntil ? user.twoFactorLockedUntil.getTime() - Date.now() : 0;
    if (lockedFor > 0) return { ok: false, code: "LOCKED", retryAfterMinutes: Math.ceil(lockedFor / 60_000) };
    return { ok: false, code: "INVALID" };
  }

  // Single use: the session exists now, the challenge must not outlive it.
  jar.delete(GOOGLE_2FA_COOKIE);
  return { ok: true };
}

/** "Back" on the code screen: abandon the paused Google sign-in. */
export async function cancelGoogleTwoFactor(): Promise<void> {
  (await cookies()).delete(GOOGLE_2FA_COOKIE);
}
