import prisma from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Overwrites any code already pending for this email — only the most
// recently sent code is ever valid, so "resend" naturally invalidates the
// previous one.
export async function createOtp(email: string): Promise<string> {
  const code = generateCode();
  await prisma.$transaction([
    prisma.otpCode.deleteMany({ where: { email } }),
    prisma.otpCode.create({ data: { email, code, expiresAt: new Date(Date.now() + OTP_TTL_MS) } }),
  ]);
  return code;
}

// Consumes the code on a match (expired or not) so it can't be replayed; a
// non-matching code is left alone so a mistyped digit doesn't burn the
// user's real pending code.
export async function verifyAndConsumeOtp(email: string, code: string): Promise<boolean> {
  const entry = await prisma.otpCode.findFirst({ where: { email, code } });
  if (!entry) return false;

  await prisma.otpCode.delete({ where: { id: entry.id } }).catch(() => {});
  return entry.expiresAt.getTime() >= Date.now();
}
