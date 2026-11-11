import "server-only";

import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

/**
 * Per-account password lockout, stored on the User row.
 *
 * Two places check a password: sign-in step 1 (lib/actions/otp — a Server
 * Action, which the proxy's path-based limiter never sees) and the
 * Credentials provider (auth.ts). Both go through checkPassword, so a guess
 * costs the same wherever it is made, and the count survives restarts,
 * regions and serverless instances — unlike the in-memory per-IP limiter.
 *
 * Ten wrong passwords lock the account for fifteen minutes. While locked,
 * even the RIGHT password is refused, so the lock can't be used as an oracle.
 * A correct password resets the count.
 */

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

export type PasswordCheck = "ok" | "wrong" | "locked";

export async function checkPassword(user: { id: string; password: string | null; loginLockedUntil: Date | null }, password: string): Promise<PasswordCheck> {
  if (!user.password) return "wrong";
  if (user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()) return "locked";

  if (await bcrypt.compare(password, user.password)) {
    await prisma.user
      .updateMany({ where: { id: user.id, OR: [{ loginFailedAttempts: { gt: 0 } }, { loginLockedUntil: { not: null } }] }, data: { loginFailedAttempts: 0, loginLockedUntil: null } })
      .catch((error) => console.error("[auth] could not reset the failed-login count:", error));
    return "ok";
  }

  try {
    // Atomic increment; the lock is set by whichever request crosses the line.
    const { loginFailedAttempts } = await prisma.user.update({
      where: { id: user.id },
      data: { loginFailedAttempts: { increment: 1 } },
      select: { loginFailedAttempts: true },
    });
    if (loginFailedAttempts >= MAX_FAILURES) {
      await prisma.user.update({ where: { id: user.id }, data: { loginFailedAttempts: 0, loginLockedUntil: new Date(Date.now() + LOCK_MS) } });
      console.warn(`[auth] account ${user.id} locked for ${LOCK_MS / 60000} min after ${MAX_FAILURES} wrong passwords`);
      return "locked";
    }
  } catch (error) {
    console.error("[auth] could not record a failed login:", error);
  }
  return "wrong";
}
