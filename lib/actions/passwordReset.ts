"use server";

import { after } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { createOtp, otpRecentlySent, peekOtp, verifyAndConsumeOtp } from "@/lib/otp";
import { checkRateLimit } from "@/lib/rateLimit";
import { withinActionLimit } from "@/lib/actionRateLimit";
import { sendPasswordChangedNotice, sendPasswordResetCode, sendPasswordResetGoogleNotice } from "@/lib/passwordResetEmail";

/**
 * Forgot password: email → 6-digit code → new password.
 *
 *   1  requestPasswordReset   always answers { ok: true } for a well-formed
 *      address — registered, Google-only or unknown alike — and does the
 *      lookup and the mailing AFTER the response (next/server after()), so
 *      neither the answer nor its timing tells anyone whether an account
 *      exists. Throttled per address (in the database: one code per 30 s)
 *      and per IP and per email (in memory).
 *   2  checkPasswordResetCode  advances the UI; a wrong guess still counts
 *      against the code (lib/otp: 5 tries, constant-time compare).
 *   3  completePasswordReset   consumes the code and sets the password
 *      (bcrypt 12). passwordChangedAt = now signs out every existing session
 *      on every device (lib/sessionRevocation), and the password lockout is
 *      cleared (lib/loginThrottle) — the buyer proved control of the mailbox.
 *
 * Codes are their own purpose ("password-reset"): one can never complete a
 * sign-in, and a sign-in code can never reset a password. A reset does not
 * bypass two-factor: signing in afterwards still asks for it.
 */

const Email = z.string().trim().toLowerCase().email().max(254);
const Code = z.string().trim().regex(/^\d{6}$/);
// The same rule as changing a password while signed in (lib/actions/password).
const NewPassword = z.string().min(8).max(128).regex(/\p{L}/u, "letter").regex(/\d/, "digit");
const Locale = z.string().max(8).optional().catch(undefined);

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; code: "INVALID_INPUT" | "RATE_LIMITED" | "INVALID_CODE" | "WEAK_PASSWORD" | "FAILED" };

const PURPOSE = "password-reset" as const;
const HOUR = 60 * 60 * 1000;

export async function requestPasswordReset(raw: { email: unknown; locale?: unknown }): Promise<PasswordResetResult> {
  const email = Email.safeParse(raw?.email);
  if (!email.success) return { ok: false, code: "INVALID_INPUT" };
  const locale = Locale.parse(raw?.locale);

  // Same answer for every address, so these limits reveal nothing either.
  if (!(await withinActionLimit("pw-reset-request", { limit: 5, windowMs: 15 * 60 * 1000 }))) return { ok: false, code: "RATE_LIMITED" };
  if (!checkRateLimit(`pw-reset:email:${email.data}`, { limit: 3, windowMs: HOUR }).success) return { ok: false, code: "RATE_LIMITED" };

  after(async () => {
    try {
      const user = await prisma.user.findUnique({ where: { email: email.data }, select: { password: true, locale: true } });
      if (!user) return; // Unknown address: nothing is sent, nothing is said.
      if (await otpRecentlySent(email.data, PURPOSE)) return; // a code from seconds ago is still valid
      if (!user.password) {
        // Google-only: there is no password to reset. Telling the owner so —
        // in their own inbox — helps them without telling anyone else.
        await createOtp(email.data, PURPOSE); // marks "recently sent", so this notice is throttled too
        await sendPasswordResetGoogleNotice(email.data, user.locale ?? locale ?? null);
        return;
      }
      const code = await createOtp(email.data, PURPOSE);
      await sendPasswordResetCode(email.data, code, user.locale ?? locale ?? null);
    } catch (error) {
      console.error("[password-reset] could not send the reset email:", error);
    }
  });
  return { ok: true };
}

export async function checkPasswordResetCode(raw: { email: unknown; code: unknown }): Promise<PasswordResetResult> {
  const email = Email.safeParse(raw?.email);
  const code = Code.safeParse(raw?.code);
  if (!email.success || !code.success) return { ok: false, code: "INVALID_CODE" };
  if (!(await withinActionLimit("pw-reset-check", { limit: 20, windowMs: 15 * 60 * 1000 }))) return { ok: false, code: "RATE_LIMITED" };
  return (await peekOtp(email.data, code.data, PURPOSE)) ? { ok: true } : { ok: false, code: "INVALID_CODE" };
}

export async function completePasswordReset(raw: { email: unknown; code: unknown; password: unknown }): Promise<PasswordResetResult> {
  const email = Email.safeParse(raw?.email);
  const code = Code.safeParse(raw?.code);
  if (!email.success || !code.success) return { ok: false, code: "INVALID_CODE" };
  if (!NewPassword.safeParse(raw?.password).success) return { ok: false, code: "WEAK_PASSWORD" };
  if (!(await withinActionLimit("pw-reset-complete", { limit: 10, windowMs: 15 * 60 * 1000 }))) return { ok: false, code: "RATE_LIMITED" };

  // Consumed here (single use), counted against the 5 tries when wrong.
  if (!(await verifyAndConsumeOtp(email.data, code.data, PURPOSE))) return { ok: false, code: "INVALID_CODE" };

  try {
    const hashed = await bcrypt.hash(raw.password as string, 12);
    // Only an account that HAS a password can reset one (a Google-only account
    // never received a code, but the condition is the guarantee, not that).
    const { count } = await prisma.user.updateMany({
      where: { email: email.data, password: { not: null } },
      data: { password: hashed, passwordChangedAt: new Date(), loginFailedAttempts: 0, loginLockedUntil: null },
    });
    if (count === 0) return { ok: false, code: "INVALID_CODE" };
  } catch (error) {
    console.error("[password-reset] could not set the new password:", error);
    return { ok: false, code: "FAILED" };
  }

  after(async () => {
    const user = await prisma.user.findUnique({ where: { email: email.data }, select: { locale: true } }).catch(() => null);
    await sendPasswordChangedNotice(email.data, user?.locale ?? null).catch((error) => console.error("[password-reset] changed-notice email failed:", error));
  });
  return { ok: true };
}
