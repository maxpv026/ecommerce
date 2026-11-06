import { defineRouting } from "next-intl/routing";

/**
 * The language preference cookie. One definition, read by next-intl's
 * middleware (proxy.ts) and written by the language switchers
 * (lib/hooks/useSwitchLocale), so both always agree on name and lifetime.
 *
 * next-intl v4 makes it a session cookie by default — the choice would be
 * forgotten when the browser closes. A year keeps it. It stores only the
 * language the visitor picked, which is functionality they asked for, not
 * tracking.
 */
export const LOCALE_COOKIE = { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;

export const routing = defineRouting({
  // All 24 official languages of the EU, plus Ukrainian, Russian, Korean,
  // Chinese (Simplified), and Turkish.
  locales: [
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu",
    "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv",
    "uk", "ru", "ko", "zh", "tr",
  ],
  defaultLocale: "en",
  // How the middleware picks a locale for a request (next-intl resolveLocale):
  //   1. the locale already in the URL (/de/...) — an explicit link wins
  //   2. the NEXT_LOCALE cookie — the visitor's own earlier choice
  //   3. Accept-Language — the browser's languages, best supported match
  //   4. defaultLocale (en)
  // So a bare "/" is Cookie > Browser header > Default.
  localeDetection: true,
  localeCookie: LOCALE_COOKIE,
});

export type AppLocale = (typeof routing.locales)[number];
