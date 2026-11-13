"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { expireCatalog } from "@/lib/catalogCache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin/permissions";
import { stockStateForQuantity } from "@/lib/inventory";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { CONTAINER_TYPES, LISTED, normalizeFamilyKey, sizeLabel } from "@/lib/productFamily";
import { updateInventory } from "@/lib/actions/adminInventory";
import { isPricedPerKg } from "@/lib/pricing";
import { after } from "next/server";
import { isPriceDrop, notifyPriceDrop, type PriceSnapshot } from "@/lib/priceDrop";
import { onPriceChange } from "@/lib/priceHistory";

/**
 * Product sizes ("variants") for the admin inventory screen.
 *
 * A size is a Product row of its own — own SKU, price, weight, deposit,
 * stock, CRM id and order history — and `familyKey` groups the rows that are
 * sizes of one product (lib/productFamily). So adding a size creates a row,
 * and editing one updates that row; nothing here ever rewrites an order,
 * since OrderItem keeps its own price/weight snapshot.
 *
 * Stock is the one field not written here: a quantity change goes through
 * updateInventory, the path shared with the CRM webhook, so a size taken
 * from 0 to a positive number still emails its waitlist.
 */

type Failure = { ok: false; error: string };

export type VariantResult =
  | { ok: true; id: string; sku: string; created: boolean; stockMessage: string | null }
  | Failure;

/**
 * Catalog structure — create, rename, reprice, regroup, delete — is the
 * owner's (inventory.catalog). Stock counts and deposits on an existing row
 * are operations (inventory.stock): see upsertVariant.
 */
async function admin(permission: "inventory.catalog" | "inventory.stock" = "inventory.catalog"): Promise<Failure | null> {
  const session = await auth();
  const check = await requirePermission(session?.user?.id, permission);
  return check.ok ? null : { ok: false, error: check.code === "FORBIDDEN" ? "FORBIDDEN" : "Admins only." };
}

const Sku = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(v), "SKU: 2-48 letters, digits, dots, dashes or underscores.");

const VariantInput = z.object({
  /** The row to edit. Absent → a new size. */
  id: z.string().trim().min(1).max(64).optional(),
  /** New size only: an existing row whose family it joins and whose gas data it copies. */
  familyOf: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(2, "Name is required.").max(120),
  sku: Sku,
  containerType: z.enum(CONTAINER_TYPES),
  weightKg: z.number().gt(0, "Net weight must be above 0 kg.").max(30_000, "Net weight is in kg — 30 000 max."),
  pricePerKg: z.number().min(0, "Price can't be negative.").max(100_000),
  cylinderDeposit: z.number().min(0, "Deposit can't be negative.").max(10_000),
  stockQuantity: z.number().int("Stock is a whole number.").min(0, "Stock can't be negative.").max(1_000_000),
});

export type VariantInputData = z.input<typeof VariantInput>;

function refresh() {
  revalidatePath("/[locale]/admin/inventory", "page");
  revalidatePath("/[locale]/products", "page");
  revalidatePath("/[locale]/products/[id]", "page");
  revalidateTag(CATALOG_COUNTS_TAG, "max");
  // Sizes, prices, families, archive state: the storefront catalog changes now.
  expireCatalog();
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

/**
 * Creates or edits one size. Price, net weight, container, deposit and name
 * are written to the row; stock is handed to updateInventory afterwards.
 */
export async function upsertVariant(raw: VariantInputData): Promise<VariantResult> {
  // The owner may change anything. Operations (ADMIN) may save an EXISTING
  // size whose catalog fields — name, SKU, container, net weight, price —
  // arrive exactly as stored: only stock and the deposit can differ. Checked
  // here against the row, so a hand-built request can't slip a price in.
  const session = await auth();
  const owner = await requirePermission(session?.user?.id, "inventory.catalog");
  if (!owner.ok) {
    if (owner.code !== "FORBIDDEN") return { ok: false, error: "Admins only." };
    const ops = await requirePermission(session?.user?.id, "inventory.stock");
    if (!ops.ok) return { ok: false, error: ops.code === "FORBIDDEN" ? "FORBIDDEN" : "Admins only." };
    const attempt = VariantInput.safeParse(raw);
    if (!attempt.success || !attempt.data.id) return { ok: false, error: "FORBIDDEN" };
    const stored = await prisma.product.findUnique({
      where: { id: attempt.data.id, ...LISTED },
      select: { name: true, sku: true, containerType: true, weightKg: true, pricePerKg: true },
    });
    if (!stored) return { ok: false, error: "That size no longer exists — refresh the page." };
    const d = attempt.data;
    const unchanged =
      stored.name === d.name &&
      stored.sku === d.sku &&
      stored.containerType === d.containerType &&
      Math.abs(stored.weightKg - d.weightKg) < 1e-9 &&
      Math.abs(stored.pricePerKg - d.pricePerKg) < 1e-9;
    if (!unchanged) return { ok: false, error: "FORBIDDEN" };
  }

  const parsed = VariantInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const input = parsed.data;

  const fields = {
    name: input.name,
    sku: input.sku,
    containerType: input.containerType,
    weightKg: input.weightKg,
    pricePerKg: input.pricePerKg,
    cylinderDeposit: input.cylinderDeposit,
    // The free-text label the cart and emails still read — kept in step
    // with the numbers so "50 lb cylinder" can't survive a change to 800 kg.
    weight: sizeLabel(input.weightKg, input.containerType),
  };

  let id: string;
  let created = false;
  // The price before this save, for the price-drop check below.
  let before: PriceSnapshot | null = null;
  try {
    if (input.id) {
      const existing = await prisma.product.findUnique({
        where: { id: input.id, ...LISTED },
        select: { id: true, category: true, pricePerKg: true, weightKg: true },
      });
      if (!existing) return { ok: false, error: "That size no longer exists — refresh the page." };
      // Per-unit products (equipment, empty recovery cylinders: weightKg 1,
      // lib/pricing) have no sizes, and a weight here would change their price.
      if (!isPricedPerKg(existing.category)) return { ok: false, error: "This product is sold per unit and has no sizes." };
      await prisma.product.update({ where: { id: input.id }, data: fields });
      before = { pricePerKg: existing.pricePerKg, weightKg: existing.weightKg };
      id = input.id;
    } else {
      if (!input.familyOf) return { ok: false, error: "Pick the product this size belongs to." };
      const base = await prisma.product.findUnique({
        where: { id: input.familyOf, ...LISTED },
        select: { category: true, gwpClass: true, gwp: true, purity: true, familyKey: true },
      });
      if (!base) return { ok: false, error: "That product no longer exists — refresh the page." };
      if (!isPricedPerKg(base.category)) return { ok: false, error: "This product is sold per unit and has no sizes." };

      // The gas facts are the gas's, not the container's: copied from the
      // product it's a size of. A new size starts empty (and so unlisted as
      // purchasable) — stock arrives through updateInventory below.
      const row = await prisma.product.create({
        data: {
          ...fields,
          category: base.category,
          gwpClass: base.gwpClass,
          gwp: base.gwp,
          purity: base.purity,
          familyKey: base.familyKey,
          ...stockStateForQuantity(0),
        },
        select: { id: true },
      });
      id = row.id;
      created = true;
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: `SKU ${input.sku} is already in use.` };
    console.error("[inventory] upsertVariant failed:", error);
    return { ok: false, error: "Saving the size failed. See the server log." };
  }

  // Stock last, through the waitlist-aware path. A no-op change is skipped
  // so saving a price doesn't print "stock 40 → 40".
  let stockMessage: string | null = null;
  const current = await prisma.product.findUnique({ where: { id }, select: { stockQuantity: true } });
  if (current && current.stockQuantity !== input.stockQuantity) {
    const report = await updateInventory({ productId: id, newQuantity: input.stockQuantity });
    stockMessage = report.message;
    if (!report.ok) {
      refresh();
      return { ok: false, error: `Size saved, but the stock update failed: ${report.message}` };
    }
  }

  // Price went down: email the buyers who favourited this size (and opted in
  // to price-drop alerts). Runs after the response is sent — the admin's
  // save doesn't wait on SMTP — and after() keeps the serverless invocation
  // alive until it finishes. The stock update above runs first, so a size
  // restocked and discounted in one save is emailed as purchasable.
  const nextPrice = { pricePerKg: input.pricePerKg, weightKg: input.weightKg };
  if (before && isPriceDrop(before, nextPrice)) {
    const productId = id;
    const previous = before;
    after(() =>
      notifyPriceDrop(productId, previous, nextPrice).catch((error) => console.error(`[price-drop] ${productId} failed:`, error))
    );
  }

  // Any price change (or a new size) goes into the market hub's price record
  // and is checked against buyers' target alerts — after the response.
  if (!before || before.pricePerKg !== input.pricePerKg) {
    const productId = id;
    after(() => onPriceChange([productId]));
  }

  refresh();
  return { ok: true, id, sku: input.sku, created, stockMessage };
}

const FamilyInput = z.object({
  productId: z.string().trim().min(1).max(64),
  /** Empty → back to the default grouping by refrigerant mark. */
  familyKey: z.string().max(80),
});

/**
 * Moves one row into a family (or back to the default grouping). Families
 * are just shared keys, so this is how two existing rows become sizes of
 * one product, or how reclaimed R-404A is split from virgin.
 */
export async function setVariantFamily(raw: z.input<typeof FamilyInput>): Promise<{ ok: true; familyKey: string | null } | Failure> {
  const denied = await admin();
  if (denied) return denied;

  const parsed = FamilyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Unknown product." };
  const familyKey = normalizeFamilyKey(parsed.data.familyKey) || null;

  const { count } = await prisma.product.updateMany({ where: { id: parsed.data.productId, ...LISTED }, data: { familyKey } });
  if (count === 0) return { ok: false, error: "That product no longer exists — refresh the page." };

  refresh();
  return { ok: true, familyKey };
}

export type DeleteSizeResult =
  | { ok: true; sku: string; mode: "deleted" | "archived"; orders: number; quotes: number; waitlistDropped: number }
  | Failure;

const ProductId = z.string().trim().min(1).max(64);

/**
 * Removes a size from the catalog.
 *
 * - No order or quote has ever referenced it → the row is deleted. Its
 *   waitlist and restock alerts go with it (both cascade).
 * - It has history → it is ARCHIVED, never deleted: OrderItem and QuoteItem
 *   point at the row, and an invoice, a delivery note or the F-Gas logbook
 *   reading a past order must still find the product it sold. Archived rows
 *   vanish from every catalog read (LISTED), so it can no longer be found,
 *   quoted or bought, and its pending waitlist is dropped — nobody can be
 *   promised a restock of something that's no longer sold.
 *
 * The delete itself is guarded by the database too: QuoteItem is RESTRICT
 * and OrderItem has no cascade, so an order placed between the count and
 * the delete fails the delete (P2003) and the size is archived instead.
 */
export async function deleteProductSize(productId: string): Promise<DeleteSizeResult> {
  const denied = await admin();
  if (denied) return denied;
  const parsed = ProductId.safeParse(productId);
  if (!parsed.success) return { ok: false, error: "Unknown product." };
  const id = parsed.data;

  const product = await prisma.product.findUnique({ where: { id, ...LISTED }, select: { sku: true } });
  if (!product) return { ok: false, error: "That size no longer exists — refresh the page." };

  const [orders, quotes] = await Promise.all([
    prisma.orderItem.count({ where: { productId: id } }),
    prisma.quoteItem.count({ where: { productId: id } }),
  ]);

  const archive = async () => {
    const [claimed, dropped] = await prisma.$transaction([
      prisma.product.updateMany({ where: { id, ...LISTED }, data: { archivedAt: new Date() } }),
      prisma.stockSubscription.deleteMany({ where: { productId: id, notified: false } }),
    ]);
    return { claimed: claimed.count === 1, dropped: dropped.count };
  };

  try {
    if (orders === 0 && quotes === 0) {
      try {
        const waitlistDropped = await prisma.stockSubscription.count({ where: { productId: id, notified: false } });
        await prisma.product.delete({ where: { id } });
        refresh();
        return { ok: true, sku: product.sku, mode: "deleted", orders, quotes, waitlistDropped };
      } catch (error) {
        const fkViolation = typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
        if (!fkViolation) throw error;
        // History appeared between the count and the delete — keep the row.
      }
    }
    const { claimed, dropped } = await archive();
    if (!claimed) return { ok: false, error: "That size no longer exists — refresh the page." };
    refresh();
    return { ok: true, sku: product.sku, mode: "archived", orders, quotes, waitlistDropped: dropped };
  } catch (error) {
    console.error("[inventory] deleteProductSize failed:", error);
    return { ok: false, error: "Deleting the size failed. See the server log." };
  }
}

/** Puts an archived size back on sale, as it was (stock untouched). */
export async function restoreProductSize(productId: string): Promise<{ ok: true; sku: string } | Failure> {
  const denied = await admin();
  if (denied) return denied;
  const parsed = ProductId.safeParse(productId);
  if (!parsed.success) return { ok: false, error: "Unknown product." };

  const row = await prisma.product.findUnique({ where: { id: parsed.data }, select: { sku: true } });
  const { count } = await prisma.product.updateMany({ where: { id: parsed.data, archivedAt: { not: null } }, data: { archivedAt: null } });
  if (!row || count === 0) return { ok: false, error: "That size isn't archived — refresh the page." };
  refresh();
  return { ok: true, sku: row.sku };
}
