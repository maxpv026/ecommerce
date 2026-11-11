import { cronAuthorization } from "@/lib/cronAuth";
import { claimExpiryWarnings, expireDueCertificates, releaseExpiryWarning } from "@/lib/fgasLifecycle";
import { sendFgasExpiryWarning, sendFgasStatusEmail } from "@/lib/fgasNotify";
import { inChunks } from "@/lib/concurrency";

/**
 * GET /api/cron/fgas-expiry — daily (vercel.json).
 *
 * 1. Writes EXPIRED onto every VERIFIED account whose certificate has
 *    lapsed, logs it (FgasAuditLog AUTO_EXPIRED) and emails the buyer a
 *    renewal notice. Checkout does not wait for this: every gate already
 *    treats a lapsed certificate as EXPIRED at read time
 *    (getEffectiveFgasStatus). This makes it durable and tells the buyer.
 * 2. Warns buyers whose certificate lapses within 30 days, and again within
 *    7 (lib/fgasLifecycle claimExpiryWarnings) — if they kept that on.
 *
 * Authorization: Bearer CRON_SECRET (Vercel Cron sends it). Fails closed.
 *
 *   ?dryRun=1   report the warnings that are due; expire, claim and send nothing
 *   ?userId=ID  warnings for this account only, and skip step 1 — for testing
 *               without touching anyone else
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authz = cronAuthorization(request);
  if (authz === "unconfigured") return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (authz === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const onlyUser = url.searchParams.get("userId")?.trim() || null;

  if (dryRun) {
    const due = await claimExpiryWarnings({ dryRun: true, userId: onlyUser });
    return Response.json({ ok: true, dryRun: true, warningsDue: due.length, stages: due.map((w) => w.stage) });
  }

  const expired = onlyUser ? [] : await expireDueCertificates();
  // Five at a time: never a burst at the mail server, never a long serial
  // loop against the time limit. Neither sender throws.
  await inChunks(expired, 5, (e) => sendFgasStatusEmail({ userId: e.userId, kind: "EXPIRED", certificate: { number: e.certificateNumber, expiresAt: e.expiresAt } }));

  const warnings = await claimExpiryWarnings({ userId: onlyUser });
  let warned = 0;
  let failed = 0;
  await inChunks(warnings, 5, async (w) => {
    if (await sendFgasExpiryWarning({ userId: w.userId, expiresAt: w.expiresAt, certificateNumber: w.certificateNumber })) warned += 1;
    else {
      failed += 1;
      await releaseExpiryWarning(w).catch((error) => console.error(`[fgas-expiry] could not release warning for ${w.userId}:`, error));
    }
  });

  return Response.json({ ok: failed === 0, expired: expired.length, warned, failed });
}
