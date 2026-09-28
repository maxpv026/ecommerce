import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/fgasReview";
import { applyInventoryUpdate } from "@/lib/inventory";
import { notifyBackInStock } from "@/lib/stockNotify";

/**
 * POST /api/admin/test-restock — drive a restock by hand and watch it run.
 *
 * Editing `stockQuantity` in Prisma Studio changes the number but fires
 * nothing: the back-in-stock mail is sent by the CRM webhook, not by a
 * database trigger. This endpoint is the missing middle — it performs the
 * same update the webhook performs and then calls the same dispatcher, so
 * what you observe here is what production does.
 *
 * It deliberately calls `applyInventoryUpdate` rather than writing the row
 * itself. A hand-rolled `prisma.product.update` here would drift from the
 * webhook — miss the inStock flip or the stock badge — and then this would
 * be testing a code path no customer ever takes.
 *
 *   curl -X POST http://localhost:3000/api/admin/test-restock \
 *     -H 'Content-Type: application/json' \
 *     -b "authjs.session-token=<your session cookie>" \
 *     -d '{"productId":"<product id>","newQuantity":25}'
 *
 * Admin-only, checked against the database row and ADMIN_EMAIL — the same
 * guard the F-Gas review actions use. It writes real stock and sends real
 * email, so it is not something to leave open.
 *
 * Responses:
 *   200 { ok: true, product, cameBackInStock, notification }
 *   400 INVALID_INPUT      body failed validation
 *   401 / 403              not signed in / not an admin
 *   404 PRODUCT_NOT_FOUND  no product with that id
 */

export const dynamic = "force-dynamic";

const Payload = z.object({
  productId: z.string().trim().min(1).max(64),
  /** Absolute on-hand count, exactly as the CRM would send it. */
  newQuantity: z.number().int().min(0).max(1_000_000),
});

export async function POST(request: Request) {
  const session = await auth();
  const admin = await requireAdmin(session?.user?.id);
  if (!admin.ok) {
    return Response.json({ ok: false, code: admin.code }, { status: admin.code === "FORBIDDEN" ? 403 : 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, code: "INVALID_INPUT", issues: parsed.error.issues }, { status: 400 });
  }

  // applyInventoryUpdate resolves by sku/externalId/name, so translate the
  // id the caller has into the sku it expects.
  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { sku: true },
  });
  if (!product) {
    return Response.json({ ok: false, code: "PRODUCT_NOT_FOUND" }, { status: 404 });
  }

  console.log(
    `[RESTOCK] test-restock invoked by ${admin.value.email ?? admin.value.id} — ${product.sku} → quantity ${parsed.data.newQuantity}`
  );

  const result = await applyInventoryUpdate(prisma, {
    sku: product.sku,
    quantity: parsed.data.newQuantity,
  });
  if (result.status !== "updated") {
    return Response.json({ ok: false, code: "PRODUCT_NOT_FOUND" }, { status: 404 });
  }

  console.log(
    `[RESTOCK] stock ${result.previousQuantity} → ${result.stockQuantity}` +
      ` (inStock ${result.previousInStock} → ${result.inStock}), cameBackInStock=${result.cameBackInStock}`
  );

  // The same condition the webhook applies: only a 0 → positive transition
  // mails anyone. Raising 5 to 50 notifies nobody, by design.
  const notification = result.cameBackInStock
    ? await notifyBackInStock(prisma, {
        id: result.id,
        sku: result.sku,
        name: result.name,
        weight: result.weight,
      })
    : null;

  if (!result.cameBackInStock) {
    console.log(
      "[RESTOCK] Not a 0 → positive transition, so no mail is due." +
        " Set the quantity to 0 first, then run this again with a positive number."
    );
  }

  return Response.json({
    ok: true,
    product: {
      id: result.id,
      sku: result.sku,
      name: result.name,
      previousQuantity: result.previousQuantity,
      previousInStock: result.previousInStock,
      stockQuantity: result.stockQuantity,
      inStock: result.inStock,
    },
    cameBackInStock: result.cameBackInStock,
    notification,
  });
}
