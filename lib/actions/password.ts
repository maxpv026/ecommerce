"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createOtp, peekOtp, verifyAndConsumeOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mail";

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

  const code = await createOtp(email, "password-change");
  try {
    await sendOtpEmail(email, code);
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
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, passwordChangedAt: new Date() },
    });
    return { ok: true };
  } catch (error) {
    console.error("changePassword failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
