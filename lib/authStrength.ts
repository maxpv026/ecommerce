/**
 * How strongly the current session's holder proved their second factor.
 *
 * `amr` (authentication method reference) is set on the session at sign-in
 * from what authorize() actually verified (auth.ts): "passkey", "totp",
 * "recovery", "phrase", "email" (an emailed code) or "google". The admin
 * area needs a STRONG one — the authenticator app or a passkey (or their
 * recovery fallbacks) — while an account only needs to have ENROLLED one
 * of the two (`secondFactor`). A staff session signed in more weakly (an
 * emailed code, Google without a pause) is sent to /admin-unlock, which
 * asks for Face ID / Touch ID or the authenticator code and upgrades this
 * session's `amr` with a signed, single-purpose proof (`elevate`).
 *
 * Edge-safe (proxy.ts imports it): Web Crypto only.
 */

export const STRONG_AMR = ["totp", "passkey", "recovery", "phrase"] as const;
export type Amr = (typeof STRONG_AMR)[number] | "email" | "google";

/**
 * Strong enough for /admin? Sessions minted before `amr` existed: an account
 * with the authenticator on could only have signed in through it.
 */
export function strongSession(user: { amr?: unknown; isTwoFactorEnabled?: boolean } | undefined | null): boolean {
  if (!user) return false;
  if (typeof user.amr === "string") return (STRONG_AMR as readonly string[]).includes(user.amr);
  return user.isTwoFactorEnabled === true;
}

// ── The elevation proof (minted by lib/actions/adminUnlock, read in auth.ts's jwt "update") ──

const ELEVATION_TTL_MS = 2 * 60 * 1000;

async function hmac(text: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign elevation proofs");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`elevate:${text}`)));
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A proof that `userId` just verified `method` (passkey / totp) — valid two minutes. */
export async function mintElevation(userId: string, method: "passkey" | "totp"): Promise<string> {
  const exp = Date.now() + ELEVATION_TTL_MS;
  return `${exp}.${method}.${await hmac(`${userId}:${method}:${exp}`)}`;
}

/** The method a valid, unexpired proof for this user carries — or null. A client can't forge one. */
export async function readElevation(proof: unknown, userId: string | undefined): Promise<"passkey" | "totp" | null> {
  if (typeof proof !== "string" || !userId) return null;
  const [expRaw, method, sig] = proof.split(".");
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp < Date.now() || (method !== "passkey" && method !== "totp") || !sig) return null;
  const expected = await hmac(`${userId}:${method}:${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? method : null;
}
