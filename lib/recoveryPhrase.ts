import "server-only";

import bcrypt from "bcryptjs";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS, looksLikeRecoveryCode, looksLikeTotp, type TwoFactorFailure } from "@/lib/twoFactor";

/**
 * The recovery phrase — a way back in when the authenticator is gone.
 *
 * Either 12 words from the BIP-39 English list (128 bits of entropy,
 * generated here with a CSPRNG) or the buyer's own passphrase of at least
 * MIN_CUSTOM_LENGTH characters. Only a bcrypt hash is stored, after
 * normalising case, Unicode form and spacing, so "Apple  Banana" typed on a
 * phone matches "apple banana" written on paper.
 *
 * It is accepted wherever an authenticator code is (the 2FA step of
 * sign-in, and step-up), and it shares the authenticator's failure counter
 * and lockout: five wrong guesses of either lock both for 15 minutes.
 *
 * Shape tells the three factors apart at the 2FA step — six digits is TOTP,
 * eight hex characters is a recovery code, anything else of 12+ characters
 * is a phrase — which is why a custom phrase must be at least 12 long.
 */

export const MIN_CUSTOM_LENGTH = 12;
export const MAX_PHRASE_LENGTH = 200;
export const MAX_HINT_LENGTH = 80;
const BCRYPT_COST = 12;

export function normalizePhrase(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True for input that can only be a recovery phrase at the 2FA step. */
export function looksLikePhrase(raw: string): boolean {
  const value = normalizePhrase(raw);
  return value.length >= MIN_CUSTOM_LENGTH && value.length <= MAX_PHRASE_LENGTH && !looksLikeTotp(value) && !looksLikeRecoveryCode(value);
}

export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

export const hashRecoveryPhrase = (phrase: string) => bcrypt.hash(normalizePhrase(phrase), BCRYPT_COST);

export type PhraseCheck = { ok: true } | { ok: false; reason: TwoFactorFailure; retryAfterMs?: number };

interface PhraseState {
  id: string;
  recoveryPhraseHash: string | null;
  twoFactorFailedAttempts: number;
  twoFactorLockedUntil: Date | null;
}

/**
 * Checks a phrase against the account and records the outcome in the same
 * counter the authenticator uses — in the database, so the limit holds
 * across serverless instances.
 */
export async function verifyRecoveryPhraseForUser(
  prisma: Pick<PrismaClient, "user">,
  user: PhraseState,
  raw: string,
  now: Date = new Date()
): Promise<PhraseCheck> {
  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: "LOCKED", retryAfterMs: user.twoFactorLockedUntil.getTime() - now.getTime() };
  }
  if (!user.recoveryPhraseHash) return { ok: false, reason: "NOT_ENROLLED" };

  const phrase = normalizePhrase(raw);
  const match = phrase.length > 0 && phrase.length <= MAX_PHRASE_LENGTH && (await bcrypt.compare(phrase, user.recoveryPhraseHash).catch(() => false));
  if (!match) {
    const attempts = user.twoFactorFailedAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          twoFactorFailedAttempts: locked ? 0 : attempts,
          twoFactorLockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : user.twoFactorLockedUntil,
        },
      })
      .catch((error) => console.error("[recovery-phrase] could not record a failed attempt:", error));
    return locked ? { ok: false, reason: "LOCKED", retryAfterMs: LOCKOUT_MS } : { ok: false, reason: "INVALID_CODE" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorFailedAttempts: 0, twoFactorLockedUntil: null } });
  return { ok: true };
}
