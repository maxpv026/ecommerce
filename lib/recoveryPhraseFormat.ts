/**
 * Client-safe pieces of the recovery-phrase protocol (lib/recoveryPhrase is
 * server-only). A word-challenge answer travels as one string so it fits
 * every place a second-factor code already goes:
 *   "seed:<challenge token>:<word> <word> <word> <word>"
 */
export type RecoveryChallenge =
  | { type: "SEED_12"; indices: number[]; challengeToken: string }
  | { type: "CUSTOM_PHRASE"; hint: string | null }
  | { type: "NONE" };

export const normalizeSeedWord = (raw: string) => raw.normalize("NFKC").trim().toLowerCase();

export const encodeSeedAnswer = (token: string, words: string[]) => `seed:${token}:${words.map(normalizeSeedWord).join(" ")}`;

/** The answer to submit for a challenge, or null when it isn't complete yet. */
export function recoveryAnswer(challenge: RecoveryChallenge | null, words: string[], phrase: string): string | null {
  if (!challenge || challenge.type === "NONE") return null;
  if (challenge.type === "SEED_12") {
    return challenge.indices.every((_, i) => normalizeSeedWord(words[i] ?? "").length > 0) ? encodeSeedAnswer(challenge.challengeToken, words) : null;
  }
  return phrase.trim().replace(/\s+/g, " ").length >= 12 ? phrase.trim() : null;
}
