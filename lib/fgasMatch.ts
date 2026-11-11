/**
 * Holder ↔ account matching and certificate-number normalisation for F-Gas
 * verification. Pure: lib/fgasLifecycle calls it, the suite tests it.
 *
 * Names are compared as token sets after normalisation, because the same
 * company is written many ways: "Kälte-Technik GmbH" / "KAELTE TECHNIK",
 * "ТОВ «Холод Сервіс»" / "Kholod Servis LLC", "Smith & Sons Ltd." / "Smith and
 * Sons". Legal forms are dropped, diacritics folded, Cyrillic transliterated,
 * and tokens match exactly, by prefix (4+ chars) or within one edit (5+).
 */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya", ё: "yo", ы: "y", э: "e", ъ: "",
};

/** Legal forms and filler words that say nothing about WHICH company. */
const NOISE = new Set([
  "ltd", "limited", "llc", "inc", "plc", "co", "company", "corp", "corporation", "the", "and", "und", "et", "i", "a", "of",
  "gmbh", "ag", "kg", "ug", "ohg", "mbh", "sp", "zoo", "z", "o", "spolka", "sro", "as", "sa", "sas", "sarl", "srl", "spa",
  "bv", "nv", "vof", "ab", "oy", "oyj", "ou", "uab", "sia", "eood", "ood", "ad", "et", "kft", "zrt", "nyrt", "doo", "dd",
  "tov", "pp", "fop", "pat", "prat", "ooo", "ip", "ao", "zao", "pao", "aps", "asa", "lda", "unipessoal", "sl", "slu",
]);

export function normalizeTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  const latin = value
    .toLowerCase()
    .replace(/[а-яёєіїґъыэ]/g, (c) => CYRILLIC[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ");
  return latin
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !NOISE.has(t));
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const tokenMatch = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && editDistanceAtMostOne(a, b));

/** Share of the shorter name's tokens found in the longer one (0–1). */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = normalizeTokens(a);
  const B = normalizeTokens(b);
  if (A.length === 0 || B.length === 0) return 0;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  const hits = short.filter((t) => long.some((u) => tokenMatch(t, u))).length;
  return hits / short.length;
}

export const NAME_MATCH_THRESHOLD = 0.6;

/** "BG 123-456-789" → "BG123456789". Also the duplicate-detection key for certificate numbers. */
export const normalizeIdentifier = (value: string | null | undefined) => (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/** VAT numbers equal, allowing one side to omit the country prefix. */
export function vatMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeIdentifier(a);
  const y = normalizeIdentifier(b);
  if (x.length < 6 || y.length < 6) return false;
  const digits = (s: string) => s.replace(/^[A-Z]{2}/, "");
  return x === y || digits(x) === digits(y);
}

export interface AccountIdentity {
  name: string | null;
  companyName: string | null;
  vatNumber: string | null;
}

export type HolderMatch =
  | { outcome: "pass"; code: "VAT_MATCH" | "COMPANY_MATCH" | "PERSON_MATCH"; detail: string | null }
  | { outcome: "review"; code: "MISMATCH" | "NO_ACCOUNT_NAME" | "NO_HOLDER"; detail: string | null };

export function matchHolder(holder: { companyName?: string | null; personName?: string | null; vatNumber?: string | null }, account: AccountIdentity): HolderMatch {
  const shown = holder.companyName ?? holder.personName ?? null;
  if (!holder.companyName && !holder.personName && !holder.vatNumber) return { outcome: "review", code: "NO_HOLDER", detail: null };
  if (!account.companyName && !account.name && !account.vatNumber) return { outcome: "review", code: "NO_ACCOUNT_NAME", detail: shown };
  if (vatMatches(holder.vatNumber, account.vatNumber)) return { outcome: "pass", code: "VAT_MATCH", detail: shown };
  if (holder.companyName && (nameSimilarity(holder.companyName, account.companyName) >= NAME_MATCH_THRESHOLD)) return { outcome: "pass", code: "COMPANY_MATCH", detail: shown };
  const person = holder.personName ?? holder.companyName;
  if (person && nameSimilarity(person, account.name) >= NAME_MATCH_THRESHOLD) return { outcome: "pass", code: "PERSON_MATCH", detail: shown };
  return { outcome: "review", code: "MISMATCH", detail: shown };
}

/** Two accounts belong to the same company: VAT equal, or company names match. */
export function sameCompany(a: AccountIdentity & { certificateCompany?: string | null }, b: AccountIdentity): boolean {
  if (vatMatches(a.vatNumber, b.vatNumber)) return true;
  const ca = a.companyName ?? a.certificateCompany ?? null;
  return Boolean(ca && b.companyName && nameSimilarity(ca, b.companyName) >= NAME_MATCH_THRESHOLD);
}
