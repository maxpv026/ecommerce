import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { authConfig } from "./auth.config";
import { routing } from "./i18n/routing";

// Uses the Edge-safe authConfig (no Prisma adapter / Credentials providers)
// instead of importing the full auth from "@/auth" — this still runs before
// next-intl's locale routing, so it can't rely on Node.js-only internals.
const { auth } = NextAuth(authConfig);
const handleI18nRouting = createIntlMiddleware(routing);

// The bare /profile dashboard is intentionally excluded — it renders its own
// signed-out empty state (with the bottom nav still visible) instead of
// being hard-redirected. Everything nested under it requires a session.
const PROTECTED_SEGMENTS = [
  "/profile/settings",
  "/profile/orders",
  "/profile/docs",
  "/profile/addresses",
  "/profile/company",
  "/profile/security",
  "/profile/support",
  "/notifications",
];

const LOCALE_PREFIX_PATTERN = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

function stripLocalePrefix(pathname: string) {
  const match = pathname.match(LOCALE_PREFIX_PATTERN);
  return match ? pathname.slice(match[0].length) || "/" : pathname;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const localeMatch = pathname.match(LOCALE_PREFIX_PATTERN);
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;
  const pathWithoutLocale = stripLocalePrefix(pathname);
  const isProtected = PROTECTED_SEGMENTS.some((prefix) => pathWithoutLocale.startsWith(prefix));

  // /admin is ADMIN-only and fails closed: guests, USER sessions, and
  // pre-RBAC session tokens (no role claim) are all sent to the home page.
  // The admin page itself re-checks the session server-side — this gate is
  // the outer wall, not the only one.
  const isAdminRoute = pathWithoutLocale === "/admin" || pathWithoutLocale.startsWith("/admin/");
  if (isAdminRoute && req.auth?.user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL(`/${locale}`, req.nextUrl.origin));
  }

  if (isProtected && !req.auth) {
    const authUrl = new URL(`/${locale}/auth`, req.nextUrl.origin);
    authUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(authUrl);
  }

  return handleI18nRouting(req);
});

export const config = {
  // Runs on every page route, skipping API routes, Next.js internals, and
  // any request for a file with an extension (static assets).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
