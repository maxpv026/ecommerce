import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import prisma from "@/lib/prisma";

/**
 * Revoking sessions when a password changes, or when the buyer signs out
 * of all other devices (User.sessionsRevokedAt).
 *
 * Sessions are stateless JWTs, so there is no session row to delete. Instead
 * every token carries `authTime` — when its holder last proved who they are
 * (auth.ts sets it at sign-in) — and a token whose authTime predates the
 * account's `passwordChangedAt` is refused: auth.ts's jwt callback returns
 * null, which makes Auth.js clear the cookie and treat the caller as signed
 * out. `iat` can't serve: Auth.js re-signs the token, with a fresh iat, every
 * time it refreshes the session cookie.
 *
 * The check runs wherever the full auth() runs — route handlers, Server
 * Actions, and server components that already call auth() (which are
 * dynamic for that reason). Statically rendered pages never call auth(), so
 * nothing about their rendering changes. The Edge proxy decodes the token
 * without a database and so can't see a revocation, but it only gates; every
 * page and action behind it calls auth() itself.
 *
 * The device that changed the password stays signed in: changePassword
 * re-stamps its own session through `unstable_update`, carrying a stamp
 * (below) that only the server can mint.
 */

/** How long a re-stamp is honoured after the change it belongs to. */
const STAMP_TTL_MS = 60_000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to sign session re-stamps");
  return value;
}

const mac = (userId: string, changedAtMs: number) =>
  createHmac("sha256", secret()).update(`session-restamp:${userId}:${changedAtMs}`).digest("base64url");

/**
 * Proof that the server just changed this user's password in this request.
 * Passed to unstable_update, which anyone can also reach as POST
 * /api/auth/session with arbitrary data — hence the MAC: a stolen, revoked
 * token can't re-stamp itself.
 */
export function mintRestamp(userId: string, changedAt: Date): string {
  const ms = changedAt.getTime();
  return `${ms}.${mac(userId, ms)}`;
}

/** The passwordChangedAt the stamp vouches for, or null if it isn't genuine and fresh. */
export function readRestamp(stamp: unknown, userId: string): number | null {
  if (typeof stamp !== "string") return null;
  const [rawMs, given] = stamp.split(".");
  const ms = Number(rawMs);
  if (!Number.isSafeInteger(ms) || !given) return null;
  if (Date.now() - ms > STAMP_TTL_MS || ms > Date.now() + 5_000) return null;
  const a = Buffer.from(mac(userId, ms));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b) ? ms : null;
}

/**
 * The row facts a session depends on. Cached per request (React cache), so
 * a render that calls auth() several times reads the row once.
 */
export const sessionAnchor = cache(async (userId: string, sid?: string | null) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordChangedAt: true,
      sessionsRevokedAt: true,
      // This device's row (lib/deviceSessions) — same query, no extra round trip.
      deviceSessions: sid ? { where: { sessionTokenId: sid }, select: { revokedAt: true, lastActiveAt: true }, take: 1 } : false,
    },
  })
);

type Anchor = { passwordChangedAt: Date | null; sessionsRevokedAt?: Date | null };

/**
 * The moment before which every session is void: the later of the last
 * password change and the last "sign out of all other devices". Null when
 * neither ever happened. The re-stamp of the device that triggered either
 * one vouches for exactly this value.
 */
export function revokedBefore(anchor: Anchor | null | undefined): number | null {
  const times = [anchor?.passwordChangedAt?.getTime(), anchor?.sessionsRevokedAt?.getTime()].filter((t): t is number => typeof t === "number");
  return times.length ? Math.max(...times) : null;
}

/**
 * Is a token signed in at `authTime` (epoch ms) still valid for this
 * account? False when the account is gone, or its password changed or its
 * other sessions were revoked after that.
 */
export function sessionStillValid(anchor: Anchor | null, authTime: number): boolean {
  if (!anchor) return false;
  const cutoff = revokedBefore(anchor);
  return cutoff === null || cutoff <= authTime;
}
