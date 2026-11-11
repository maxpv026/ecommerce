import prisma from "@/lib/prisma";
import { cronAuthorization } from "@/lib/cronAuth";
import { inChunks } from "@/lib/concurrency";

/** Reminder emails in flight at once. */
const SEND_CONCURRENCY = 5;
import { sendReplenishmentEmail } from "@/lib/notificationEmail";
import { filterPurchasable, getRestockPredictions, selectDueRestocks, type RestockPrediction } from "@/lib/smartRestock";

/**
 * GET /api/cron/smart-restock — predictive replenishment reminders.
 *
 * Reads each customer's purchase cadence per product (lib/smartRestock),
 * finds the ones whose usual reorder date is within the next 14 days (or
 * just past), and emails each one reminder per purchase cycle, with today's
 * price and a one-click reorder link.
 *
 *   Authorization: Bearer {CRON_SECRET}     ← Vercel Cron sends this
 *
 * Schedule lives in vercel.json (daily). Running it more often is harmless:
 * a cycle that has been reminded about is never reminded about again.
 *
 *   ?dryRun=1   predict and report, write nothing, send nothing
 *   ?limit=N    cap sends this run (default 25)
 *   ?userId=ID  only this customer — re-run one account, or test without
 *               touching anyone else's reminders
 *
 * Responses
 *   200  { ok: true, ... }               ran (possibly with nothing to do)
 *   401  { ok: false, error }            bad or missing bearer token
 *   503  { ok: false, error }            CRON_SECRET unset
 *
 * The email used to carry an AI-written paragraph. It is now a fixed,
 * factual message built from the customer's own figures — nothing in it can
 * be invented, and the run no longer needs OPENAI_API_KEY.
 */

// generateText, Prisma and Nodemailer are all Node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold run touches every customer's history; the default 10s is not enough.
export const maxDuration = 300;

/** A hard ceiling on one run, so a bug cannot mail the whole customer base. */
const DEFAULT_SEND_LIMIT = 25;

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status });

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

/**
 * Takes ownership of this cycle's reminder before anything is sent.
 *
 * New cycle: insert the PENDING row; the unique (user, product, cycleStart)
 * makes a concurrent run's insert fail, so only one run sends. Retry of a
 * failed send: an optimistic update on the row's updatedAt, for the same
 * reason. Returns the row id, or null when another run owns it.
 */
async function claim(p: RestockPrediction): Promise<string | null> {
  if (p.retry) {
    const { count } = await prisma.restockAlert.updateMany({
      where: { id: p.retry.alertId, status: "PENDING", updatedAt: p.retry.updatedAt },
      data: { predictedDate: p.predictedDate, recommendedQty: p.recommendedQty },
    });
    return count === 1 ? p.retry.alertId : null;
  }
  try {
    const row = await prisma.restockAlert.create({
      data: {
        userId: p.userId,
        productId: p.productId,
        cycleStart: p.lastOrderedAt,
        recommendedQty: p.recommendedQty,
        predictedDate: p.predictedDate,
        status: "PENDING",
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export async function GET(request: Request) {
  const auth = cronAuthorization(request);
  if (auth === "unconfigured") return json({ ok: false, error: "CRON_SECRET is not configured" }, 503);
  if (auth === "denied") return json({ ok: false, error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_SEND_LIMIT),
    200
  );

  const onlyUser = url.searchParams.get("userId")?.trim() || null;

  const startedAt = Date.now();

  try {
    const predictions = await getRestockPredictions();
    const { due, skipped } = await selectDueRestocks(onlyUser ? predictions.filter((p) => p.userId === onlyUser) : predictions);
    const { sellable, unavailable } = await filterPurchasable(due);
    const batch = sellable.slice(0, limit);

    if (dryRun) {
      return json(
        {
          ok: true,
          dryRun: true,
          ms: Date.now() - startedAt,
          predictions: predictions.length,
          due: due.length,
          wouldSend: batch.length,
          skipped: { ...skipped, unavailable },
          sample: batch.slice(0, 5).map((p) => ({
            company: p.companyName ?? p.userName,
            product: p.productSku,
            everyDays: p.averageDays,
            qty: p.recommendedQty,
            daysUntil: p.daysUntilPredicted,
          })),
        },
        200
      );
    }

    let sent = 0;
    let failed = 0;
    let raced = 0;
    let skippedAtSend = 0;

    // Five at a time (lib/concurrency): a serial loop over a large batch can
    // outlast the function's time limit. Each reminder is isolated — its own
    // claim, its own try/catch — so one bad address never stops the others.
    await inChunks(batch, SEND_CONCURRENCY, async (prediction) => {
      try {
        const alertId = await claim(prediction);
        if (!alertId) {
          raced += 1;
          return;
        }

        const result = await sendReplenishmentEmail({
          userId: prediction.userId,
          productId: prediction.productId,
          recommendedQty: prediction.recommendedQty,
          averageDays: prediction.averageDays,
          predictedDate: prediction.predictedDate,
        });

        if (result.status === "sent") {
          await prisma.restockAlert.updateMany({ where: { id: alertId, status: "PENDING" }, data: { status: "NOTIFIED" } });
          sent += 1;
        } else if (result.status === "skipped") {
          // Opted out a moment ago, or the product just became unavailable:
          // nothing was sent, so no alert should claim otherwise. Removing
          // the row also leaves the cycle open for a later run.
          await prisma.restockAlert.deleteMany({ where: { id: alertId, status: "PENDING" } });
          skippedAtSend += 1;
        } else {
          // Left PENDING: it still shows on the dashboard, and a later run
          // retries this same row (selectDueRestocks → retry).
          failed += 1;
        }
      } catch (error) {
        console.error(`[SMART-RESTOCK] failed for ${prediction.productSku}:`, error);
        failed += 1;
      }
    });

    return json(
      {
        ok: failed === 0,
        ms: Date.now() - startedAt,
        predictions: predictions.length,
        due: due.length,
        sent,
        failed,
        raced,
        skippedAtSend,
        deferred: Math.max(0, sellable.length - batch.length),
        skipped: { ...skipped, unavailable },
      },
      200
    );
  } catch (error) {
    console.error("[SMART-RESTOCK] run failed:", error);
    return json({ ok: false, error: "Smart Restock run failed; see the server log." }, 500);
  }
}
