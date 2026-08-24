import prisma from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;

/** What a code is allowed to authorize — enforced at both mint and verify. */
export type OtpPurpose = "signin" | "password-change";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Overwrites any code already pending for this email AND purpose — only the
// most recently sent code of a given kind is ever valid, so "resend"
// naturally invalidates the previous one, and a sign-in code can never be
// replayed to change a password (or vice versa).
export async function createOtp(email: string, purpose: OtpPurpose = "signin"): Promise<string> {
  const code = generateCode();
  await prisma.$transaction([
    prisma.otpCode.deleteMany({ where: { email, purpose } }),
    prisma.otpCode.create({
      data: { email, code, purpose, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    }),
  ]);
  return code;
}

// Consumes the code on a match (expired or not) so it can't be replayed; a
// non-matching code is left alone so a mistyped digit doesn't burn the
// user's real pending code.
export async function verifyAndConsumeOtp(
  email: string,
  code: string,
  purpose: OtpPurpose = "signin"
): Promise<boolean> {
  const entry = await prisma.otpCode.findFirst({ where: { email, code, purpose } });
  if (!entry) return false;

  await prisma.otpCode.delete({ where: { id: entry.id } }).catch(() => {});
  return entry.expiresAt.getTime() >= Date.now();
}

/** Non-consuming check — used to advance UI steps without burning the code. */
export async function peekOtp(email: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const entry = await prisma.otpCode.findFirst({ where: { email, code, purpose } });
  return Boolean(entry && entry.expiresAt.getTime() >= Date.now());
}
