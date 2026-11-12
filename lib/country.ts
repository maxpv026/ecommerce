import { routing } from "@/i18n/routing";

/**
 * Where a user is: one ISO 3166-1 alpha-2 code from the best signal on file.
 * Pure — no database, no request — so the same rules run at sign-in, in the
 * backfill script and in the admin directory (lib/userCountry persists it).
 *
 *   1. ip       the latest session's location (Vercel's geo header) + city
 *   2. address  the default address, else the most recent one
 *   3. vat      the VAT number's country prefix (EL → GR, XI → GB)
 *   4. phone    the dialing code of an international number (+380 → UA)
 *   5. locale   the interface language the user chose (uk → UA) — a guess,
 *               and labelled as one wherever it is shown
 *
 * Every rule refuses rather than guesses: "+1" (US or Canada?), Russian or
 * English as a language, and an address country nobody can read give null.
 */

export type CountrySource = "ip" | "address" | "vat" | "phone" | "locale";
export const COUNTRY_SOURCES: readonly CountrySource[] = ["ip", "address", "vat", "phone", "locale"];

export interface CountryResolution {
  code: string;
  city: string | null;
  source: CountrySource;
}

// ── ISO codes ──

/** Region codes Intl knows that are not countries (EU, UN, eurozone, private-use). */
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);

let codes: Set<string> | null = null;
/** Every alpha-2 code the runtime can name — about 250. */
function allCodes(): Set<string> {
  if (codes) return codes;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const found = new Set<string>();
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      try {
        // Retired codes (DD East Germany, YU, SU, ZR…) canonicalise to their
        // successor and are named after it — "DD" reads "Germany". Not countries.
        if (Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
        if (names.of(code)) found.add(code);
      } catch {
        // not a well-formed region in this runtime
      }
    }
  }
  return (codes = found);
}

export const isCountryCode = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{2}$/.test(value) && allCodes().has(value);

/** Codes people write that ISO spells differently. */
const CODE_ALIASES: Record<string, string> = { UK: "GB", EL: "GR", XI: "GB" };

const asCode = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  const code = CODE_ALIASES[up] ?? up;
  return isCountryCode(code) ? code : null;
};

// ── Display ──

/** 🇺🇦 from "UA" — two regional-indicator letters. */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "Україна" for ("UA", "uk"), "Ukraine" for ("UA", "en"); the code itself if the runtime can't name it. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// ── 1. IP location ──

/** A geo header's value, if it is a real country ("XX" unknown and "T1" Tor are not). */
export const countryFromGeoHeader = (value: string | null | undefined): string | null => (value && /^[A-Z]{2}$/.test(value) ? asCode(value) : null);

// ── 2. Address: free text in any of the 29 UI languages ──

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Names people type that CLDR doesn't use (any language; folded on lookup). */
const NAME_ALIASES: Record<string, string> = {
  usa: "US", "u s a": "US", america: "US", "united states of america": "US",
  "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  holland: "NL", "the netherlands": "NL",
  "czech republic": "CZ", "ceska republika": "CZ", "чехия": "CZ", "чехія": "CZ",
  turkey: "TR", turkiye: "TR",
  "republic of moldova": "MD", "north macedonia": "MK", macedonia: "MK",
  "south korea": "KR", korea: "KR",
  "україна": "UA", ukraina: "UA",
};

let nameIndex: Map<string, string> | null = null;
function names(): Map<string, string> {
  if (nameIndex) return nameIndex;
  const index = new Map<string, string>();
  const add = (name: string, code: string) => {
    const key = fold(name);
    if (key && !index.has(key)) index.set(key, code);
  };
  // English first: on a collision between languages the English name wins.
  for (const locale of ["en", ...routing.locales.filter((l) => l !== "en")]) {
    let dn: Intl.DisplayNames;
    try {
      dn = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    } catch {
      continue;
    }
    for (const code of allCodes()) {
      const name = dn.of(code);
      if (!name) continue;
      add(name, code);
      // "Congo (DRC)", "Hong Kong SAR China" — also without the qualifier.
      const bare = name.replace(/\s*\(.*\)\s*$/, "");
      if (bare !== name) add(bare, code);
    }
  }
  for (const [alias, code] of Object.entries(NAME_ALIASES)) add(alias, code);
  return (nameIndex = index);
}

/** "Україна", "Deutschland", "the Netherlands", "PL", "UK" → ISO code; null if unreadable. */
export function countryFromText(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return asCode(t);
  return names().get(fold(t)) ?? null;
}

function countryFromAddress(address: { country: string | null; fullAddress?: string | null }): string | null {
  const direct = countryFromText(address.country);
  if (direct) return direct;
  // Rows saved before the structured fields: "street, 79000 Lviv, Ukraine".
  if (!address.country && address.fullAddress) return countryFromText(address.fullAddress.split(",").pop());
  return null;
}

// ── 3. VAT prefix ──

/** NL863495921B01 → NL, EL… → GR, XI… (Northern Ireland) → GB, "CHE-123…" → CH. */
export function countryFromVat(vat: string | null | undefined): string | null {
  const v = vat?.replace(/[\s.-]/g, "").toUpperCase();
  if (!v || !/^[A-Z]{2}[A-Z0-9]{2,}/.test(v)) return null;
  return asCode(v.slice(0, 2));
}

// ── 4. Phone dialing code ──

/**
 * International dialing codes for Europe, its neighbours and the larger
 * markets. "+1" (US, Canada, Caribbean) and "+7" outside Kazakhstan's ranges
 * are ambiguous or shared — +7 is Russia unless it is +76/+77.
 */
const DIAL: Record<string, string> = {
  "30": "GR", "31": "NL", "32": "BE", "33": "FR", "34": "ES", "36": "HU", "39": "IT", "40": "RO", "41": "CH", "43": "AT",
  "44": "GB", "45": "DK", "46": "SE", "47": "NO", "48": "PL", "49": "DE", "90": "TR", "350": "GI", "351": "PT", "352": "LU",
  "353": "IE", "354": "IS", "355": "AL", "356": "MT", "357": "CY", "358": "FI", "359": "BG", "370": "LT", "371": "LV",
  "372": "EE", "373": "MD", "374": "AM", "375": "BY", "376": "AD", "377": "MC", "378": "SM", "380": "UA", "381": "RS",
  "382": "ME", "383": "XK", "385": "HR", "386": "SI", "387": "BA", "389": "MK", "420": "CZ", "421": "SK", "423": "LI",
  "994": "AZ", "995": "GE", "998": "UZ", "7": "RU", "76": "KZ", "77": "KZ", "20": "EG", "27": "ZA", "52": "MX", "54": "AR",
  "55": "BR", "61": "AU", "64": "NZ", "81": "JP", "82": "KR", "86": "CN", "91": "IN", "212": "MA", "966": "SA", "971": "AE",
  "972": "IL",
};

/** "+380 67 …" or "0049 …" → UA / DE. A number without its country code says nothing. */
export function countryFromPhone(phone: string | null | undefined): string | null {
  const p = phone?.replace(/[\s()./-]/g, "");
  if (!p) return null;
  const digits = p.startsWith("+") ? p.slice(1) : p.startsWith("00") ? p.slice(2) : null;
  if (!digits || !/^\d{6,15}$/.test(digits)) return null;
  for (const len of [3, 2, 1]) {
    const code = DIAL[digits.slice(0, len)];
    if (code) return code;
  }
  return null;
}

// ── 5. Interface language ──

/**
 * The country a UI language most likely means. English and Russian are left
 * out: both are used across many countries, so they say nothing.
 */
const LOCALE_COUNTRY: Record<string, string> = {
  bg: "BG", hr: "HR", cs: "CZ", da: "DK", nl: "NL", et: "EE", fi: "FI", fr: "FR", de: "DE", el: "GR", hu: "HU", ga: "IE",
  it: "IT", lv: "LV", lt: "LT", mt: "MT", pl: "PL", pt: "PT", ro: "RO", sk: "SK", sl: "SI", es: "ES", sv: "SE", uk: "UA",
  ko: "KR", zh: "CN", tr: "TR",
};

export const countryFromLocale = (locale: string | null | undefined): string | null => (locale ? (LOCALE_COUNTRY[locale] ?? null) : null);

// ── The chain ──

export interface CountrySignals {
  /** Sessions, most recently active first. */
  sessions?: ReadonlyArray<{ country: string | null; city: string | null }>;
  /** Addresses, default first, then most recent. */
  addresses?: ReadonlyArray<{ country: string | null; city?: string | null; fullAddress?: string | null }>;
  vatNumber?: string | null;
  phone?: string | null;
  locale?: string | null;
}

export function resolveCountry(s: CountrySignals): CountryResolution | null {
  for (const session of s.sessions ?? []) {
    const code = countryFromGeoHeader(session.country);
    if (code) return { code, city: session.city?.trim() || null, source: "ip" };
  }
  for (const address of s.addresses ?? []) {
    const code = countryFromAddress(address);
    if (code) return { code, city: address.city?.trim() || null, source: "address" };
  }
  const vat = countryFromVat(s.vatNumber);
  if (vat) return { code: vat, city: null, source: "vat" };
  const phone = countryFromPhone(s.phone);
  if (phone) return { code: phone, city: null, source: "phone" };
  const locale = countryFromLocale(s.locale);
  if (locale) return { code: locale, city: null, source: "locale" };
  return null;
}
