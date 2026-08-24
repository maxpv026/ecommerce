import type { AppLocale } from "@/i18n/routing";

// Hardcoded autonyms (each language's name in itself). Deliberately NOT
// computed with Intl.DisplayNames at runtime: browsers ship display-name
// data for only some locales, and for the rest (notably "ga" and "mt")
// they silently fall back to the *user's system language* — which is how
// the switcher once showed "Ірландська"/"Мальтійська" instead of
// "Gaeilge"/"Malti". A static table is identical on server and client,
// which also removes the hydration mismatch the runtime lookup caused.
const AUTONYMS: Record<AppLocale, string> = {
  bg: "Български",
  hr: "Hrvatski",
  cs: "Čeština",
  da: "Dansk",
  nl: "Nederlands",
  en: "English",
  et: "Eesti",
  fi: "Suomi",
  fr: "Français",
  de: "Deutsch",
  el: "Ελληνικά",
  hu: "Magyar",
  ga: "Gaeilge",
  it: "Italiano",
  lv: "Latviešu",
  lt: "Lietuvių",
  mt: "Malti",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  sk: "Slovenčina",
  sl: "Slovenščina",
  es: "Español",
  sv: "Svenska",
  uk: "Українська",
  ru: "Русский",
  ko: "한국어",
  zh: "中文",
  tr: "Türkçe",
};

/** Native display name of a locale (e.g. "de" -> "Deutsch"). */
export function nativeLanguageName(locale: string): string {
  return AUTONYMS[locale as AppLocale] ?? locale;
}

// Fixed display order for language pickers: alphabetical by autonym, Latin
// scripts first, then Greek, Cyrillic, and CJK. Precomputed (not sorted at
// runtime) so the server and every client render the exact same list —
// runtime `localeCompare` collation differs between Node's ICU and the
// browser's, which used to flip entries and trip React hydration.
export const LANGUAGE_OPTIONS: Array<{ locale: AppLocale; name: string }> = ([
  "cs", "da", "de", "et", "en", "es", "fr", "ga", "hr", "it", "lv", "lt",
  "hu", "mt", "nl", "pl", "pt", "ro", "sk", "sl", "fi", "sv", "tr", "el",
  "bg", "ru", "uk", "ko", "zh",
] as AppLocale[]).map((locale) => ({ locale, name: AUTONYMS[locale] }));
