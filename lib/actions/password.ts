"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, unstable_update } from "@/auth";
import prisma from "@/lib/prisma";
import { createOtp, otpRecentlySent, peekOtp, verifyAndConsumeOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mail";
import { mintRestamp } from "@/lib/sessionRevocation";

// Minimum 8 chars with at least one letter and one digit.
const NewPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-zА-Яа-яЇїІіЄєҐґ]/, "letter")
  .regex(/\d/, "digit");

export type PasswordActionResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "SEND_FAILED" | "INVALID_CODE" | "WEAK_PASSWORD" | "FAILED" };

/**
 * Step 1: mint a password-change OTP for the *authenticated* email and send
 * it via the configured SMTP transport. Purpose-scoped, so this code can
 * never be used to sign in.
 */
export async function requestPasswordChangeOtp(): Promise<PasswordActionResult> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!session?.user?.id || !email) return { ok: false, code: "UNAUTHENTICATED" };

  // A code sent seconds ago is still pending and valid: don't mail another.
  if (await otpRecentlySent(email, "password-change")) return { ok: true };

  const code = await createOtp(email, "password-change");
  const locale = (await prisma.user.findUnique({ where: { id: session.user.id }, select: { locale: true } }))?.locale;
  try {
    await sendOtpEmail(email, code, { purpose: "passwordChange", locale });
    return { ok: true };
  } catch (error) {
    console.error("requestPasswordChangeOtp send failed:", error);
    return { ok: false, code: "SEND_FAILED" };
  }
}

/**
 * Step 2: non-consuming validation so the UI can advance to the new-password
 * step. The code is only consumed by changePassword — a mistyped password on
 * step 3 doesn't force the user to request a fresh email.
 */
export async function checkPasswordOtp(code: string): Promise<PasswordActionResult> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!session?.user?.id || !email) return { ok: false, code: "UNAUTHENTICATED" };
  if (!/^\d{6}$/.test(code)) return { ok: false, code: "INVALID_CODE" };

  const valid = await peekOtp(email, code, "password-change");
  return valid ? { ok: true } : { ok: false, code: "INVALID_CODE" };
}

/**
 * Steps 3+4: re-verify AND consume the code atomically with the write, then
 * store the bcrypt(12) hash. The code is single-use — a second submit with
 * the same code fails.
 */
export async function changePassword(codeInput: string, newPassword: string): Promise<PasswordActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email?.toLowerCase();
  if (!userId || !email) return { ok: false, code: "UNAUTHENTICATED" };

  if (!NewPasswordSchema.safeParse(newPassword).success) {
    return { ok: false, code: "WEAK_PASSWORD" };
  }
  if (!/^\d{6}$/.test(codeInput)) return { ok: false, code: "INVALID_CODE" };

  const verified = await verifyAndConsumeOtp(email, codeInput, "password-change");
  if (!verified) return { ok: false, code: "INVALID_CODE" };

  try {
    const hashed = await bcrypt.hash(newPassword, 12);
    const changedAt = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, passwordChangedAt: changedAt },
    });
    // From here every session signed in before `changedAt` is refused
    // (lib/sessionRevocation) — a thief holding an old cookie is out. This
    // device proved itself with the code just now, so its own session is
    // re-stamped and stays signed in. If that fails it is merely signed out
    // too, which is the safe direction.
    try {
      await unstable_update({ restamp: mintRestamp(userId, changedAt) } as Parameters<typeof unstable_update>[0]);
    } catch (error) {
      console.error("changePassword: could not keep this device signed in:", error);
    }
    return { ok: true };
  } catch (error) {
    console.error("changePassword failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
