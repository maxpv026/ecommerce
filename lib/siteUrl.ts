import { routing } from "@/i18n/routing";

/**
 * Absolute, locale-prefixed links for things we email.
 *
 * A link in an email has no page to be relative to, so it must carry the
 * origin. The same rule already lives inline in lib/stockNotify.ts; it is
 * lifted here because checkout now needs it too, and a URL base that differs
 * between two email paths is the kind of thing that only shows up as a broken
 * link in a customer's inbox.
 *
 * (stockNotify still has its own copy — it is verified working and carries
 * extra per-subscriber locale re-validation, so it was left alone rather than
 * refactored on the way past.)
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL;
  if (!configured) {
    console.warn(
      "[siteUrl] Neither NEXT_PUBLIC_SITE_URL nor AUTH_URL is set — emailed links will point at localhost."
    );
  }
  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * @param path App-relative path WITHOUT a locale, e.g. "/profile/orders/abc".
 * @param locale Falls back to the default when absent or unrecognised — this
 *   value can come from a database column that predates its own validation.
 */
export function absoluteUrl(path: string, locale?: string): string {
  const segment =
    locale && (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}/${segment}${clean}`;
}
