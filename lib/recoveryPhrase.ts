import "server-only";

import { createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS, looksLikeRecoveryCode, looksLikeTotp, type TwoFactorFailure } from "@/lib/twoFactor";

/**
 * Recovery phrase — a way back in when the authenticator is gone. Two modes.
 *
 * SEED_12 — twelve BIP-39 words (128 bits, CSPRNG). Verified like a hardware
 *   wallet: a sign-in or step-up asks for 4 random positions, a setup
 *   confirmation for 3. That needs each word checkable on its own, so each
 *   is stored as scrypt(`${position}:${word}`, salt ‖ pepper):
 *     - position-bound — the right word in the wrong slot fails;
 *     - salted per user — no two accounts share a table;
 *     - peppered with a key derived from AUTH_SECRET, which is not in the
 *       database — a database leak alone gives nothing to brute-force.
 *   The trade-off is inherent to partial challenges and stated plainly: with
 *   the database AND the server secret, each word is one of 2048 and can be
 *   found offline (scrypt makes that minutes, not microseconds). Rotating
 *   AUTH_SECRET invalidates every SEED_12 phrase (as it does every session).
 *   Online guessing shares the authenticator's lockout: 5 wrong answers lock
 *   both for 15 minutes.
 *
 * CUSTOM_PHRASE — the buyer's own passphrase (≥ 12 characters) with an
 *   optional hint, like a Telegram cloud password; one bcrypt hash of the
 *   normalised phrase. A phrase set before modes existed (type null, hash
 *   set) behaves the same way.
 *
 * Word challenges are server-signed, bound to the account and purpose, live
 * five minutes, and are single-use: answering one records its issue time,
 * and any challenge issued at or before that is refused.
 */

export type RecoveryPhraseType = "SEED_12" | "CUSTOM_PHRASE";
export type ChallengePurpose = "login" | "step-up" | "setup";

export const SEED_WORDS = 12;
export const CHALLENGE_WORDS = 4;
export const SETUP_CONFIRM_WORDS = 3;
export const MIN_CUSTOM_LENGTH = 12;
export const MAX_PHRASE_LENGTH = 200;
export const MAX_HINT_LENGTH = 80;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SETUP_TTL_MS = 30 * 60 * 1000;
const BCRYPT_COST = 12;
const SCRYPT = { N: 1 << 14, r: 8, p: 1 } as const;
const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: typeof SCRYPT) => Promise<Buffer>;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required for recovery phrases");
  return value;
}
const pepper = () => createHmac("sha256", secret()).update("recovery-word-pepper:v1").digest();

export function normalizePhrase(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
const normalizeWord = (raw: string) => raw.normalize("NFKC").trim().toLowerCase();

// ── SEED_12 ──────────────────────────────────────────────────────────────

export interface SeedRecord {
  salt: string;
  hashes: string[];
}

async function wordHash(salt: Buffer, position: number, word: string): Promise<Buffer> {
  return scrypt(`${position}:${normalizeWord(word)}`, Buffer.concat([salt, pepper()]), 32, SCRYPT);
}

/** Twelve fresh words and their position-bound hashes. The words are returned once, never stored. */
export async function createSeedPhrase(): Promise<{ words: string[]; record: SeedRecord }> {
  const words = generateMnemonic(wordlist, 128).split(" ");
  const salt = randomBytes(16);
  const hashes = await Promise.all(words.map((w, i) => wordHash(salt, i + 1, w)));
  return { words, record: { salt: salt.toString("base64url"), hashes: hashes.map((h) => h.toString("base64url")) } };
}

export function parseSeedRecord(salt: string | null, hashes: unknown): SeedRecord | null {
  if (!salt || !Array.isArray(hashes) || hashes.length !== SEED_WORDS || !hashes.every((h) => typeof h === "string")) return null;
  return { salt, hashes: hashes as string[] };
}

/**
 * Do these words match the record at these (1-based) positions? Every
 * position is hashed and compared even after a mismatch, in constant time,
 * so the response says nothing about which word was wrong.
 */
export async function seedWordsMatch(record: SeedRecord, positions: number[], words: string[]): Promise<boolean> {
  if (positions.length === 0 || positions.length !== words.length) return false;
  const salt = Buffer.from(record.salt, "base64url");
  let ok = true;
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    const stored = Buffer.from(record.hashes[position - 1] ?? "", "base64url");
    const given = await wordHash(salt, position, words[i] ?? "");
    ok = stored.length === given.length && timingSafeEqual(stored, given) && ok;
  }
  return ok;
}

/** `count` distinct positions in 1..12, ascending, from a CSPRNG. */
export function pickPositions(count: number): number[] {
  const pool = Array.from({ length: SEED_WORDS }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

// ── Signed challenges ────────────────────────────────────────────────────

interface ChallengePayload {
  u: string; // user id
  p: ChallengePurpose;
  i: number[]; // positions
  t: number; // issued at (ms)
  e: number; // expires at (ms)
  b?: string; // binding (setup: the pending record's id)
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`recovery-challenge:${payload}`).digest("base64url");

export function issueChallenge(userId: string, purpose: ChallengePurpose, positions: number[], binding?: string, ttlMs = CHALLENGE_TTL_MS): string {
  const now = Date.now();
  const body: ChallengePayload = { u: userId, p: purpose, i: positions, t: now, e: now + ttlMs, ...(binding ? { b: binding } : {}) };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readChallenge(token: string, userId: string, purpose: ChallengePurpose): ChallengePayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as ChallengePayload;
    if (body.u !== userId || body.p !== purpose || body.e < Date.now()) return null;
    if (!Array.isArray(body.i) || body.i.some((n) => !Number.isInteger(n) || n < 1 || n > SEED_WORDS)) return null;
    return body;
  } catch {
    return null;
  }
}

/**
 * A word-challenge answer travels as one string, so it fits every place a
 * second-factor code already goes (the credentials provider, the Google 2FA
 * step, step-up): "seed:<challenge token>:<word> <word> <word> <word>".
 */
export { encodeSeedAnswer } from "@/lib/recoveryPhraseFormat";
function decodeSeedAnswer(raw: string): { token: string; words: string[] } | null {
  const m = /^seed:([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+):([\s\S]*)$/.exec(raw.trim());
  return m ? { token: m[1], words: m[2].trim().split(/\s+/) } : null;
}

// ── Shape detection at the 2FA step ──────────────────────────────────────

/** True for input that can only be a recovery phrase/answer at the 2FA step. */
export function looksLikePhrase(raw: string): boolean {
  if (raw.trim().startsWith("seed:")) return true;
  const value = normalizePhrase(raw);
  return value.length >= MIN_CUSTOM_LENGTH && value.length <= MAX_PHRASE_LENGTH && !looksLikeTotp(value) && !looksLikeRecoveryCode(value);
}

export const hashCustomPhrase = (phrase: string) => bcrypt.hash(normalizePhrase(phrase), BCRYPT_COST);

// ── Verification ─────────────────────────────────────────────────────────

export type PhraseCheck = { ok: true } | { ok: false; reason: TwoFactorFailure; retryAfterMs?: number };

export interface PhraseState {
  id: string;
  recoveryPhraseHash: string | null;
  recoveryPhraseType: string | null;
  recoveryPhraseSalt: string | null;
  recoveryWordHashes: unknown;
  recoveryLastChallengeAt: Date | null;
  twoFactorFailedAttempts: number;
  twoFactorLockedUntil: Date | null;
}

export const phraseTypeOf = (user: Pick<PhraseState, "recoveryPhraseType" | "recoveryPhraseHash" | "recoveryPhraseSalt">): RecoveryPhraseType | null =>
  user.recoveryPhraseType === "SEED_12" && user.recoveryPhraseSalt ? "SEED_12" : user.recoveryPhraseHash ? "CUSTOM_PHRASE" : null;

/**
 * Checks a recovery answer — a word-challenge answer for SEED_12, the whole
 * passphrase for CUSTOM_PHRASE — and records the outcome in the shared 2FA
 * counter, in the database, so the limit holds across serverless instances.
 */
export async function verifyRecoveryForUser(
  prisma: Pick<PrismaClient, "user">,
  user: PhraseState,
  raw: string,
  purpose: Exclude<ChallengePurpose, "setup">,
  now: Date = new Date()
): Promise<PhraseCheck> {
  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: "LOCKED", retryAfterMs: user.twoFactorLockedUntil.getTime() - now.getTime() };
  }
  const type = phraseTypeOf(user);
  if (!type) return { ok: false, reason: "NOT_ENROLLED" };

  let ok = false;
  let answeredAt: number | null = null;
  if (type === "SEED_12") {
    const answer = decodeSeedAnswer(raw);
    const challenge = answer ? readChallenge(answer.token, user.id, purpose) : null;
    const record = parseSeedRecord(user.recoveryPhraseSalt, user.recoveryWordHashes);
    const fresh = challenge && (!user.recoveryLastChallengeAt || challenge.t > user.recoveryLastChallengeAt.getTime());
    if (answer && challenge && record && fresh && answer.words.length === challenge.i.length) {
      ok = await seedWordsMatch(record, challenge.i, answer.words);
      answeredAt = challenge.t;
    }
  } else {
    const phrase = normalizePhrase(raw);
    ok = phrase.length > 0 && phrase.length <= MAX_PHRASE_LENGTH && !phrase.startsWith("seed:") && (await bcrypt.compare(phrase, user.recoveryPhraseHash!).catch(() => false));
  }

  if (!ok) {
    const attempts = user.twoFactorFailedAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user
      .update({
        where: { id: user.id },
        data: { twoFactorFailedAttempts: locked ? 0 : attempts, twoFactorLockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : user.twoFactorLockedUntil },
      })
      .catch((error) => console.error("[recovery-phrase] could not record a failed attempt:", error));
    return locked ? { ok: false, reason: "LOCKED", retryAfterMs: LOCKOUT_MS } : { ok: false, reason: "INVALID_CODE" };
  }

  // Spend the challenge before reporting success: a conditional update, so
  // two requests racing with the same answer cannot both pass.
  if (answeredAt !== null) {
    const spent = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ recoveryLastChallengeAt: null }, { recoveryLastChallengeAt: { lt: new Date(answeredAt) } }] },
      data: { recoveryLastChallengeAt: new Date(answeredAt), twoFactorFailedAttempts: 0, twoFactorLockedUntil: null },
    });
    if (spent.count === 0) return { ok: false, reason: "REPLAYED" };
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorFailedAttempts: 0, twoFactorLockedUntil: null } });
  }
  return { ok: true };
}

/** What the person must answer: positions to type, or the hint for their passphrase. */
export type { RecoveryChallenge } from "@/lib/recoveryPhraseFormat";
import type { RecoveryChallenge } from "@/lib/recoveryPhraseFormat";

export function recoveryChallengeFor(
  user: Pick<PhraseState, "id" | "recoveryPhraseType" | "recoveryPhraseHash" | "recoveryPhraseSalt"> & { recoveryPhraseHint: string | null },
  purpose: Exclude<ChallengePurpose, "setup">
): RecoveryChallenge {
  const type = phraseTypeOf(user);
  if (type === "SEED_12") {
    const indices = pickPositions(CHALLENGE_WORDS);
    return { type, indices, challengeToken: issueChallenge(user.id, purpose, indices) };
  }
  if (type === "CUSTOM_PHRASE") return { type, hint: user.recoveryPhraseHint };
  return { type: "NONE" };
}
