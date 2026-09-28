import type { PrismaClient } from "./generated/prisma/client";
import { CYLINDER_DEPOSIT_EUR, cylinderGasPrice } from "./pricing";

// Inventory rules shared by the seed, the CRM webhook and placeOrder().
// Quantities are absolute on-hand counts pushed by the CRM; everything the
// storefront shows (inStock, the stock badge) is derived from them here so
// no code path can leave the three fields disagreeing.

export { CYLINDER_DEPOSIT_EUR };
/** At or below this many units the badge switches from "In Stock" to "Low Stock". */
export const LOW_STOCK_THRESHOLD = 10;

export type StockFacet = "in" | "low" | "order" | "out";

export function stockFacetForQuantity(quantity: number): StockFacet {
  if (quantity <= 0) return "out";
  if (quantity <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}

/** The three Product columns a quantity change must write together. */
export function stockStateForQuantity(quantity: number) {
  const stockQuantity = Math.max(0, Math.trunc(quantity));
  return { stockQuantity, inStock: stockQuantity > 0, stock: stockFacetForQuantity(stockQuantity) };
}

export interface InventoryUpdateInput {
  /** Storefront SKU (case-insensitive). Preferred identifier. */
  sku?: string;
  /** The CRM's own product id, stored on Product.externalId. */
  externalId?: string;
  /** Exact product name (case-insensitive) — fallback when the CRM has no SKU. */
  name?: string;
  /** Absolute on-hand count (not a delta). Omit to leave stock untouched. */
  quantity?: number;
  /** New gas price per kilogram (EUR). Omit to leave pricing untouched. */
  pricePerKg?: number;
  /** New net gas weight per cylinder (kg). Omit to leave the pack size untouched. */
  weightKg?: number;
}

export type InventoryUpdateResult =
  | {
      status: "updated";
      /** Product.id — the CRM never sees it, but the webhook needs it for the waitlist. */
      id: string;
      sku: string;
      name: string;
      /** Pack label, used in the back-in-stock email. */
      weight: string;
      previousQuantity: number;
      previousInStock: boolean;
      stockQuantity: number;
      inStock: boolean;
      /** True when this push took the product from unavailable to purchasable. */
      cameBackInStock: boolean;
      pricePerKg: number;
      weightKg: number;
      /** pricePerKg × weightKg — what one cylinder now sells for (gas only). */
      cylinderPrice: number;
    }
  | { status: "not_found"; identifier: string };

// Works with both the root client and an interactive-transaction client.
type ProductDb = Pick<PrismaClient, "product">;

/**
 * Applies a CRM push to one product: sets the on-hand quantity (re-deriving
 * inStock + the stock badge) and/or the per-kg price and net weight.
 * Resolution order: sku → externalId → name. Idempotent: pushing the same
 * values twice is a no-op.
 */
export async function applyInventoryUpdate(db: ProductDb, input: InventoryUpdateInput): Promise<InventoryUpdateResult> {
  const sku = input.sku?.trim();
  const externalId = input.externalId?.trim();
  const name = input.name?.trim();
  const identifier = sku ?? externalId ?? name ?? "";

  const product = sku
    ? await db.product.findFirst({ where: { sku: { equals: sku, mode: "insensitive" } } })
    : externalId
      ? await db.product.findUnique({ where: { externalId } })
      : name
        ? await db.product.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
        : null;

  if (!product) return { status: "not_found", identifier };

  const data = {
    ...(input.quantity !== undefined ? stockStateForQuantity(input.quantity) : {}),
    ...(input.pricePerKg !== undefined ? { pricePerKg: input.pricePerKg } : {}),
    ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
  };
  const updated = await db.product.update({
    where: { id: product.id },
    data,
    select: { id: true, sku: true, name: true, weight: true, stockQuantity: true, inStock: true, pricePerKg: true, weightKg: true },
  });

  // Purchasability needs both flags, so a row left at inStock:true with a
  // zero count still counts as "was unavailable".
  const wasPurchasable = product.inStock && product.stockQuantity > 0;
  const isPurchasable = updated.inStock && updated.stockQuantity > 0;

  return {
    status: "updated",
    id: updated.id,
    sku: updated.sku,
    name: updated.name,
    weight: updated.weight,
    previousQuantity: product.stockQuantity,
    previousInStock: product.inStock,
    stockQuantity: updated.stockQuantity,
    inStock: updated.inStock,
    cameBackInStock: !wasPurchasable && isPurchasable,
    pricePerKg: updated.pricePerKg,
    weightKg: updated.weightKg,
    cylinderPrice: cylinderGasPrice(updated.pricePerKg, updated.weightKg),
  };
}
