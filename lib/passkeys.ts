import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { parseUserAgent } from "@/lib/deviceSessions";

/**
 * WebAuthn passkeys — Face ID, Touch ID, Windows Hello, an Android
 * fingerprint — as a SECOND factor.
 *
 * The password is still the first factor everywhere; a passkey stands in
 * for the 6-digit code at sign-in (auth.ts), and for a strong method in the
 * identity check (lib/actions/stepUp). Only platform authenticators are
 * requested and user verification is REQUIRED, so "it worked" means the
 * device checked the person's face, finger or device PIN.
 *
 * ── Two domains ──
 * A passkey is bound to one relying-party id. www.myeenergy.com uses
 * "myeenergy.com", www.myeenergy.eu uses "myeenergy.eu" — different
 * registrable domains, so a passkey made on one cannot be used on the other.
 * (WebAuthn "related origins" could join them, but it needs
 * https://myeenergy.com/.well-known/webauthn served without a redirect, and
 * the apex domains 308 to www.) Each row records its rpId; each domain offers
 * only its own passkeys and the settings list says where the others work.
 *
 * The rp id and origin come from the Host header, against an allowlist —
 * never X-Forwarded-Host (proxy.ts ignores it for the same reason).
 *
 * ── Challenges ──
 * One signed, HttpOnly cookie per ceremony (5 minutes, single use), bound to
 * the purpose, the user and the rp id. Each passkey also remembers a hash of
 * the last challenge it answered: synced passkeys report a signature counter
 * of 0 forever, so the counter alone can't refuse a replayed assertion.
 */

export const RP_NAME = "My Energy";
const CHALLENGE_COOKIE = "me_webauthn";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Prefix of a passkey assertion carried in the sign-in `code` field. */
export const PASSKEY_CODE_PREFIX = "pk:";

export type ChallengePurpose = "register" | "login" | "step-up" | "unlock";

export interface RelyingParty {
  rpID: string;
  origin: string;
}

/** The relying party for a Host header, or null for a host passkeys aren't offered on. */
export function relyingPartyFor(hostHeader: string | null | undefined): RelyingParty | null {
  const host = (hostHeader ?? "").trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null;
  const hostname = host.split(":")[0];
  if (hostname === "localhost") return { rpID: "localhost", origin: `http://${host}` };
  if (hostname === "myeenergy.com" || hostname === "www.myeenergy.com") return { rpID: "myeenergy.com", origin: `https://${host}` };
  if (hostname === "myeenergy.eu" || hostname === "www.myeenergy.eu") return { rpID: "myeenergy.eu", origin: `https://${host}` };
  // Vercel previews: the deployment's own hostname is its rp id.
  if (hostname.endsWith(".vercel.app")) return { rpID: hostname, origin: `https://${host}` };
  return null;
}

export async function currentRelyingParty(): Promise<RelyingParty | null> {
  try {
    return relyingPartyFor((await headers()).get("host"));
  } catch {
    return null;
  }
}

// ── Challenge cookie ──

const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to sign WebAuthn challenges");
  return value;
};
const sign = (payload: string) => createHmac("sha256", secret()).update(`webauthn:${payload}`).digest("base64url");

async function putChallenge(purpose: ChallengePurpose, userId: string, rpID: string, challenge: string): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ p: purpose, u: userId, r: rpID, c: challenge, e: Date.now() + CHALLENGE_TTL_MS })).toString("base64url");
  (await cookies()).set(CHALLENGE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && rpID !== "localhost",
    path: "/",
    maxAge: Math.ceil(CHALLENGE_TTL_MS / 1000),
  });
}

/** The pending challenge for this purpose/user/rp — consumed (deleted) on read. */
async function takeChallenge(purpose: ChallengePurpose, userId: string, rpID: string): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(CHALLENGE_COOKIE)?.value;
  if (!raw) return null;
  try {
    jar.delete(CHALLENGE_COOKIE);
  } catch {
    // A context that can't write cookies still can't reuse it: the row's lastChallenge refuses a replay.
  }
  const [payload, given] = raw.split(".");
  if (!payload || !given) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p: string; u: string; r: string; c: string; e: number };
    if (v.p !== purpose || v.u !== userId || v.r !== rpID || !(v.e > Date.now()) || typeof v.c !== "string") return null;
    return v.c;
  } catch {
    return null;
  }
}

const challengeHash = (challenge: string) => createHash("sha256").update(challenge).digest("base64url");

// ── Labels ──

/** "iPhone · Face ID", "Mac · Touch ID", "Windows Hello" — the default name of a new passkey. */
export function passkeyNameFor(userAgent: string | null | undefined): string {
  const { os, browser } = parseUserAgent(userAgent);
  switch (os) {
    case "iOS":
      return "iPhone · Face ID";
    case "iPadOS":
      return "iPad · Face ID / Touch ID";
    case "macOS":
      return "Mac · Touch ID";
    case "Windows":
      return "Windows Hello";
    case "Android":
      return "Android · Fingerprint / Face";
    case "ChromeOS":
      return "Chromebook";
    default:
      return browser ? `${browser} · Passkey` : "Passkey";
  }
}

// ── Registration ──

export type RegistrationStart = { ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; code: "UNSUPPORTED_HOST" | "NOT_FOUND" };

export async function startRegistration(userId: string): Promise<RegistrationStart> {
  const rp = await currentRelyingParty();
  if (!rp) return { ok: false, code: "UNSUPPORTED_HOST" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, passkeys: { where: { rpId: rp.rpID }, select: { credentialId: true, transports: true } } } });
  if (!user) return { ok: false, code: "NOT_FOUND" };
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email ?? user.id,
    userDisplayName: user.name ?? user.email ?? "My Energy",
    attestationType: "none",
    // The same authenticator can't be enrolled twice on this domain.
    excludeCredentials: user.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    // The device's own biometrics (Face ID / Touch ID / Windows Hello), checked every time.
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
  });
  await putChallenge("register", user.id, rp.rpID, options.challenge);
  return { ok: true, options };
}

export type RegistrationFinish = { ok: true; id: string; name: string } | { ok: false; code: "UNSUPPORTED_HOST" | "EXPIRED" | "INVALID" | "DUPLICATE" };

export async function finishRegistration(userId: string, response: unknown): Promise<RegistrationFinish> {
  const rp = await currentRelyingParty();
  if (!rp) return { ok: false, code: "UNSUPPORTED_HOST" };
  const challenge = await takeChallenge("register", userId, rp.rpID);
  if (!challenge) return { ok: false, code: "EXPIRED" };
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    console.warn("passkeys: registration refused:", error instanceof Error ? error.message : error);
    return { ok: false, code: "INVALID" };
  }
  if (!verification.verified) return { ok: false, code: "INVALID" };
  const info = verification.registrationInfo;
  const name = passkeyNameFor((await headers()).get("user-agent"));
  try {
    const row = await prisma.passkey.create({
      data: {
        userId,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        transports: info.credential.transports ?? [],
        rpId: rp.rpID,
        name,
      },
      select: { id: true, name: true },
    });
    return { ok: true, ...row };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, code: "DUPLICATE" };
    throw error;
  }
}

// ── Authentication (sign-in second factor, step-up) ──

export type AssertionStart = { ok: true; options: PublicKeyCredentialRequestOptionsJSON } | { ok: false; code: "UNSUPPORTED_HOST" | "NONE" };

/** Options for this user's passkeys on this domain — none when they have no passkey here. */
export async function startAssertion(userId: string, purpose: "login" | "step-up" | "unlock"): Promise<AssertionStart> {
  const rp = await currentRelyingParty();
  if (!rp) return { ok: false, code: "UNSUPPORTED_HOST" };
  const keys = await prisma.passkey.findMany({ where: { userId, rpId: rp.rpID }, select: { credentialId: true, transports: true } });
  if (keys.length === 0) return { ok: false, code: "NONE" };
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: keys.map((k) => ({ id: k.credentialId, transports: k.transports as AuthenticatorTransportFuture[] })),
    userVerification: "required",
  });
  await putChallenge(purpose, userId, rp.rpID, options.challenge);
  return { ok: true, options };
}

/** Does this user have a passkey usable on the current domain? */
export async function hasPasskeyHere(userId: string): Promise<boolean> {
  const rp = await currentRelyingParty();
  if (!rp) return false;
  return (await prisma.passkey.count({ where: { userId, rpId: rp.rpID } })) > 0;
}

export type AssertionCheck = { ok: true; passkeyId: string } | { ok: false; reason: "UNSUPPORTED_HOST" | "EXPIRED" | "UNKNOWN_KEY" | "REPLAYED" | "INVALID" };

/** Verifies an assertion (the response JSON, or the sign-in `pk:` code) and records its use. */
export async function verifyAssertion(userId: string, raw: unknown, purpose: "login" | "step-up" | "unlock"): Promise<AssertionCheck> {
  const rp = await currentRelyingParty();
  if (!rp) return { ok: false, reason: "UNSUPPORTED_HOST" };
  const response = decodeAssertion(raw);
  if (!response) return { ok: false, reason: "INVALID" };
  const challenge = await takeChallenge(purpose, userId, rp.rpID);
  if (!challenge) return { ok: false, reason: "EXPIRED" };
  const key = await prisma.passkey.findFirst({ where: { credentialId: response.id, userId, rpId: rp.rpID } });
  if (!key) return { ok: false, reason: "UNKNOWN_KEY" };
  if (key.lastChallenge && key.lastChallenge === challengeHash(challenge)) return { ok: false, reason: "REPLAYED" };
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports as AuthenticatorTransportFuture[] },
      requireUserVerification: true,
    });
  } catch (error) {
    console.warn("passkeys: assertion refused:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "INVALID" };
  }
  if (!verification.verified) return { ok: false, reason: "INVALID" };
  await prisma.passkey.update({
    where: { id: key.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date(), lastChallenge: challengeHash(challenge) },
  });
  return { ok: true, passkeyId: key.id };
}

/** The assertion JSON from a `pk:` sign-in code or a plain object/string. */
function decodeAssertion(raw: unknown): AuthenticationResponseJSON | null {
  try {
    let value: unknown = raw;
    if (typeof value === "string") {
      const text = value.startsWith(PASSKEY_CODE_PREFIX) ? Buffer.from(value.slice(PASSKEY_CODE_PREFIX.length), "base64url").toString("utf8") : value;
      if (text.length > 16_000) return null;
      value = JSON.parse(text);
    }
    const r = value as Partial<AuthenticationResponseJSON>;
    if (!r || typeof r.id !== "string" || typeof r.rawId !== "string" || r.type !== "public-key" || !r.response || typeof r.response.clientDataJSON !== "string") return null;
    return r as AuthenticationResponseJSON;
  } catch {
    return null;
  }
}

export const isPasskeyCode = (code: string | null | undefined): code is string => typeof code === "string" && code.startsWith(PASSKEY_CODE_PREFIX);
