import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Step-up verification: proof that the person at this device re-proved who
 * they are a moment ago, required before sensitive changes (ending another
 * device's session, turning 2FA off, setting a recovery phrase).
 *
 * After a successful check (lib/actions/stepUp) the server sets a signed,
 * HttpOnly cookie naming the user, THIS device's session id and the method
 * used, valid for a few minutes. It cannot be minted by the browser, moved
 * to another account or another device's session, or outlive the window.
 *
 * Methods differ in strength. An emailed code or the password proves less
 * than the second factor itself, so turning the second factor OFF — or
 * setting a phrase that can stand in for it — needs a STRONG method when
 * 2FA is on: the authenticator (or a recovery code) or the recovery phrase.
 */

export type StepUpMethod = "totp" | "email" | "password" | "phrase";
export const STRONG_METHODS: readonly StepUpMethod[] = ["totp", "phrase"];
export const STEP_UP_TTL_MS = 5 * 60 * 1000;
const COOKIE = "me_stepup";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to sign step-up proofs");
  return value;
}

const mac = (userId: string, sid: string, method: StepUpMethod, exp: number) =>
  createHmac("sha256", secret()).update(`step-up:${userId}:${sid}:${method}:${exp}`).digest("base64url");

export async function grantStepUp(userId: string, sid: string, method: StepUpMethod): Promise<number> {
  const exp = Date.now() + STEP_UP_TTL_MS;
  (await cookies()).set(COOKIE, `${exp}.${method}.${mac(userId, sid, method, exp)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && !process.env.AUTH_URL?.startsWith("http://"),
    path: "/",
    maxAge: Math.ceil(STEP_UP_TTL_MS / 1000),
  });
  return exp;
}

/** The method of a valid, unexpired proof for this user and device — or null. */
export async function readStepUp(userId: string, sid: string | undefined): Promise<StepUpMethod | null> {
  if (!sid) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [expRaw, method, given] = raw.split(".");
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp < Date.now() || !given) return null;
  if (!["totp", "email", "password", "phrase"].includes(method)) return null;
  const expected = Buffer.from(mac(userId, sid, method as StepUpMethod, exp));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? (method as StepUpMethod) : null;
}

export async function clearStepUp(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Does a proof made with `method` satisfy a check that may require a strong one? */
export const satisfies = (method: StepUpMethod | null, strong: boolean) => method !== null && (!strong || STRONG_METHODS.includes(method));
