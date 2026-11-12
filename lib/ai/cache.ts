import "server-only";

import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logAiUsage } from "@/lib/ai/budget";

/**
 * Content-hash cache for model responses: identical request → one model call,
 * then 0 tokens until it expires.
 *
 *   L1  in-memory map per server instance (presets clicked repeatedly hit here)
 *   L2  Postgres table AiResponseCache (shared by every serverless instance)
 *
 * The key is SHA-256(feature, version, normalised input); the input itself is
 * never stored, only the model's structured answer. Bump a feature's version
 * when its prompt or schema changes, so stale answers are never served.
 * Every failure of the cache degrades to calling the model — the cache can
 * cost a call, never break a feature.
 */

const L1 = new Map<string, { value: unknown; expires: number }>();
const L1_MAX = 500;

/** Whitespace and Unicode form only: case and wording are kept, because the model copies text as written. */
export const normaliseInput = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function cacheKey(feature: string, version: number, parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify([feature, version, ...parts])).digest("hex");
}

function remember(key: string, value: unknown, expires: number) {
  if (L1.size >= L1_MAX) L1.delete(L1.keys().next().value!);
  L1.set(key, { value, expires });
}

export async function withAiCache<T>(
  options: { feature: string; version: number; parts: unknown[]; ttlSeconds: number },
  compute: () => Promise<{ value: T; cacheable: boolean }>
): Promise<{ value: T; hit: boolean }> {
  const key = cacheKey(options.feature, options.version, options.parts);
  const now = Date.now();

  const mem = L1.get(key);
  if (mem && mem.expires > now) {
    logAiUsage({ feature: options.feature, source: "cache" });
    return { value: mem.value as T, hit: true };
  }

  try {
    const row = await prisma.aiResponseCache.findUnique({ where: { key }, select: { value: true, expiresAt: true } });
    if (row && row.expiresAt.getTime() > now) {
      remember(key, row.value, row.expiresAt.getTime());
      void prisma.aiResponseCache.update({ where: { key }, data: { hits: { increment: 1 } } }).catch(() => undefined);
      logAiUsage({ feature: options.feature, source: "cache" });
      return { value: row.value as T, hit: true };
    }
  } catch (error) {
    console.error(`[ai-cache] read failed for ${options.feature}:`, error);
  }

  const fresh = await compute();
  if (fresh.cacheable) {
    const expiresAt = new Date(now + options.ttlSeconds * 1000);
    remember(key, fresh.value, expiresAt.getTime());
    try {
      const value = fresh.value as unknown as Prisma.InputJsonValue;
      await prisma.aiResponseCache.upsert({
        where: { key },
        create: { key, feature: options.feature, value, expiresAt },
        update: { value, expiresAt, hits: 0 },
      });
      // Sweep expired rows now and then, so the table stays small without a cron.
      if (Math.random() < 0.02) void prisma.aiResponseCache.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
    } catch (error) {
      console.error(`[ai-cache] write failed for ${options.feature}:`, error);
    }
  }
  return { value: fresh.value, hit: false };
}
