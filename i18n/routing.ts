import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // All 24 official languages of the EU.
  locales: [
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu",
    "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv",
  ],
  defaultLocale: "en",
});

export type AppLocale = (typeof routing.locales)[number];
