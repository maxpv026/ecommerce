"use server";

import { z } from "zod";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  createRecoveryCodes,
  createTotpSecret,
  looksLikeTotp,
  totpUri,
  verifyTotpForUser,
} from "@/lib/twoFactor";

/**
 * Enrolling and un-enrolling an authenticator app.
 *
 * One deviation from the obvious design, and it matters: the pending secret
 * is kept on the server between the two steps rather than handed to the
 * browser and passed back on confirm. A round-tripped secret lets the client
 * decide what gets stored — so anything with a foothold in the page (an
 * injected script, a hostile extension) could enrol an authenticator it
 * controls. Here `enableTwoFactor` takes only the six digits and checks them
 * against the secret the server already holds.
 *
 * The secret is still SHOWN once during setup, because an authenticator that
 * cannot scan a QR needs it typed in. Showing it to the person enrolling is
 * not the same as accepting it back from them.
 */

export interface TwoFactorStatus {
  enabled: boolean;
  /** A setup was begun but never confirmed. */
  pending: boolean;
  /** Unused recovery codes left. Zero means one lost phone from lockout. */
  recoveryCodesLeft: number;
}

export type TwoFactorResult =
  /** `recoveryCodes` is present exactly once, on the enable that issued them. */
  | { ok: true; message: string; recoveryCodes?: string[] }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_CODE" | "LOCKED" | "NOT_ENROLLED" | "FAILED"; message: string };

async function currentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      twoFactorSecret: true,
      isTwoFactorEnabled: true,
      twoFactorLastStep: true,
      twoFactorFailedAttempts: true,
      twoFactorLockedUntil: true,
      recoveryCodes: true,
    },
  });
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  const user = await currentUser();
  if (!user) return { enabled: false, pending: false, recoveryCodesLeft: 0 };
  return {
    enabled: user.isTwoFactorEnabled,
    pending: !user.isTwoFactorEnabled && user.twoFactorSecret !== null,
    recoveryCodesLeft: user.recoveryCodes.length,
  };
}

export interface TwoFactorSetup {
  ok: boolean;
  /** `data:image/png;base64,…` for an <img>. */
  qrDataUrl?: string;
  /** Shown once, for typing into an app that cannot scan. */
  secret?: string;
  message?: string;
}

/**
 * Starts enrolment: mints a secret, stores it as PENDING, and returns the QR.
 *
 * `isTwoFactorEnabled` stays false until a code is confirmed, so abandoning
 * this screen — or closing the tab mid-setup — cannot lock anyone out.
 */
export async function generateTwoFactorSecret(): Promise<TwoFactorSetup> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in first." };

  // Re-enrolling replaces the pending secret; an already-enabled account has
  // to disable first, so this can never silently swap a working authenticator.
  if (user.isTwoFactorEnabled) {
    return { ok: false, message: "Two-factor authentication is already on. Turn it off first to re-enrol." };
  }

  try {
    const secret = createTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        isTwoFactorEnabled: false,
        twoFactorLastStep: null,
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: null,
      },
    });

    const uri = totpUri(secret, user.email ?? user.id);
    const qrDataUrl = await QRCode.toDataURL(uri, { width: 240, margin: 1 });
    return { ok: true, qrDataUrl, secret };
  } catch (error) {
    console.error("[2fa] could not start setup:", error);
    return { ok: false, message: "Could not start setup. Try again." };
  }
}

const CodeInput = z.object({ code: z.string().trim().min(6).max(10) });

/**
 * Confirms enrolment. Takes only the code — the secret comes from the row.
 */
export async function enableTwoFactor(raw: { code: string }): Promise<TwoFactorResult> {
  const user = await currentUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: "Sign in first." };

  const parsed = CodeInput.safeParse(raw);
  if (!parsed.success || !looksLikeTotp(parsed.data.code)) {
    return { ok: false, code: "INVALID_CODE", message: "Enter the 6-digit code from your authenticator app." };
  }
  if (!user.twoFactorSecret) {
    return { ok: false, code: "NOT_ENROLLED", message: "Start the setup again — no pending secret was found." };
  }

  const check = await verifyTotpForUser(prisma, user, parsed.data.code);
  if (!check.ok) {
    if (check.reason === "LOCKED") {
      return {
        ok: false,
        code: "LOCKED",
        message: `Too many wrong codes. Try again in ${Math.ceil((check.retryAfterMs ?? 0) / 60000)} minutes.`,
      };
    }
    return { ok: false, code: "INVALID_CODE", message: "That code didn't match. Check your app's clock and try again." };
  }

  // Issued here, at the moment 2FA becomes real, so an account can never be
  // enabled without a way back in. Only the hashes are stored.
  const { plain, hashed } = await createRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { isTwoFactorEnabled: true, recoveryCodes: hashed },
  });
  revalidatePath("/[locale]/profile", "page");
  return {
    ok: true,
    message: "Two-factor authentication is on. Save your recovery codes — they are shown only once.",
    recoveryCodes: plain,
  };
}

/**
 * Turns it off — but only for someone who can still produce a code.
 *
 * Without that requirement a stolen session could quietly strip the second
 * factor, which is the one attack 2FA exists to stop.
 */
export async function disableTwoFactor(raw: { code: string }): Promise<TwoFactorResult> {
  const user = await currentUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: "Sign in first." };
  if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, code: "NOT_ENROLLED", message: "Two-factor authentication isn't on." };
  }

  const parsed = CodeInput.safeParse(raw);
  if (!parsed.success || !looksLikeTotp(parsed.data.code)) {
    return { ok: false, code: "INVALID_CODE", message: "Enter a current 6-digit code to turn it off." };
  }

  const check = await verifyTotpForUser(prisma, user, parsed.data.code);
  if (!check.ok) {
    if (check.reason === "LOCKED") {
      return {
        ok: false,
        code: "LOCKED",
        message: `Too many wrong codes. Try again in ${Math.ceil((check.retryAfterMs ?? 0) / 60000)} minutes.`,
      };
    }
    return { ok: false, code: "INVALID_CODE", message: "That code didn't match." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorLastStep: null,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
      // Unused codes are worthless once the secret is gone, and leaving them
      // behind would silently carry over into a later re-enrolment.
      recoveryCodes: [],
    },
  });
  revalidatePath("/[locale]/profile", "page");
  return { ok: true, message: "Two-factor authentication is off. Sign-in will email you a code again." };
}
