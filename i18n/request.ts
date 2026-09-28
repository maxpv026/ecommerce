import { getRequestConfig } from "next-intl/server";
import { hasLocale, IntlErrorCode, type IntlError } from "next-intl";
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

/**
 * Load one locale's dictionary, or fall back to English.
 *
 * ── Why this is wrapped, and why it is the important line in this file ──
 *
 * This import is the single place a localized route can take the whole page
 * down with a 500. Everything downstream of it is safe by design: next-intl
 * routes a missing key AND an ICU formatting error through `onError` and
 * `getMessageFallback` below, so neither throws. But `getRequestConfig` runs
 * before any of that, and an exception here escapes into the render of every
 * page under `/[locale]`.
 *
 * It is also asymmetric in a way that hides the problem in development. The
 * default locale returns the STATICALLY imported `en` and never reaches this
 * function, so `/en` keeps working while `/ru` does not — and locally every
 * file is on disk, so nothing fails at all. The failure mode is a production
 * one: a dynamic import built from a template literal needs the bundler to
 * trace all twenty-nine JSON files into the serverless function, and if a
 * file is missing from the deployment (not committed, filtered by an ignore
 * rule, or simply not traced) the throw only happens on the locale that is
 * missing.
 *
 * Falling back to English means a deployment that loses one dictionary
 * degrades to English on that locale instead of serving a 500. The
 * console.error is what makes it findable in the Vercel function log rather
 * than silently monolingual.
 */
async function loadMessages(locale: string): Promise<Messages> {
  try {
    const mod = await import(`../messages/${locale}.json`);
    return withEnglishFallback(mod.default as Messages);
  } catch (error) {
    console.error(
      `[i18n] Could not load messages/${locale}.json — serving English for this request. ` +
        `Check the file is committed and present in the deployment.`,
      error
    );
    return en as Messages;
  }
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

  const messages =
    locale === routing.defaultLocale ? (en as Messages) : await loadMessages(locale);

  return {
    locale,
    messages,

    /**
     * next-intl calls this for a missing message AND for one that failed to
     * format, and its default is `console.error` — it does not throw either
     * way. Overridden here only to keep the signal readable: with the English
     * merge above, a MISSING_MESSAGE means a key exists in en.json and not yet
     * in this locale, which is an expected state between adding a feature and
     * running the translation script. Logging those at error level buries the
     * ones that matter.
     *
     * INVALID_MESSAGE is the one to care about: it means a translated string
     * has broken ICU syntax, and the reader is seeing a fallback instead of
     * the sentence. scripts/translate-i18n.ts validates against exactly that
     * before writing, so anything arriving here was hand-edited.
     */
    onError(error: IntlError) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        if (process.env.NODE_ENV !== "production") console.warn(`[i18n] ${error.message}`);
        return;
      }
      console.error(`[i18n] ${error.code}: ${error.message}`);
    },

    /**
     * What renders when a message cannot be resolved or formatted.
     *
     * The default is the key path, so a reader gets the literal string
     * "Compliance.exportCta" on a button. English is a far better answer: it
     * is real copy, every professional buyer in this market reads some, and
     * it keeps the page usable while the gap is fixed. The key path is kept
     * as the last resort, because a blank button is worse than a visible one
     * that tells you what is wrong.
     */
    getMessageFallback({ namespace, key }) {
      const path = namespace ? `${namespace}.${key}` : key;
      const group = namespace ? (en as Messages)[namespace] : undefined;
      const english =
        group && typeof group === "object"
          ? (group as Record<string, unknown>)[key]
          : (en as Messages)[key];
      return typeof english === "string" ? english : path;
    },
  };
});
