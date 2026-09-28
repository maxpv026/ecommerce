import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { authConfig } from "./auth.config";
import { routing } from "./i18n/routing";
import { checkRateLimit, clientIp, ruleFor } from "./lib/rateLimit";

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
  "/profile/compliance",
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

  // ── Rate limiting ──
  // Runs before anything else so a flood is rejected at the cheapest point.
  // Best-effort only; lib/rateLimit.ts documents exactly why and what to
  // swap in for a real limit.
  const limited = ruleFor(pathname);
  let budget: Record<string, string> | null = null;
  if (limited) {
    const verdict = checkRateLimit(`${limited.prefix}:${clientIp(req.headers)}`, limited.rule);
    budget = {
      "RateLimit-Limit": String(verdict.limit),
      "RateLimit-Remaining": String(verdict.remaining),
      "RateLimit-Reset": String(Math.max(0, Math.ceil((verdict.reset - Date.now()) / 1000))),
    };
    if (!verdict.success) {
      return new NextResponse(JSON.stringify({ ok: false, code: "RATE_LIMITED" }), {
        status: 429,
        headers: { ...budget, "Content-Type": "application/json", "Retry-After": budget["RateLimit-Reset"] },
      });
    }
  }

  // The budget belongs on the responses a caller actually gets while it still
  // has one — a client told its remaining quota only at the moment it is
  // rejected has learned nothing it could have acted on. Every return below
  // goes through here so a rule added for a non-API path keeps reporting.
  const finish = (res: NextResponse) => {
    if (budget) for (const [key, value] of Object.entries(budget)) res.headers.set(key, value);
    return res;
  };

  // ── API admin surface ──
  // The routes under /api/admin are guarded individually by requireAdmin(),
  // which re-reads the row. This is the outer wall: it refuses anything
  // without an authenticated, 2FA-carrying session before a handler is ever
  // reached, so an unauthenticated flood costs nothing.
  if (pathname.startsWith("/api/admin")) {
    if (!req.auth?.user || req.auth.user.role !== "ADMIN") {
      return finish(NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 }));
    }
    if (req.auth.user.isTwoFactorEnabled !== true) {
      return finish(NextResponse.json({ ok: false, code: "TWO_FACTOR_REQUIRED" }, { status: 403 }));
    }
  }

  // API routes stop here. Everything below is locale routing, and handing
  // next-intl an "/api/auth/session" would rewrite it to "/en/api/..." and
  // break authentication outright. They are only in the matcher so the two
  // guards above can run.
  if (pathname.startsWith("/api/")) return finish(NextResponse.next());
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
    return finish(NextResponse.redirect(new URL(`/${locale}`, req.nextUrl.origin)));
  }

  // An admin without an authenticator is sent to set one up rather than
  // bounced to the home page, so the block is actionable. This reads a
  // session claim because middleware runs on the Edge with no database — the
  // real gate is requireAdmin(), which re-reads the row on every admin
  // action. A stale claim can therefore delay access but never grant it.
  if (isAdminRoute && req.auth?.user?.isTwoFactorEnabled !== true) {
    const setup = new URL(`/${locale}/profile`, req.nextUrl.origin);
    setup.searchParams.set("notice", "admin-2fa-required");
    return finish(NextResponse.redirect(setup));
  }

  if (isProtected && !req.auth) {
    const authUrl = new URL(`/${locale}/auth`, req.nextUrl.origin);
    authUrl.searchParams.set("callbackUrl", pathname);
    return finish(NextResponse.redirect(authUrl));
  }

  return finish(handleI18nRouting(req));
});

export const config = {
  // Page routes, plus the API routes this file actually guards. `api` used
  // to be excluded wholesale, which would have meant the /api/admin gate and
  // the rate limiter never ran. Everything else under /api is still skipped
  // so ordinary API traffic pays no middleware cost.
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
    "/api/admin/:path*",
    "/api/auth/:path*",
    "/api/waitlist",
    "/api/verify-fgas",
  ],
};
