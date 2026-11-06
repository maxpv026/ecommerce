import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isNotificationTopic, type NotificationTopic } from "@/lib/notifications";
import { siteOrigin } from "@/lib/siteUrl";

/**
 * Signed one-topic unsubscribe links.
 *
 * The token names a user and a topic and is signed with AUTH_SECRET, so the
 * link works from any mail client without a session, and can't be edited to
 * unsubscribe someone else or another topic. No expiry: an unsubscribe link
 * in a two-year-old email must still work.
 */

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to sign unsubscribe links");
  return value;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`unsubscribe:${payload}`).digest("base64url");

export function unsubscribeToken(userId: string, topic: NotificationTopic): string {
  const payload = Buffer.from(`${userId}:${topic}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string | null): { userId: string; topic: NotificationTopic } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const [userId, topic] = Buffer.from(payload, "base64url").toString().split(":");
  if (!userId || !isNotificationTopic(topic)) return null;
  return { userId, topic };
}

export function unsubscribeUrl(userId: string, topic: NotificationTopic): string {
  return `${siteOrigin()}/api/notifications/unsubscribe?t=${unsubscribeToken(userId, topic)}`;
}
