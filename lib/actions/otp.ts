"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { createOtp, otpRecentlySent } from "@/lib/otp";
import { checkPassword } from "@/lib/loginThrottle";
import { withinActionLimit } from "@/lib/actionRateLimit";
import { sendOtpEmail } from "@/lib/mail";
import { ADMIN_LEGAL_NAME, isFounderEmail } from "@/lib/rbac";

const RequestOtpInput = z.object({
  mode: z.enum(["signin", "register"]),
  email: z.string().trim().toLowerCase().email(),
  // bcrypt reads only the first 72 bytes; the ceiling just refuses
  // megabyte-sized bodies before they are hashed.
  password: z.string().min(8).max(256),
});

export type RequestOtpErrorCode =
  | "INVALID_EMAIL"
  | "PASSWORD_TOO_SHORT"
  | "EMAIL_EXISTS"
  | "NO_ACCOUNT"
  | "WRONG_PASSWORD"
  | "GOOGLE_ACCOUNT"
  | "TOO_MANY_ATTEMPTS"
  | "SEND_FAILED";

export type RequestOtpResult =
  /**
   * `factor` tells the UI what to ask for next: "email" when a code has just
   * been sent, "totp" when this account uses an authenticator app and no
   * email was sent at all.
   */
  | { ok: true; factor: "email" | "totp" }
  | { ok: false; code: RequestOtpErrorCode };

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

  // A Server Action is a POST to the page, so proxy.ts's /api/auth limiter
  // never sees it — and this action checks passwords and sends email. Per
  // address here; per account (in the database) in checkPassword below.
  if (!(await withinActionLimit("signin-otp", { limit: 10, windowMs: 60_000 }))) {
    return { ok: false, code: "TOO_MANY_ATTEMPTS" };
  }

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
    // The ADMIN_EMAIL account is created as SUPER_ADMIN with the founder's legal
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
          ...(founder ? { role: "SUPER_ADMIN" as const, name: ADMIN_LEGAL_NAME } : {}),
        },
      });
    }
  } else {
    if (!existing) {
      return { ok: false, code: "NO_ACCOUNT" };
    }
    // Counted per account (lib/loginThrottle): ten wrong passwords lock it
    // for fifteen minutes, wherever and however fast they arrive.
    const check = await checkPassword(existing, password);
    if (check === "locked") return { ok: false, code: "TOO_MANY_ATTEMPTS" };
    if (check === "wrong") return { ok: false, code: "WRONG_PASSWORD" };
  }

  // An enrolled authenticator replaces the emailed code rather than adding
  // to it — the app is the stronger channel, and sending a second code that
  // is never used would train people to ignore them. Nothing is emailed and
  // nothing is stored; auth.ts verifies the TOTP against the secret instead.
  if (existing?.isTwoFactorEnabled && existing.twoFactorSecret) {
    return { ok: true, factor: "totp" };
  }

  // The code sent seconds ago is still pending and valid; minting another
  // would let anyone turn this form into an email bomb.
  if (await otpRecentlySent(email)) return { ok: true, factor: "email" };

  const code = await createOtp(email);
  try {
    await sendOtpEmail(email, code);
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { ok: false, code: "SEND_FAILED" };
  }

  return { ok: true, factor: "email" };
}
