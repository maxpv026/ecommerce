import "server-only";

import prisma from "@/lib/prisma";
import { sendRegulatoryUpdateEmail } from "@/lib/notificationEmail";
import type { BroadcastStatus } from "@/lib/generated/prisma/enums";

/**
 * Regulatory-update broadcasts, built to survive serverless time limits.
 *
 * The database is the queue. Sending a broadcast writes one Broadcast row and
 * one BroadcastRecipient row per opted-in user (the audience snapshot), and
 * then `processBroadcast` drains it in time-boxed passes:
 *
 *   claim a few rows (FOR UPDATE SKIP LOCKED — two workers can never take
 *   the same row) → send each, throttled → mark SENT / SKIPPED / retry or
 *   FAILED → stop before the deadline and leave the rest PENDING.
 *
 * Any caller can run a pass — the admin page loops them while it is open,
 * the cron route resumes whatever is left — and because every row's state is
 * in the database, an interrupted broadcast resumes exactly where it stopped
 * and nobody is mailed twice. The opt-in is re-checked per send by
 * sendRegulatoryUpdateEmail, so someone who unsubscribes mid-broadcast is
 * skipped.
 */

/** Who gets regulatory updates. Shared by the audience count and the snapshot. */
const AUDIENCE_WHERE = { notifyRegulatoryUpdates: true, email: { not: null } } as const;

/** Rows taken per claim. Small, so an abandoned pass strands little. */
const CLAIM_SIZE = 20;
/** Tries per recipient before FAILED. */
const MAX_ATTEMPTS = 3;
/**
 * A SENDING row older than this is presumed abandoned (its invocation died)
 * and is reclaimed. Comfortably longer than any invocation can live.
 */
const LEASE_MINUTES = 10;
/** A failed send waits this long before its retry, so one blip can't use up every attempt. */
const RETRY_BACKOFF_MINUTES = 2;
/** Consecutive failures that stop a pass: the mail server is down, don't burn retries. */
const CIRCUIT_BREAK_AFTER = 3;
/**
 * Pause between sends. ~2/s by default, which sits under the per-second
 * request limit of most SMTP providers (Resend's included); raise it via env
 * on a plan with headroom, or replace the per-message send with Resend's
 * Batch API (100 per request) behind this same queue.
 */
const sendIntervalMs = () => Math.max(0, Number(process.env.BROADCAST_SEND_INTERVAL_MS ?? 500) || 0);

export interface BroadcastProgress {
  id: string;
  status: BroadcastStatus;
  subject: string;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  /** PENDING + SENDING: still to go. */
  remaining: number;
  createdAt: string;
  /** Why the last pass stopped early, when it did. */
  stoppedReason?: "SMTP_FAILING";
}

export function countRegulatoryAudience(): Promise<number> {
  return prisma.user.count({ where: AUDIENCE_WHERE });
}

/**
 * Creates the broadcast and snapshots its audience in one transaction.
 *
 * Double-submit guard: the same author sending the same subject and content
 * while an earlier copy is still SENDING gets that copy back instead of a
 * second broadcast — the most likely way anyone gets mailed twice is a
 * double click.
 */
export async function createRegulatoryBroadcast(
  authorId: string,
  subject: string,
  content: string
): Promise<{ id: string; reused: boolean }> {
  const existing = await prisma.broadcast.findFirst({
    where: { authorId, subject, content, status: "SENDING" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, reused: true };

  const id = await prisma.$transaction(async (tx) => {
    const broadcast = await tx.broadcast.create({
      data: { topic: "regulatory", subject, content, authorId },
      select: { id: true },
    });
    // Set-based snapshot: one INSERT … SELECT however large the audience,
    // instead of reading every id into memory and writing it back.
    const total = await tx.$executeRaw`
      INSERT INTO "BroadcastRecipient" ("id", "broadcastId", "userId")
      SELECT 'br_' || replace(gen_random_uuid()::text, '-', ''), ${broadcast.id}, u."id"
      FROM "User" u
      WHERE u."notifyRegulatoryUpdates" = true AND u."email" IS NOT NULL`;
    await tx.broadcast.update({ where: { id: broadcast.id }, data: { total } });
    return broadcast.id;
  });
  return { id, reused: false };
}

/** Recomputes the counters from the recipient rows and finishes the broadcast when nothing is left. */
async function refreshProgress(broadcastId: string, stoppedReason?: BroadcastProgress["stoppedReason"]): Promise<BroadcastProgress | null> {
  const groups = await prisma.broadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { _all: true },
  });
  const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  const remaining = count("PENDING") + count("SENDING");

  const current = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
  if (!current) return null;
  const done = current.status === "SENDING" && remaining === 0;

  const row = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      sent: count("SENT"),
      skipped: count("SKIPPED"),
      failed: count("FAILED"),
      ...(done ? { status: "COMPLETED", completedAt: new Date() } : {}),
    },
    select: { id: true, status: true, subject: true, total: true, sent: true, skipped: true, failed: true, createdAt: true },
  });
  return { ...row, remaining, createdAt: row.createdAt.toISOString(), ...(stoppedReason ? { stoppedReason } : {}) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One pass over a broadcast: sends until the queue is empty or `deadline`
 * (epoch ms) is close, whichever comes first. Never throws for a single bad
 * send; returns the progress after the pass.
 */
export async function processBroadcast(broadcastId: string, deadline: number): Promise<BroadcastProgress | null> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { status: true, subject: true, content: true },
  });
  if (!broadcast) return null;
  if (broadcast.status !== "SENDING") return refreshProgress(broadcastId);

  const interval = sendIntervalMs();
  let consecutiveFailures = 0;
  let stoppedReason: BroadcastProgress["stoppedReason"];

  claiming: while (Date.now() < deadline) {
    // Cancellation is honoured between claims, never mid-send.
    const live = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
    if (live?.status !== "SENDING") break;

    const claimed = await prisma.$queryRaw<Array<{ id: string; userId: string; attempts: number }>>`
      UPDATE "BroadcastRecipient"
      SET "status" = 'SENDING'::"RecipientStatus", "claimedAt" = now(), "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "BroadcastRecipient"
        WHERE "broadcastId" = ${broadcastId}
          AND (("status" = 'PENDING'::"RecipientStatus"
                AND ("claimedAt" IS NULL OR "claimedAt" < now() - make_interval(mins => ${RETRY_BACKOFF_MINUTES})))
               OR ("status" = 'SENDING'::"RecipientStatus" AND "claimedAt" < now() - make_interval(mins => ${LEASE_MINUTES})))
        ORDER BY "id"
        LIMIT ${CLAIM_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "userId", "attempts"`;
    if (claimed.length === 0) break;

    for (let i = 0; i < claimed.length; i++) {
      const row = claimed[i];
      // Out of time, or the mail server is failing: hand the untouched rows
      // back (undoing their attempt) for the next pass.
      if (Date.now() >= deadline || stoppedReason) {
        const untouched = claimed.slice(i).map((r) => r.id);
        await prisma.broadcastRecipient.updateMany({
          where: { id: { in: untouched }, status: "SENDING" },
          data: { status: "PENDING", claimedAt: null, attempts: { decrement: 1 } },
        });
        break claiming;
      }

      const started = Date.now();
      const result = await sendRegulatoryUpdateEmail(row.userId, broadcast.subject, broadcast.content);

      if (result.status === "sent") {
        consecutiveFailures = 0;
        await prisma.broadcastRecipient.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date(), lastError: null },
        });
      } else if (result.status === "skipped") {
        consecutiveFailures = 0;
        await prisma.broadcastRecipient.update({ where: { id: row.id }, data: { status: "SKIPPED", lastError: result.reason } });
      } else {
        consecutiveFailures++;
        await prisma.broadcastRecipient.update({
          where: { id: row.id },
          data: {
            status: row.attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            // Kept (not cleared) so the retry waits out RETRY_BACKOFF_MINUTES.
            claimedAt: new Date(),
            lastError: result.error.slice(0, 500),
          },
        });
        if (consecutiveFailures >= CIRCUIT_BREAK_AFTER) stoppedReason = "SMTP_FAILING";
      }

      const wait = interval - (Date.now() - started);
      if (wait > 0 && i < claimed.length - 1) await sleep(Math.min(wait, Math.max(0, deadline - Date.now())));
    }
    if (stoppedReason) break;
  }

  return refreshProgress(broadcastId, stoppedReason);
}

/** Stops a broadcast. Rows not yet sent are marked SKIPPED so the counts add up. */
export async function cancelBroadcast(broadcastId: string): Promise<BroadcastProgress | null> {
  await prisma.broadcast.updateMany({ where: { id: broadcastId, status: "SENDING" }, data: { status: "CANCELLED", completedAt: new Date() } });
  await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: "PENDING" },
    data: { status: "SKIPPED", lastError: "CANCELLED" },
  });
  return refreshProgress(broadcastId);
}

export async function recentBroadcasts(limit = 8): Promise<BroadcastProgress[]> {
  const rows = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, status: true, subject: true, total: true, sent: true, skipped: true, failed: true, createdAt: true },
  });
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    remaining: row.status === "SENDING" ? Math.max(0, row.total - row.sent - row.skipped - row.failed) : 0,
  }));
}

/** For the cron route: one pass over every unfinished broadcast, oldest first. */
export async function processAllSending(deadline: number): Promise<BroadcastProgress[]> {
  const sending = await prisma.broadcast.findMany({
    where: { status: "SENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const results: BroadcastProgress[] = [];
  for (const { id } of sending) {
    if (Date.now() >= deadline) break;
    const progress = await processBroadcast(id, deadline);
    if (progress) results.push(progress);
  }
  return results;
}
