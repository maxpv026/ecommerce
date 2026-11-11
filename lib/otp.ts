import { randomInt, timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;
/**
 * Wrong guesses a pending code survives. Six digits is a million
 * combinations; five tries is a 0.0005% chance, after which the code is
 * deleted and a new one has to be requested (which is itself throttled).
 */
const MAX_ATTEMPTS = 5;
/** Minimum gap between two codes for the same address and purpose. */
export const OTP_RESEND_INTERVAL_MS = 30 * 1000;

/** What a code is allowed to authorize — enforced at both mint and verify. */
export type OtpPurpose = "signin" | "password-change";

// A CSPRNG, not Math.random(): V8's xorshift state can be recovered from a
// handful of outputs, which would make the next code predictable.
function generateCode(): string {
  return randomInt(100000, 1_000_000).toString();
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * True when a code for this address and purpose was minted too recently to
 * send another — stops the "resend" button (or a script) from turning the
 * mailer into an email bomb aimed at someone else's inbox.
 */
export async function otpRecentlySent(email: string, purpose: OtpPurpose = "signin"): Promise<boolean> {
  const recent = await prisma.otpCode.findFirst({
    where: { email, purpose, createdAt: { gt: new Date(Date.now() - OTP_RESEND_INTERVAL_MS) } },
    select: { id: true },
  });
  return Boolean(recent);
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

/** The one pending code for this address and purpose (createOtp keeps it to one). */
function pending(email: string, purpose: OtpPurpose) {
  return prisma.otpCode.findFirst({ where: { email, purpose }, orderBy: { createdAt: "desc" } });
}

/**
 * Counts a wrong guess against the pending code; the guess that reaches the
 * ceiling deletes it. Conditional on the attempts value just read, so
 * parallel guesses can't each see "4" and all get a fifth try.
 */
async function recordMiss(id: string, attempts: number): Promise<void> {
  if (attempts + 1 >= MAX_ATTEMPTS) {
    await prisma.otpCode.deleteMany({ where: { id } });
    return;
  }
  const { count } = await prisma.otpCode.updateMany({ where: { id, attempts }, data: { attempts: { increment: 1 } } });
  // Lost the race to another guess: it already counted, so this one burns the code.
  if (count === 0) await prisma.otpCode.deleteMany({ where: { id } });
}

// Consumes the code on a match (expired or not) so it can't be replayed. A
// wrong code counts against the pending one rather than burning it at once,
// so one mistyped digit doesn't cost the user their real code — but five do.
export async function verifyAndConsumeOtp(
  email: string,
  code: string,
  purpose: OtpPurpose = "signin"
): Promise<boolean> {
  const entry = await pending(email, purpose);
  if (!entry) return false;

  if (!sameCode(entry.code, code)) {
    await recordMiss(entry.id, entry.attempts).catch(() => {});
    return false;
  }

  // deleteMany's count is the claim: two requests racing with the right code
  // can't both consume it.
  const { count } = await prisma.otpCode.deleteMany({ where: { id: entry.id } });
  return count === 1 && entry.expiresAt.getTime() >= Date.now();
}

/**
 * Non-consuming check — used to advance UI steps without burning the code.
 * A wrong guess still counts: otherwise this would be an unlimited oracle
 * for the same code verifyAndConsumeOtp protects.
 */
export async function peekOtp(email: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const entry = await pending(email, purpose);
  if (!entry) return false;
  if (!sameCode(entry.code, code)) {
    await recordMiss(entry.id, entry.attempts).catch(() => {});
    return false;
  }
  return entry.expiresAt.getTime() >= Date.now();
}
