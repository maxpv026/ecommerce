import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The paused-login challenge for "Continue with Google" on an account that
 * has an authenticator enrolled.
 *
 * Flow (see auth.ts):
 *   1. Google OAuth succeeds → callbacks.signIn sees the authenticator and,
 *      instead of allowing the login, redirects with a challenge minted here.
 *      No session exists at this point, and no account link is made.
 *   2. /api/two-factor/start moves the challenge into an HttpOnly cookie and
 *      sends the browser to /auth?step=google-2fa.
 *   3. The code is submitted to completeGoogleTwoFactor, which signs in
 *      through the "google-2fa" credentials provider; its authorize()
 *      verifies this challenge AND the TOTP/recovery code before NextAuth
 *      issues the normal session.
 *
 * Why stateless (signed, not stored): the challenge only stands in for "Google
 * just proved who this is", for five minutes. Guessing protection already
 * lives in the database — verifyTotpForUser locks the account after five bad
 * codes and refuses a replayed step, recovery codes are single-use — so a
 * challenge table would add a write per login and nothing an attacker has to
 * get past.
 *
 * Why never a "half session" (is2faVerified: false in the JWT): every
 * auth()/useSession() caller would have to remember to check the flag, and
 * the first one that forgets grants full access. Here, before the second
 * factor, there is simply no session to misuse.
 */

export const GOOGLE_2FA_COOKIE = "me.google-2fa";
export const GOOGLE_2FA_TTL_SECONDS = 5 * 60;

export interface GoogleTwoFactorChallenge {
  /** The local account Google resolved to. */
  userId: string;
  /** Google's subject id, so the account can be linked once the code passes. */
  providerAccountId: string;
}

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for the Google 2FA challenge");
  // Purpose-bound, so this signature can't be confused with any other
  // HMAC made from the same secret (unsubscribe links, for one).
  return createHmac("sha256", secret).update("google-2fa-challenge/v1").digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function createGoogleTwoFactorChallenge(challenge: GoogleTwoFactorChallenge, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: challenge.userId,
      a: challenge.providerAccountId,
      exp: now + GOOGLE_2FA_TTL_SECONDS * 1000,
      // Makes every challenge unique, so two are never interchangeable.
      n: randomBytes(12).toString("base64url"),
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyGoogleTwoFactorChallenge(token: string | null | undefined, now = Date.now()): GoogleTwoFactorChallenge | null {
  if (!token || token.length > 1024) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: unknown; a?: unknown; exp?: unknown };
    if (typeof data.u !== "string" || typeof data.a !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < now) return null;
    return { userId: data.u, providerAccountId: data.a };
  } catch {
    return null;
  }
}

/** Cookie attributes. Secure only over https, so localhost dev still works. */
export function challengeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GOOGLE_2FA_TTL_SECONDS,
  };
}
