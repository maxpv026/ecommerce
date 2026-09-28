import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { applyInventoryUpdate, type InventoryUpdateResult } from "@/lib/inventory";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { notifyBackInStock, type StockNotifyResult } from "@/lib/stockNotify";

/**
 * CRM → storefront inventory webhook.
 *
 * The CRM owns product availability. Whenever a stock level changes there,
 * it POSTs the new absolute quantity here and the storefront mirrors it:
 * `stockQuantity` is set outright, `inStock` flips to false at 0 and back
 * to true above 0, and the catalog badge (in / low / out) follows.
 *
 * ── How the CRM must call this endpoint ──────────────────────────────────
 *
 *   POST {SITE_URL}/api/webhooks/crm-inventory
 *   Authorization: Bearer {CRM_WEBHOOK_SECRET}     ← same value as the env var
 *   Content-Type: application/json
 *
 *   One product:
 *     { "sku": "R32", "quantity": 42 }
 *
 *   Several products in one call (max 100):
 *     { "items": [
 *         { "sku": "R32",        "quantity": 42 },
 *         { "sku": "R410A",      "quantity": 0 },
 *         { "name": "R-134a",    "quantity": 7,  "pricePerKg": 26.5 },
 *         { "externalId": "crm-8813", "pricePerKg": 31.0, "weightKg": 12 }
 *     ] }
 *
 *   Identify each product by ONE of:
 *     - "sku"        storefront SKU, case-insensitive ("r134a" matches "R134A") — preferred
 *     - "externalId" the CRM's own product id, if it has been stored on Product.externalId
 *     - "name"       exact product name, case-insensitive ("R-134a")
 *   Then send at least one field to change:
 *     - "quantity"   ABSOLUTE on-hand count (integer ≥ 0), never a delta
 *     - "pricePerKg" gas price per kilogram in EUR (≥ 0) — the storefront
 *                    prices one cylinder as pricePerKg × weightKg
 *     - "weightKg"   net gas weight per cylinder in kg (> 0)
 *   The €15 cylinder deposit is not part of this feed; it applies per
 *   physical cylinder regardless of weight. Sending the same payload twice
 *   is safe (idempotent).
 *
 *   Example:
 *     curl -X POST https://shop.example.com/api/webhooks/crm-inventory \
 *       -H "Authorization: Bearer $CRM_WEBHOOK_SECRET" \
 *       -H "Content-Type: application/json" \
 *       -d '{"items":[{"sku":"R32","quantity":42,"pricePerKg":25},{"sku":"R404A","quantity":0}]}'
 *
 * ── Responses ────────────────────────────────────────────────────────────
 *   200  every item updated        { ok: true,  updated: n, results: [...] }
 *   207  some items not found      { ok: false, updated: n, results: [...] }
 *   404  no item matched a product { ok: false, updated: 0, results: [...] }
 *   400  malformed JSON / payload  { ok: false, error, issues? }
 *   401  missing or wrong secret   { ok: false, error }
 *   503  CRM_WEBHOOK_SECRET unset  { ok: false, error }
 *   Each entry in `results` is either
 *     { status: "updated", id, sku, name, weight, previousQuantity, previousInStock,
 *       stockQuantity, inStock, cameBackInStock, pricePerKg, weightKg, cylinderPrice }
 *   or
 *     { status: "not_found", identifier }
 *
 * ── Back-in-stock waitlist ───────────────────────────────────────────────
 *   Whenever a push takes a product from unavailable (quantity 0 / inStock
 *   false) to purchasable, everyone on that product's StockSubscription
 *   waitlist is emailed once and marked notified, so later restocks don't
 *   mail them again. The dispatch is best-effort and never fails the push:
 *   the inventory update has already committed by then. A `notifications`
 *   array is added to the response for the pushes that triggered one:
 *     { sku, sent, failed, remaining }
 */

// Inventory writes are quick; the mail fan-out is what needs the headroom.
export const maxDuration = 60;

const MAX_ITEMS = 100;

const InventoryItem = z
  .object({
    sku: z.string().trim().min(1).max(64).optional(),
    externalId: z.string().trim().min(1).max(128).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().int().min(0).max(1_000_000).optional(),
    pricePerKg: z.number().min(0).max(100_000).optional(),
    weightKg: z.number().positive().max(10_000).optional(),
  })
  .refine((item) => item.sku || item.externalId || item.name, {
    message: "Each item needs a sku, externalId or name",
  })
  .refine((item) => item.quantity !== undefined || item.pricePerKg !== undefined || item.weightKg !== undefined, {
    message: "Each item needs at least one of quantity, pricePerKg or weightKg",
  });

const Payload = z.union([InventoryItem, z.object({ items: z.array(InventoryItem).min(1).max(MAX_ITEMS) })]);

type ErrorBody = { ok: false; error: string; issues?: unknown };
type SuccessBody = {
  ok: boolean;
  updated: number;
  results: InventoryUpdateResult[];
  /** Present only when a push brought something back into stock. */
  notifications?: StockNotifyResult[];
};

const json = (body: ErrorBody | SuccessBody, status: number) => Response.json(body, { status });

/** Constant-time comparison; hashing first removes the length side channel. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function isAuthorized(request: Request): "ok" | "unconfigured" | "denied" {
  const expected = process.env.CRM_WEBHOOK_SECRET?.trim();
  if (!expected) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const provided = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return provided && secretMatches(provided, expected) ? "ok" : "denied";
}

export async function POST(request: Request) {
  const auth = isAuthorized(request);
  // Fail closed: an unset secret must never turn into an open endpoint.
  if (auth === "unconfigured") return json({ ok: false, error: "CRM_WEBHOOK_SECRET is not configured" }, 503);
  if (auth === "denied") return json({ ok: false, error: "Unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Body must be valid JSON" }, 400);
  }

  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid payload", issues: parsed.error.issues }, 400);
  }
  const items = "items" in parsed.data ? parsed.data.items : [parsed.data];

  try {
    // Sequential on purpose: a batch is small and this keeps per-item
    // results in the order the CRM sent them.
    const results: InventoryUpdateResult[] = [];
    for (const item of items) {
      results.push(await applyInventoryUpdate(prisma, item));
    }
    const updated = results.filter((r) => r.status === "updated").length;

    // Catalog, PDPs and the home page all read Product rows — drop any
    // cached render so the new availability shows on the next request.
    if (updated > 0) {
      revalidatePath("/[locale]", "layout");
      // /categories is cached per tag now, not per request, so a push that
      // adds or retires a product has to say so explicitly.
      revalidateTag(CATALOG_COUNTS_TAG, "max");
    }

    // Anything that just became purchasable mails its waitlist, once. This
    // runs after the inventory commit and swallows its own failures, so a
    // dead SMTP server can never roll back or fail a stock update.
    const restocked = results.filter((r) => r.status === "updated" && r.cameBackInStock);
    const notifications: StockNotifyResult[] = [];
    for (const product of restocked) {
      if (product.status !== "updated") continue;
      notifications.push(
        await notifyBackInStock(prisma, {
          id: product.id,
          sku: product.sku,
          name: product.name,
          weight: product.weight,
        })
      );
    }

    const status = updated === results.length ? 200 : updated > 0 ? 207 : 404;
    return json(
      { ok: status === 200, updated, results, ...(notifications.length > 0 ? { notifications } : {}) },
      status
    );
  } catch (error) {
    console.error("crm-inventory webhook failed:", error);
    return json({ ok: false, error: "Inventory update failed" }, 500);
  }
}
