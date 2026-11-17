"use server";

import { z } from "zod";
import { auth, unstable_update } from "@/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { effectiveRole, isStaffRole } from "@/lib/rbac";
import { verifyTotpForUser } from "@/lib/twoFactor";
import { currentRelyingParty, startAssertion, verifyAssertion } from "@/lib/passkeys";
import { mintElevation } from "@/lib/authStrength";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

/**
 * /admin-unlock — a staff session that signed in with a weak second factor
 * (an emailed code, Google without a pause) proves a strong one here before
 * /admin opens: Face ID / Touch ID on this domain, or the authenticator.
 * Success upgrades THIS session's `amr` through a server-signed proof read
 * by auth.ts's jwt "update" (lib/authStrength) — the browser can't ask for
 * the upgrade itself. Staff only; each method keeps its own brakes (the
 * TOTP lockout, the single-use passkey challenge).
 */

async function staffCaller() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      isTwoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorLastStep: true,
      twoFactorFailedAttempts: true,
      twoFactorLockedUntil: true,
    },
  });
  if (!user || !isStaffRole(effectiveRole(user.email, user.role))) return null;
  return user;
}

export interface AdminUnlockOptions {
  /** Prepared Face ID / Touch ID options for this domain, or null (none here). */
  passkey: PublicKeyCredentialRequestOptionsJSON | null;
  totp: boolean;
  /** This domain's rp id, for "your passkey is on another site". */
  domain: string | null;
  /** Passkeys enrolled on other domains only. */
  passkeyElsewhere: boolean;
}

export async function getAdminUnlockOptions(): Promise<AdminUnlockOptions | null> {
  const user = await staffCaller();
  if (!user) return null;
  const [start, rp, total] = await Promise.all([startAssertion(user.id, "unlock"), currentRelyingParty(), prisma.passkey.count({ where: { userId: user.id } })]);
  return {
    passkey: start.ok ? start.options : null,
    totp: user.isTwoFactorEnabled && Boolean(user.twoFactorSecret),
    domain: rp?.rpID ?? null,
    passkeyElsewhere: !start.ok && total > 0,
  };
}

const Input = z.union([
  z.object({ method: z.literal("totp"), secret: z.string().regex(/^\d{6}$/) }),
  z.object({ method: z.literal("passkey"), secret: z.string().min(1).max(16_000) }),
]);

export type AdminUnlockResult = { ok: true } | { ok: false; code: "UNAUTHENTICATED" | "INVALID" | "LOCKED" | "RATE_LIMITED" | "FAILED"; retryAfterMinutes?: number };

export async function unlockAdmin(raw: unknown): Promise<AdminUnlockResult> {
  const user = await staffCaller();
  if (!user) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  if (!checkRateLimit(`admin-unlock:${user.id}`, { limit: 10, windowMs: 10 * 60_000 }).success) return { ok: false, code: "RATE_LIMITED" };
  const { method, secret } = parsed.data;

  if (method === "passkey") {
    const check = await verifyAssertion(user.id, secret, "unlock");
    if (!check.ok) return { ok: false, code: "INVALID" };
  } else {
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) return { ok: false, code: "INVALID" };
    const check = await verifyTotpForUser(prisma, user, secret);
    if (!check.ok) return check.reason === "LOCKED" ? { ok: false, code: "LOCKED", retryAfterMinutes: Math.ceil((check.retryAfterMs ?? 15 * 60_000) / 60_000) } : { ok: false, code: "INVALID" };
  }

  try {
    await unstable_update({ elevate: await mintElevation(user.id, method) } as Parameters<typeof unstable_update>[0]);
  } catch (error) {
    console.error("unlockAdmin: could not upgrade the session:", error);
    return { ok: false, code: "FAILED" };
  }
  return { ok: true };
}
