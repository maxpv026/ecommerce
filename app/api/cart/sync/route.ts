import { z } from "zod";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { MAX_SAVED_LINES, readSavedCartLines, saveCartSnapshot } from "@/lib/savedCart";

/**
 * /api/cart/sync — the server copy of a signed-in buyer's basket.
 *
 *   POST { items: [{ sku, qty }] }  store it (empty clears it); debounced by
 *                                   components/cart/CartServerSync
 *   GET                             the saved basket as cart lines at
 *                                   today's catalogue values — used when a
 *                                   reminder link opens on another device
 *
 * Signed-in only; a guest's basket never leaves their browser. Only SKUs and
 * quantities are accepted: whatever price the browser holds is ignored.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  items: z
    .array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().int().min(1).max(99) }))
    .max(MAX_SAVED_LINES),
});

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function caller() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await caller();
  if (!userId) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
  // A debounced cart edit is at most a few a minute; this only stops a loop.
  if (!checkRateLimit(`cart-sync:${userId}`, { limit: 40, windowMs: 60_000 }).success) return json({ ok: false, error: "RATE_LIMITED" }, 429);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "INVALID_INPUT" }, 400);

  try {
    const outcome = await saveCartSnapshot(userId, parsed.data.items);
    return json({ ok: true, outcome });
  } catch (error) {
    console.error(`[cart-sync] save failed for user ${userId}:`, error);
    return json({ ok: false, error: "FAILED" }, 500);
  }
}

export async function GET() {
  const userId = await caller();
  if (!userId) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
  try {
    return json({ ok: true, lines: await readSavedCartLines(userId) });
  } catch (error) {
    console.error(`[cart-sync] read failed for user ${userId}:`, error);
    return json({ ok: false, error: "FAILED" }, 500);
  }
}
