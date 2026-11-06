import { cookies } from "next/headers";
import { GOOGLE_2FA_COOKIE, challengeCookieOptions, verifyGoogleTwoFactorChallenge } from "@/lib/googleTwoFactor";

/**
 * GET /api/two-factor/start?c=<challenge>
 *
 * Where auth.ts's signIn callback sends a Google sign-in that still needs
 * the authenticator code. It moves the challenge out of the URL into an
 * HttpOnly cookie (so it isn't left in the address bar, history or a
 * Referer) and continues to the code screen.
 *
 * Nothing here signs anyone in: the cookie only lets the code step know
 * which account Google just proved, and is worthless without that
 * account's authenticator.
 */

export const dynamic = "force-dynamic";

/** Only same-site paths survive as the post-login destination. */
function safeCallback(raw: string | undefined, origin: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const token = url.searchParams.get("c");

  if (!verifyGoogleTwoFactorChallenge(token)) {
    return Response.redirect(new URL("/auth?error=google-2fa-expired", origin), 303);
  }

  const jar = await cookies();
  jar.set(GOOGLE_2FA_COOKIE, token!, challengeCookieOptions());

  // Keep where they were headed: Auth.js remembers it in its callback-url
  // cookie (prefixed on https).
  const callback = safeCallback(
    jar.get("__Secure-authjs.callback-url")?.value ?? jar.get("authjs.callback-url")?.value,
    origin
  );
  const next = new URL("/auth", origin);
  next.searchParams.set("step", "google-2fa");
  if (callback && !callback.startsWith("/auth")) next.searchParams.set("callbackUrl", callback);

  return new Response(null, {
    status: 303,
    headers: { Location: `${next.pathname}${next.search}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
