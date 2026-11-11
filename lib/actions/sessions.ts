"use server";

import { auth, unstable_update } from "@/auth";
import prisma from "@/lib/prisma";
import { mintRestamp } from "@/lib/sessionRevocation";
import { withinActionLimit } from "@/lib/actionRateLimit";

export type SignOutOthersResult = { ok: true } | { ok: false; code: "UNAUTHENTICATED" | "RATE_LIMITED" | "FAILED" };

/**
 * "Sign out of all other devices".
 *
 * Sessions are stateless JWTs, so nothing is deleted: the account records a
 * revocation time, and auth.ts refuses every token authenticated before it
 * (lib/sessionRevocation — the same mechanism a password change uses). The
 * device that asked re-stamps its own session with a server-minted stamp, so
 * it alone stays signed in. If the re-stamp fails it is signed out as well,
 * which is the safe direction.
 */
export async function signOutOtherDevices(): Promise<SignOutOthersResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  if (!(await withinActionLimit("sign-out-others", { limit: 5, windowMs: 60_000 }))) return { ok: false, code: "RATE_LIMITED" };

  try {
    const revokedAt = new Date();
    await prisma.user.update({ where: { id: userId }, data: { sessionsRevokedAt: revokedAt } });
    try {
      await unstable_update({ restamp: mintRestamp(userId, revokedAt) } as Parameters<typeof unstable_update>[0]);
    } catch (error) {
      console.error("signOutOtherDevices: could not keep this device signed in:", error);
    }
    return { ok: true };
  } catch (error) {
    console.error("signOutOtherDevices failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
