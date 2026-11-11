import { cronAuthorization } from "@/lib/cronAuth";
import { expireDueCertificates } from "@/lib/fgasLifecycle";
import { sendFgasStatusEmail } from "@/lib/fgasNotify";

/**
 * GET /api/cron/fgas-expiry — daily (vercel.json).
 *
 * Writes EXPIRED onto every VERIFIED account whose certificate has lapsed,
 * logs it (FgasAuditLog AUTO_EXPIRED) and emails the buyer a renewal notice.
 * Checkout does not wait for this: every gate already treats a lapsed
 * certificate as EXPIRED at read time (getEffectiveFgasStatus). This makes it
 * durable and tells the buyer.
 *
 * Authorization: Bearer CRON_SECRET (Vercel Cron sends it). Fails closed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authz = cronAuthorization(request);
  if (authz === "unconfigured") return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (authz === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const expired = await expireDueCertificates();
  // Sequential: a handful a day, and a mail server doesn't need a burst.
  for (const e of expired) {
    await sendFgasStatusEmail({ userId: e.userId, kind: "EXPIRED", certificate: { number: e.certificateNumber, expiresAt: e.expiresAt } });
  }
  return Response.json({ ok: true, expired: expired.length });
}
