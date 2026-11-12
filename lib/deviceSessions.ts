import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { countryFromGeoHeader } from "@/lib/country";
import { refreshUserCountry } from "@/lib/userCountry";

/**
 * Real signed-in devices (UserSession).
 *
 * Every session JWT carries a `sid`. auth.ts registers a row for it at
 * sign-in — and on first sight of a token minted before this table existed —
 * and refuses any token whose row has been revoked. The device label is
 * parsed from the User-Agent of the request that registered it; the place
 * from Vercel's geo headers when present. Nothing here is guessed: an
 * unknown browser is stored as unknown.
 */

/** How often lastActiveAt is written for an active session (not every request). */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
/** Auth.js's default JWT session lifetime. */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ParsedAgent {
  browser: string | null;
  os: string | null;
  deviceType: "desktop" | "mobile" | "tablet";
  deviceName: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedAgent {
  const s = ua ?? "";
  let os: string | null = null;
  let deviceType: ParsedAgent["deviceType"] = "desktop";

  if (/iPhone|iPod/.test(s)) {
    os = "iOS";
    deviceType = "mobile";
  } else if (/iPad/.test(s) || (/Macintosh/.test(s) && /Mobile\//.test(s))) {
    os = "iPadOS";
    deviceType = "tablet";
  } else if (/Android/.test(s)) {
    os = "Android";
    deviceType = /Mobile/.test(s) ? "mobile" : "tablet";
  } else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Linux/.test(s)) os = "Linux";

  // Order matters: Edge, Opera and Samsung all also say "Chrome", and
  // Chrome also says "Safari".
  const browser = /Edg(e|A|iOS)?\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS|Chromium/.test(s)
            ? "Chrome"
            : /Safari\//.test(s) && /Version\//.test(s)
              ? "Safari"
              : null;

  const deviceName = browser && os ? `${browser} · ${os}` : (browser ?? os ?? "Unknown device");
  return { browser, os, deviceType, deviceName };
}

/**
 * The sid of a token minted before sids existed. Derived, not random, from
 * what such a token already holds unchanged across refreshes — so the same
 * old cookie maps to the same row on every request, even from a server
 * component that cannot write the cookie back.
 */
export function legacySessionId(userId: string, authTime: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return `legacy_${createHmac("sha256", secret).update(`sid:${userId}:${authTime}`).digest("base64url").slice(0, 32)}`;
}

/**
 * UA, IP and place of the current request — empty outside a request.
 *
 * The place comes from the edge: Vercel's x-vercel-ip-country/-city, or
 * Cloudflare's cf-ipcountry when the app runs behind Cloudflare instead. On
 * Vercel the cf- header is ignored — nothing in front of the app sets it
 * there, so it could only have come from the client.
 */
async function requestContext() {
  try {
    const h = await headers();
    const vercelCountry = countryFromGeoHeader(h.get("x-vercel-ip-country"));
    const country = vercelCountry ?? (process.env.VERCEL ? null : countryFromGeoHeader(h.get("cf-ipcountry")));
    const city = vercelCountry ? h.get("x-vercel-ip-city") : null;
    return {
      ua: h.get("user-agent"),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      city: city ? safeDecode(city).slice(0, 80) : null,
      country,
    };
  } catch {
    return { ua: null, ip: null, city: null, country: null };
  }
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Creates the row for a session if it has none (idempotent on the sid). */
export async function registerSession(userId: string, sessionTokenId: string): Promise<void> {
  const ctx = await requestContext();
  const agent = parseUserAgent(ctx.ua);
  // A page's first parallel requests (document, RSC, /api/auth/session) can
  // all find no row and race to create it; the loser's unique violation
  // means the row exists, which is all this wants.
  await prisma.userSession
    .upsert({
      where: { sessionTokenId },
      create: {
        userId,
        sessionTokenId,
        deviceName: agent.deviceName,
        browser: agent.browser,
        os: agent.os,
        deviceType: agent.deviceType,
        ipAddress: ctx.ip,
        city: ctx.city,
        country: ctx.country,
      },
      update: {},
    })
    .catch((error: unknown) => {
      if ((error as { code?: string }).code !== "P2002") throw error;
    });
  // A sign-in is the freshest location there is (User.countryCode).
  await refreshUserCountry(userId).catch((error) => console.error("deviceSessions: country refresh failed:", error));
}

/**
 * Marks a session as seen now — at most every few minutes per session, or
 * at once when the request comes from a different place than the row says,
 * so the account's country follows the user (User.countryCode).
 */
export async function touchSession(
  userId: string,
  sessionTokenId: string,
  device: { lastActiveAt: Date; country: string | null; city: string | null }
): Promise<void> {
  const due = Date.now() - device.lastActiveAt.getTime() >= TOUCH_INTERVAL_MS;
  const ctx = await requestContext();
  const moved = ctx.country !== null && (ctx.country !== device.country || ctx.city !== device.city);
  if (!due && !moved) return;
  await prisma.userSession.updateMany({
    where: { sessionTokenId, revokedAt: null },
    data: { lastActiveAt: new Date(), ...(ctx.ip ? { ipAddress: ctx.ip } : {}), ...(ctx.country ? { country: ctx.country, city: ctx.city } : {}) },
  });
  if (moved) await refreshUserCountry(userId).catch((error) => console.error("deviceSessions: country refresh failed:", error));
}

export interface DeviceSessionView {
  id: string;
  deviceName: string;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

/** The account's live sessions, the current one first. */
export async function listDeviceSessions(userId: string, currentSid: string | null): Promise<DeviceSessionView[]> {
  const rows = await prisma.userSession.findMany({
    // A JWT lives 30 days (Auth.js default); a row unseen for longer is a
    // cookie that no longer works, not a signed-in device.
    where: { userId, revokedAt: null, lastActiveAt: { gte: new Date(Date.now() - SESSION_MAX_AGE_MS) } },
    orderBy: { lastActiveAt: "desc" },
    take: 50,
  });
  return rows
    .map((r) => ({
      id: r.id,
      deviceName: r.deviceName,
      browser: r.browser,
      os: r.os,
      deviceType: r.deviceType,
      ipAddress: r.ipAddress,
      city: r.city,
      country: r.country,
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: r.lastActiveAt.toISOString(),
      current: r.sessionTokenId === currentSid,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}
