import { cronAuthorization } from "@/lib/cronAuth";
import { inChunks } from "@/lib/concurrency";
import { claimCartReminder, releaseCartReminder, selectDueCarts, sendCartReminderEmail } from "@/lib/cartReminder";

/**
 * GET /api/cron/abandoned-cart — hourly (vercel.json).
 *
 * Emails each signed-in buyer whose saved basket has sat unchanged for 4 h
 * without becoming an order (lib/cartReminder), once per basket.
 *
 *   Authorization: Bearer {CRON_SECRET}     ← Vercel Cron sends this
 *
 *   ?dryRun=1   report who would be emailed; claim nothing, send nothing
 *   ?limit=N    cap sends this run (default 50)
 *   ?userId=ID  only this buyer — re-run one account, or test without
 *               touching anyone else's basket
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_SEND_LIMIT = 50;

export async function GET(request: Request) {
  const authz = cronAuthorization(request);
  if (authz === "unconfigured") return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (authz === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_SEND_LIMIT), 200);
  const onlyUser = url.searchParams.get("userId")?.trim() || null;
  const startedAt = Date.now();

  try {
    const { due, skipped } = await selectDueCarts({ userId: onlyUser });
    const batch = due.slice(0, limit);
    if (dryRun) {
      return Response.json({ ok: true, dryRun: true, ms: Date.now() - startedAt, due: due.length, wouldSend: batch.length, skipped });
    }

    let sent = 0;
    let failed = 0;
    let raced = 0;
    let skippedAtSend = 0;
    await inChunks(batch, 5, async (cart) => {
      const claimedAt = new Date();
      try {
        if (!(await claimCartReminder(cart, claimedAt))) {
          raced += 1;
          return;
        }
        const result = await sendCartReminderEmail(cart.userId);
        if (result.status === "sent") sent += 1;
        else {
          // Nothing went out — give the claim back so a later run can try
          // (e.g. once the stock is back, or the mail server recovers).
          await releaseCartReminder(cart, claimedAt);
          if (result.status === "failed") failed += 1;
          else skippedAtSend += 1;
        }
      } catch (error) {
        console.error(`[cart-reminder] run failed for user ${cart.userId}:`, error);
        await releaseCartReminder(cart, claimedAt).catch(() => undefined);
        failed += 1;
      }
    });

    return Response.json({ ok: failed === 0, ms: Date.now() - startedAt, due: due.length, sent, failed, raced, skippedAtSend, deferred: Math.max(0, due.length - batch.length), skipped });
  } catch (error) {
    console.error("[cart-reminder] run failed:", error);
    return Response.json({ ok: false, error: "Abandoned-cart run failed; see the server log." }, { status: 500 });
  }
}
