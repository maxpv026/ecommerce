import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison; hashing first removes the length side channel. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * `Authorization: Bearer {CRON_SECRET}` — what Vercel Cron sends. Shared by
 * every /api/cron route so the check can't drift between them.
 *
 * Fails closed: an unset secret must never turn a cron route into an open
 * endpoint that anyone can use to mail our customers.
 */
export function cronAuthorization(request: Request): "ok" | "unconfigured" | "denied" {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const provided = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return provided && secretMatches(provided, expected) ? "ok" : "denied";
}
