import "server-only";

import { createTranslator } from "use-intl/core";
import en from "../messages/en.json";
import { routing } from "@/i18n/routing";

type Messages = Record<string, Record<string, unknown>>;

/**
 * A translator for one namespace in a recipient's locale, outside any
 * request (crons, after() callbacks). Same fallback as i18n/request.ts: a
 * locale's missing keys, or a missing file, fall back to English.
 */
export async function emailTranslator(locale: string | null | undefined, namespace: string) {
  const loc = (routing.locales as readonly string[]).includes(locale ?? "") ? (locale as string) : routing.defaultLocale;
  let messages = en as unknown as Messages;
  if (loc !== "en") {
    try {
      const mod = (await import(`../messages/${loc}.json`)) as { default: Messages };
      messages = { ...messages };
      for (const [ns, entries] of Object.entries(mod.default)) messages[ns] = { ...(messages[ns] ?? {}), ...entries };
    } catch (error) {
      console.error(`[email-i18n] messages/${loc}.json unavailable — sending English.`, error);
    }
  }
  const t = createTranslator({ locale: loc, messages, namespace } as never) as unknown as (key: string, values?: Record<string, string | number>) => string;
  return { t, locale: loc };
}

/**
 * Several locales end a long date with a period ("12 листопада 2026 р."),
 * so a sentence that ends on a date reads "р..". Collapses exactly two
 * periods before a space or the end — an ellipsis ("...") is left alone.
 */
export const tidyDots = (text: string) => text.replace(/(?<!\.)\.\.(?=\s|$)/g, ".");
