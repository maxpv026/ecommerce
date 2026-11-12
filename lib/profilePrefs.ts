/**
 * Profile preferences — the allowed values and their validation, shared by
 * the server action (lib/actions/profile) and the editor form, so the form
 * can say "invalid IBAN" before the round trip and the server still refuses
 * anything the form let through.
 */

export const AVATAR_TONES = ["slate", "blue", "emerald", "amber", "violet"] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/** Background + text classes for a monogram, light and dark. */
export const AVATAR_TONE_CLASS: Record<AvatarTone, string> = {
  slate: "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900",
  blue: "bg-blue-700 text-white",
  emerald: "bg-emerald-600 text-white",
  amber: "bg-amber-500 text-slate-900",
  violet: "bg-violet-600 text-white",
};

export const isAvatarTone = (v: unknown): v is AvatarTone => typeof v === "string" && (AVATAR_TONES as readonly string[]).includes(v);

/** What a buyer can prefer. The logistics team still picks the carrier per order. */
export const FULFILMENT_PREFS = ["DHL", "FREIGHT", "OWN_FLEET", "PICKUP"] as const;
export type FulfilmentPref = (typeof FULFILMENT_PREFS)[number];

export const UNIT_PREFS = ["metric", "imperial"] as const;
export type UnitPref = (typeof UNIT_PREFS)[number];

/** 1–3 letters or digits, upper-cased: "MP", "ME", "A1". */
export const normaliseInitials = (raw: string) => raw.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toUpperCase();

/** ISO 13616: country, check digits, BBAN; mod-97 of the rearranged number must be 1. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** "UA21 3223 1300 …" — groups of four, for display. */
export const formatIban = (iban: string) => iban.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();

/**
 * EU VAT id ("NL863495921B01", "DE123456789") or a Ukrainian ЄДРПОУ code
 * (8 digits) / ІПН (10 digits) — the company identifier Ukrainian invoices carry.
 */
export const isValidCompanyId = (raw: string) => {
  const v = raw.replace(/[\s.-]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{2,14}$/.test(v) || /^\d{8}$/.test(v) || /^\d{10}$/.test(v);
};
