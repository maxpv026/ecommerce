import { routing } from "@/i18n/routing";

const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$|\\?|#)`);

/**
 * Turns a post-sign-in `callbackUrl` into a path for next-intl's router.
 *
 * Two things a raw callbackUrl can carry that the router must not get:
 *
 *  - A locale prefix. proxy.ts (and Auth.js's callback-url cookie) hand us
 *    the visited path as-is, e.g. "/en/profile", but the next-intl router
 *    adds the locale itself — pushing "/en/profile" produced "/en/en/profile"
 *    (and "/en" → "/en/en" after the Google 2FA step). The prefix is
 *    stripped; the router re-adds the active or saved locale.
 *  - Another origin. It comes from the query string, so
 *    "?callbackUrl=https://evil.example" or "//evil.example" must not be
 *    followed after sign-in. Anything not a same-site path becomes "/".
 */
export function callbackPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let path = raw.trim();
  // Absolute URL on this site → keep path+query+hash; any other origin → home.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    try {
      const url = new URL(path);
      if (typeof window === "undefined" || url.origin !== window.location.origin) return "/";
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return "/";
    }
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/";
  const stripped = path.replace(LOCALE_PREFIX, "");
  return stripped === "" ? "/" : stripped.startsWith("/") ? stripped : `/${stripped}`;
}
