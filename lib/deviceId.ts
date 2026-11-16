/**
 * The browser's device id: one random, long-lived, httpOnly cookie that
 * outlives sign-ins, so "Active sessions" can recognise the same browser
 * signing in again (lib/deviceSessions → UserSession.deviceKey) instead of
 * listing it once per sign-in.
 *
 * Edge-safe on purpose (proxy.ts sets it): Web Crypto only, no node:crypto.
 * It identifies a browser profile, nothing more — it carries no account and
 * grants nothing; the database stores only an HMAC of it.
 */

export const DEVICE_COOKIE = "me_did";

/** 400 days: the most any browser keeps a cookie today. */
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

const VALID = /^[A-Za-z0-9_-]{16,64}$/;

export const isValidDeviceId = (value: string | null | undefined): value is string => typeof value === "string" && VALID.test(value);

export const newDeviceId = (): string => crypto.randomUUID().replace(/-/g, "");

export const deviceCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: DEVICE_COOKIE_MAX_AGE }) as const;
