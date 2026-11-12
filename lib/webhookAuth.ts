import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison; hashing first removes the length side channel. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * `Authorization: Bearer {CRM_WEBHOOK_SECRET}` — shared by every CRM webhook.
 * "unconfigured" must fail closed (503): an unset secret never opens an endpoint.
 */
export function crmWebhookAuth(request: Request): "ok" | "unconfigured" | "denied" {
  const expected = process.env.CRM_WEBHOOK_SECRET?.trim();
  if (!expected) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const provided = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return provided && secretMatches(provided, expected) ? "ok" : "denied";
}
