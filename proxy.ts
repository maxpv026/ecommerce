import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { DEVICE_COOKIE, deviceCookieOptions, isValidDeviceId, newDeviceId } from "@/lib/deviceId";
import { strongSession } from "@/lib/authStrength";
import { authConfig } from "./auth.config";
import { routing } from "./i18n/routing";
import { checkRateLimit, clientIp, ruleFor } from "./lib/rateLimit";
import { can, canAccessAdminRoute, isStaffRole, permissionForAdminApi } from "@/lib/rbac";

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
  // The staff "confirm with Face ID / Touch ID" step before /admin (lib/authStrength).
  "/admin-unlock",
];

const LOCALE_PREFIX_PATTERN = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

/**
 * The origin the visitor actually used — https://www.myeenergy.eu, …com, or a
 * preview URL. Not req.nextUrl.origin: when AUTH_URL is set, Auth.js rewrites
 * the request URL to it, and every redirect built from it then sent one
 * domain's visitors to another (www.myeenergy.eu → www.myeenergy.com, and
 * before that → the *.vercel.app deployment URL).
 */
function visitorOrigin(req: { headers: Headers; nextUrl: URL }): string {
  // Host, not X-Forwarded-Host: Vercel sets Host to the domain requested, and
  // a client-supplied forwarding header must never steer a redirect.
  const host = (req.headers.get("host") ?? "").trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "")).split(",")[0]!.trim();
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

function stripLocalePrefix(pathname: string) {
  const match = pathname.match(LOCALE_PREFIX_PATTERN);
  return match ? pathname.slice(match[0].length) || "/" : pathname;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const origin = visitorOrigin(req);

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
    // Every browser gets a device id before it ever signs in, so a later
    // sign-in from it is recognised as the same device (lib/deviceId).
    if (!isValidDeviceId(req.cookies.get(DEVICE_COOKIE)?.value)) {
      res.cookies.set(DEVICE_COOKIE, newDeviceId(), deviceCookieOptions(origin.startsWith("https:")));
    }
    // Our own redirects (next-intl's locale redirect included) stay on the
    // visitor's domain. Only a Location on the app's own (possibly AUTH_URL-
    // rewritten) origin is re-based; anything else is left alone.
    const location = res.headers.get("location");
    if (location && origin !== req.nextUrl.origin) {
      try {
        const target = new URL(location, req.nextUrl.origin);
        if (target.origin === req.nextUrl.origin) res.headers.set("location", `${origin}${target.pathname}${target.search}${target.hash}`);
      } catch {}
    }
    return res;
  };

  // ── API admin surface ──
  // The routes under /api/admin are guarded individually by requireAdmin(),
  // which re-reads the row. This is the outer wall: it refuses anything
  // without an authenticated, 2FA-carrying session before a handler is ever
  // reached, so an unauthenticated flood costs nothing.
  // Each API needs its own permission (lib/rbac): the accountant's CSV
  // export is not the owner's SMTP test.
  if (pathname.startsWith("/api/admin")) {
    if (!req.auth?.user || !can(req.auth.user.role, permissionForAdminApi(pathname))) {
      return finish(NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 }));
    }
    // A second factor enrolled — the authenticator OR a passkey — and this
    // session signed in with a strong one (lib/authStrength).
    if (req.auth.user.secondFactor !== true) {
      return finish(NextResponse.json({ ok: false, code: "TWO_FACTOR_REQUIRED" }, { status: 403 }));
    }
    if (!strongSession(req.auth.user)) {
      return finish(NextResponse.json({ ok: false, code: "ADMIN_UNLOCK_REQUIRED" }, { status: 403 }));
    }
  }

  // API routes stop here. Everything below is locale routing, and handing
  // next-intl an "/api/auth/session" would rewrite it to "/en/api/..." and
  // break authentication outright. They are only in the matcher so the two
  // guards above can run.
  if (pathname.startsWith("/api/")) return finish(NextResponse.next());
  const localeMatch = pathname.match(LOCALE_PREFIX_PATTERN);

  // An unprefixed URL ("/", "/profile/settings", a bare link in an e-mail)
  // goes to next-intl first: it picks the language — NEXT_LOCALE cookie,
  // then Accept-Language (q-weighted, "uk-UA" → uk, "pt-BR" → pt), then
  // English — and redirects to the prefixed URL, whose request runs the
  // gates below. Gating here instead used to answer with a hardcoded
  // "/en/auth", so a Ukrainian browser following an unprefixed link to a
  // protected page landed on the English sign-in.
  if (!localeMatch) return finish(handleI18nRouting(req));
  const locale = localeMatch[1];
  const pathWithoutLocale = stripLocalePrefix(pathname);
  const isProtected = PROTECTED_SEGMENTS.some((prefix) => pathWithoutLocale.startsWith(prefix));

  // /admin is staff-only and fails closed: guests, USER sessions, and
  // pre-RBAC session tokens (no role claim) are all sent to the home page.
  // The admin page itself re-checks the session server-side — this gate is
  // the outer wall, not the only one.
  const isAdminRoute = pathWithoutLocale === "/admin" || pathWithoutLocale.startsWith("/admin/");
  if (isAdminRoute && !isStaffRole(req.auth?.user?.role)) {
    return finish(NextResponse.redirect(new URL(`/${locale}`, origin)));
  }
  // Staff, but not for this screen (lib/rbac): the in-shell 403 page, with a
  // real 403 status. The page guard re-checks the row; this is the fast path.
  if (isAdminRoute && !canAccessAdminRoute(req.auth?.user?.role, pathWithoutLocale)) {
    return finish(NextResponse.rewrite(new URL(`/${locale}/admin/forbidden`, origin), { status: 403 }));
  }

  // An admin without an authenticator is sent to set one up rather than
  // bounced to the home page, so the block is actionable. This reads a
  // session claim because middleware runs on the Edge with no database — the
  // real gate is requireAdmin(), which re-reads the row on every admin
  // action. A stale claim can therefore delay access but never grant it.
  // "Second factor" = the authenticator app OR a passkey (Face ID / Touch ID).
  if (isAdminRoute && req.auth?.user?.secondFactor !== true) {
    const setup = new URL(`/${locale}/profile`, origin);
    setup.searchParams.set("notice", "admin-2fa-required");
    return finish(NextResponse.redirect(setup));
  }
  // Enrolled, but this session signed in with something weaker (an emailed
  // code, Google without a pause): confirm with Face ID / Touch ID or the
  // authenticator first. /admin-unlock upgrades the session (lib/authStrength).
  if (isAdminRoute && !strongSession(req.auth?.user)) {
    const unlock = new URL(`/${locale}/admin-unlock`, origin);
    unlock.searchParams.set("callbackUrl", pathWithoutLocale + req.nextUrl.search);
    return finish(NextResponse.redirect(unlock));
  }

  if (isProtected && !req.auth) {
    const authUrl = new URL(`/${locale}/auth`, origin);
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
    // Support chat + F-Gas consultant: rate-limited (a model call each).
    "/api/chat",
    "/api/chat/:path*",
    "/api/chat-fgas",
    "/api/chat-sds",
    "/api/smart-order",
  ],
};
