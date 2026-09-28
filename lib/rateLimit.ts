/**
 * Application-layer rate limiting for the Edge middleware.
 *
 * ────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE TRUSTING IT
 *
 * This is an in-memory counter, and on a serverless platform that means it
 * is best-effort only:
 *
 *   • Per isolate. Vercel runs many middleware instances; each keeps its own
 *     Map. A limit of 10 with N warm isolates is really 10 × N.
 *   • Per region. A globally distributed attacker gets a fresh budget in
 *     every region they reach.
 *   • Lost on cold start. Scale-to-zero wipes the counters.
 *   • Memory-bound. The sweep below stops unbounded growth, but a large
 *     attack still inflates the map between sweeps.
 *
 * It therefore raises the cost of casual scripted abuse — a single machine
 * hammering /api/auth — and does nothing against a distributed attack.
 *
 * For a real limit, move the counter somewhere shared. With @upstash/redis
 * (Edge-compatible over HTTP, unlike node-redis) the swap is small:
 *
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *   const limiter = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(10, "60 s"),
 *     analytics: true,
 *   });
 *   const { success, reset } = await limiter.limit(`auth:${ip}`);
 *
 * `checkRateLimit` already returns the shape that call would produce, so
 * only this file changes.
 *
 * Note this protects against volume, not correctness. The real defences for
 * guessing live next to the thing being guessed: TOTP has its own five-try
 * lockout in the database (lib/twoFactor.ts), which survives restarts and
 * is not per-isolate.
 * ────────────────────────────────────────────────────────────────────────
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitVerdict {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the current window ends. */
  reset: number;
}

/**
 * Which prefixes are limited, and how hard.
 *
 * ORDER MATTERS: ruleFor() takes the first prefix that matches, so the
 * narrow paths must precede the broad ones. Putting "/api/auth" first would
 * shadow both rules below it.
 */
export const RATE_LIMIT_RULES: Array<{ prefix: string; rule: RateLimitRule }> = [
  // Credential submission — sign-in, OTP and the TOTP/recovery-code check.
  // This is the brute-force surface, and ten a minute is generous for a
  // person and hostile to a script.
  { prefix: "/api/auth/callback", rule: { limit: 10, windowMs: 60_000 } },
  { prefix: "/api/auth/signin", rule: { limit: 10, windowMs: 60_000 } },
  // Everything else under /api/auth is read-only bookkeeping — /session,
  // /csrf, /providers — and SessionProvider requests /session on EVERY page
  // load. A tight cap here does not stop an attack; it signs legitimate
  // customers out mid-browse after a handful of page views. Worse, this is a
  // B2B store: a whole customer office arrives on one NAT address and shares
  // the bucket. So this ceiling only exists to stop outright flooding, and is
  // deliberately far above real use.
  { prefix: "/api/auth", rule: { limit: 120, windowMs: 60_000 } },
  // Unauthenticated and it sends email, so it is worth a tighter cap.
  { prefix: "/api/waitlist", rule: { limit: 10, windowMs: 60_000 } },
  // Uploads a file and spends an OpenAI call per request.
  { prefix: "/api/verify-fgas", rule: { limit: 6, windowMs: 60_000 } },
];

export function ruleFor(pathname: string): { prefix: string; rule: RateLimitRule } | null {
  return RATE_LIMIT_RULES.find((entry) => pathname.startsWith(entry.prefix)) ?? null;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
/** Ceiling on tracked keys, so a flood of unique IPs cannot exhaust memory. */
const MAX_KEYS = 10_000;
let lastSweep = 0;

function sweep(now: number) {
  // Amortised: at most once a minute, and only while traffic is flowing.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * The client address, as far as it can be known.
 *
 * `x-forwarded-for` is caller-controlled unless a trusted proxy overwrites
 * it. On Vercel it does, so the first entry is real; behind anything else,
 * treat this as a hint. That is another reason this limiter is a speed bump
 * rather than a control.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitVerdict {
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    // Refuse to track anything new once full rather than evicting at random,
    // which would let an attacker flush a legitimate caller's counter.
    if (!existing && buckets.size >= MAX_KEYS) {
      return { success: true, limit: rule.limit, remaining: rule.limit, reset: now + rule.windowMs };
    }
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { success: true, limit: rule.limit, remaining: rule.limit - 1, reset: now + rule.windowMs };
  }

  existing.count += 1;
  const remaining = Math.max(0, rule.limit - existing.count);
  return {
    success: existing.count <= rule.limit,
    limit: rule.limit,
    remaining,
    reset: existing.resetAt,
  };
}

/** Test seam — the Map is module state and would otherwise leak between cases. */
export function __resetRateLimitForTests() {
  buckets.clear();
  lastSweep = 0;
}
