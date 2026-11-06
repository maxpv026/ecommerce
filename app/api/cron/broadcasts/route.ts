import { cronAuthorization } from "@/lib/cronAuth";
import { processAllSending } from "@/lib/broadcast";

/**
 * GET /api/cron/broadcasts — resumes unfinished broadcasts.
 *
 *   Authorization: Bearer {CRON_SECRET}     ← Vercel Cron sends this
 *
 * The admin page drives a broadcast while it is open; this is the safety net
 * for when it isn't (tab closed, laptop asleep). Each run is one time-boxed
 * pass per unfinished broadcast, and the queue state lives in the database,
 * so a run can stop anywhere and the next one carries on without mailing
 * anyone twice.
 *
 * Schedule (vercel.json): daily, because that is all the Hobby plan allows —
 * a more frequent schedule fails the deploy there. On Pro, change it to
 * every 5 minutes ("*\/5 * * * *") and a closed tab costs minutes, not a day.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Stop starting sends well before the 300 s ceiling. */
const BUDGET_MS = 250_000;

export async function GET(request: Request) {
  const auth = cronAuthorization(request);
  if (auth === "unconfigured") return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const results = await processAllSending(Date.now() + BUDGET_MS);
    return Response.json({ ok: true, broadcasts: results });
  } catch (error) {
    console.error("[cron/broadcasts] failed:", error);
    return Response.json({ ok: false, error: "Broadcast pass failed" }, { status: 500 });
  }
}
