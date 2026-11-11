import "server-only";

import { headers } from "next/headers";
import { checkRateLimit, clientIp, type RateLimitRule } from "@/lib/rateLimit";

/**
 * Per-address rate limit for Server Actions.
 *
 * proxy.ts limits by URL path, and a Server Action has none of its own: it is
 * a POST to whatever page rendered the form, so the proxy's rules never see
 * it. Every action that spends money (a model call) or sends mail without a
 * signed-in caller has to check here instead.
 *
 * Same in-memory, per-instance counter as the proxy (see lib/rateLimit's
 * caveats): a brake on one machine hammering an endpoint, not a defence
 * against a distributed attack.
 */
export async function withinActionLimit(bucket: string, rule: RateLimitRule): Promise<boolean> {
  const ip = clientIp(await headers());
  return checkRateLimit(`action:${bucket}:${ip}`, rule).success;
}

/** The budget the public AI helpers share: generous for a person typing. */
export const PUBLIC_AI_RULE: RateLimitRule = { limit: 15, windowMs: 60_000 };
