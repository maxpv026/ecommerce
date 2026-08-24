"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { createOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mail";
import { ADMIN_LEGAL_NAME, isFounderEmail } from "@/lib/rbac";

const RequestOtpInput = z.object({
  mode: z.enum(["signin", "register"]),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export type RequestOtpErrorCode =
  | "INVALID_EMAIL"
  | "PASSWORD_TOO_SHORT"
  | "EMAIL_EXISTS"
  | "NO_ACCOUNT"
  | "WRONG_PASSWORD"
  | "GOOGLE_ACCOUNT"
  | "SEND_FAILED";

export type RequestOtpResult = { ok: true } | { ok: false; code: RequestOtpErrorCode };

/**
 * Step 1 of sign-in/registration: validates credentials, creates the user
 * row for a fresh registration (unverified), then emails a 6-digit code.
 * Step 2 (auth.ts's Credentials provider) re-validates the password and
 * checks the code before a session is ever issued — this action never signs
 * anyone in by itself.
 */
export async function requestEmailOtp(rawInput: {
  mode: "signin" | "register";
  email: string;
  password: string;
}): Promise<RequestOtpResult> {
  const parsed = RequestOtpInput.safeParse(rawInput);
  if (!parsed.success) {
    const tooShort = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return { ok: false, code: tooShort ? "PASSWORD_TOO_SHORT" : "INVALID_EMAIL" };
  }
  const { mode, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });

  // Google-only accounts never set a password — steer them back to Google
  // regardless of which tab (sign in / create account) they used.
  if (existing && existing.password === null) {
    return { ok: false, code: "GOOGLE_ACCOUNT" };
  }

  if (mode === "register") {
    if (existing && existing.emailVerified) {
      return { ok: false, code: "EMAIL_EXISTS" };
    }
    const hashed = await bcrypt.hash(password, 12);
    // The ADMIN_EMAIL account is created as ADMIN with the founder's legal
    // name attached; everyone else gets the schema default (USER).
    const founder = isFounderEmail(email);
    if (existing) {
      // Abandoned signup (password set, code never verified) — overwrite
      // with the freshly submitted password and resend a code.
      await prisma.user.update({ where: { id: existing.id }, data: { password: hashed } });
    } else {
      await prisma.user.create({
        data: {
          email,
          password: hashed,
          ...(founder ? { role: "ADMIN" as const, name: ADMIN_LEGAL_NAME } : {}),
        },
      });
    }
  } else {
    if (!existing) {
      return { ok: false, code: "NO_ACCOUNT" };
    }
    const validPassword = await bcrypt.compare(password, existing.password!);
    if (!validPassword) {
      return { ok: false, code: "WRONG_PASSWORD" };
    }
  }

  const code = await createOtp(email);
  try {
    await sendOtpEmail(email, code);
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { ok: false, code: "SEND_FAILED" };
  }

  return { ok: true };
}
