import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import en from "../messages/en.json";

type Messages = Record<string, unknown>;

/**
 * Fill gaps in a locale's dictionary from English, namespace by namespace.
 *
 * Why this exists: next-intl renders a missing key as its own path, so a
 * dictionary without `Hub.tickerKicker` puts the literal string
 * "Hub.tickerKicker" on the page. Adding a feature to en.json therefore used
 * to mean either editing all twenty-nine files in the same commit or shipping
 * twenty-eight broken locales — and English copied into twenty-eight files is
 * indistinguishable from a real translation once it is there, so nobody ever
 * finds it again to fix.
 *
 * A merge keeps one English source. An untranslated string still reads as
 * English to the user, but the gap is visible in the diff (the key simply is
 * not in uk.json) and next-intl still logs the miss, so it stays findable.
 *
 * Deliberately a shallow, per-namespace merge rather than a deep one: the
 * dictionaries are exactly two levels (namespace → key), so this covers every
 * case the format can produce, and it cannot silently reach into a
 * translator's nested ICU string.
 */
function withEnglishFallback(messages: Messages): Messages {
  const merged: Messages = { ...en };
  for (const [namespace, entries] of Object.entries(messages)) {
    const base = merged[namespace];
    merged[namespace] =
      base && typeof base === "object" && entries && typeof entries === "object"
        ? { ...(base as Messages), ...(entries as Messages) }
        : entries;
  }
  return merged;
}

export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  // `explicit` is set when a locale is passed directly to an awaitable —
  // `getTranslations({locale, namespace})` in a generateMetadata, which is how
  // /hub and /categories title themselves. `requestLocale` (the [locale]
  // segment) covers every normal render. It carries a deprecation notice
  // pointing at next/root-params; migrating that is a change to how all
  // twenty-nine locales resolve on every route, so it is not bundled in here.
  const requested = explicit ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  if (locale === routing.defaultLocale) return { locale, messages: en as Messages };

  const messages = (await import(`../messages/${locale}.json`)).default as Messages;
  return { locale, messages: withEnglishFallback(messages) };
});
