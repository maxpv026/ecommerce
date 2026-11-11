import "server-only";

import prisma from "@/lib/prisma";

/**
 * Support chat retention: a conversation is permanently deleted one hour
 * after its last activity. No exceptions — an ESCALATED_TO_HUMAN chat the
 * team hasn't answered is deleted on the same clock.
 *
 * "Activity" is ChatSession.updatedAt, which every write touches: each
 * message (lib/chatSession saveMessage), the handoff, a team reply, resolve.
 * Reading a transcript is not activity.
 *
 * Enforced twice, so the hour is exact rather than "an hour, give or take
 * the cron":
 *   - on read: every lookup (the widget, its poll, the admin inbox and
 *     thread, the admin actions) treats an hour-old session as gone, and
 *     deletes it on the spot;
 *   - by a sweep after every chat request (sweepExpiredChats), and by the
 *     hourly cron (app/api/cron/chat-cleanup, "0 * * * *" in vercel.json)
 *     for the ones nobody opened.
 * ChatMessage rows go with their session (onDelete: Cascade).
 */

export const CHAT_RETENTION_MS = 60 * 60 * 1000;

/** Sessions last active before this are expired. */
export const chatExpiryCutoff = (now = Date.now()) => new Date(now - CHAT_RETENTION_MS);

export const isChatExpired = (updatedAt: Date, now = Date.now()) => updatedAt.getTime() <= now - CHAT_RETENTION_MS;

/** When a session last active at `updatedAt` will be deleted. */
export const chatExpiresAt = (updatedAt: Date) => new Date(updatedAt.getTime() + CHAT_RETENTION_MS);

/** Deletes every expired session (and, by cascade, its messages). Returns how many. */
export async function purgeExpiredChats(now = Date.now()): Promise<number> {
  const { count } = await prisma.chatSession.deleteMany({ where: { updatedAt: { lte: chatExpiryCutoff(now) } } });
  return count;
}

/**
 * The sweep, run after chat traffic (inside next/server's after(), so no
 * request waits on it), so an expired chat is gone by the next chat request
 * even between the hourly cron runs. Never throws.
 */
export async function sweepExpiredChats(): Promise<void> {
  try {
    await purgeExpiredChats();
  } catch (error) {
    console.error("[chat-retention] sweep failed:", error);
  }
}

/**
 * Deletes one session if — and only if — it has expired. Conditional on
 * updatedAt in the same statement, so a message that lands a moment before
 * can't be deleted out from under it.
 */
export async function purgeIfExpired(sessionId: string, now = Date.now()): Promise<boolean> {
  const { count } = await prisma.chatSession.deleteMany({ where: { id: sessionId, updatedAt: { lte: chatExpiryCutoff(now) } } });
  return count > 0;
}
