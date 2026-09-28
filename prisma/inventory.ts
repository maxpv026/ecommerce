import type { PrismaClient } from "../lib/generated/prisma/client";
import { stockStateForQuantity } from "../lib/inventory";
import { CYLINDER_DEPOSIT_EUR } from "../lib/pricing";

// The refrigerant inventory as the CRM knows it — the single source of
// truth for which cylinders the shop sells, at what per-kg rate, in what
// pack size, and whether they are on hand. Re-running the seed re-applies
// these rules (prices included); day-to-day changes come from the CRM
// webhook.
//
// PRICING IS PER KILOGRAM. A cylinder's gas price is pricePerKg × weightKg
// (10 kg baseline → R32 = €250.00). The mandatory €15 cylinder deposit is
// a separate column (cylinderDeposit) and a separate cart line — never
// folded into the gas price and independent of the cylinder's weight.

export interface InventoryItem {
  sku: string;
  name: string;
  /** Gas price per kilogram, EUR. */
  pricePerKg: number;
  /** Net gas weight of one cylinder, kg. */
  weightKg: number;
  /** Initial on-hand count; 0 keeps the product listed but unavailable. */
  stockQuantity: number;
  gwpClass: "A1" | "A2L";
  gwp: number;
  purity: number;
}

const INITIAL_AVAILABLE_QUANTITY = 100;
/** Baseline pack size for every CRM-listed refrigerant. */
export const BASELINE_CYLINDER_KG = 10;

export const INVENTORY: InventoryItem[] = [
  // ── Available ──────────────────────────────────────────────────────────
  { sku: "R32", name: "R-32", pricePerKg: 25.0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: INITIAL_AVAILABLE_QUANTITY, gwpClass: "A2L", gwp: 675, purity: 99.9 },
  { sku: "R410A", name: "R-410A", pricePerKg: 30.0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: INITIAL_AVAILABLE_QUANTITY, gwpClass: "A1", gwp: 2088, purity: 99.9 },
  { sku: "R134A", name: "R-134a", pricePerKg: 25.0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: INITIAL_AVAILABLE_QUANTITY, gwpClass: "A1", gwp: 1430, purity: 99.9 },
  // ── Listed but unavailable (strictly out of stock, no price published yet) ──
  { sku: "R404A", name: "R-404A", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 3922, purity: 99.9 },
  { sku: "R407C", name: "R-407C", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 1774, purity: 99.9 },
  { sku: "R407F", name: "R-407F", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 1825, purity: 99.9 },
  { sku: "R422D", name: "R-422D", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 2729, purity: 99.9 },
  { sku: "R125A", name: "R-125A", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 3500, purity: 99.9 },
  { sku: "R449A", name: "R-449A", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 1397, purity: 99.9 },
  { sku: "R452A", name: "R-452A", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 2140, purity: 99.9 },
  { sku: "R507", name: "R-507", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 3985, purity: 99.9 },
  { sku: "R513A", name: "R-513A", pricePerKg: 0, weightKg: BASELINE_CYLINDER_KG, stockQuantity: 0, gwpClass: "A1", gwp: 631, purity: 99.9 },
];

/**
 * Upserts every CRM-listed refrigerant and retires any other refrigerant
 * row (legacy mock tiers) so the storefront can only sell what the CRM
 * lists. Retired rows are kept — order history references them — but are
 * marked out of stock with zero quantity. Equipment is left untouched.
 */
export async function seedInventory(prisma: PrismaClient): Promise<{ upserted: number; retired: number }> {
  for (const item of INVENTORY) {
    const stock = stockStateForQuantity(item.stockQuantity);
    const data = {
      name: item.name,
      pricePerKg: item.pricePerKg,
      weightKg: item.weightKg,
      weight: `${item.weightKg} kg cylinder`,
      cylinderDeposit: CYLINDER_DEPOSIT_EUR,
      gwpClass: item.gwpClass,
      gwp: item.gwp,
      purity: item.purity,
      category: "cylinders",
      ...stock,
    };
    await prisma.product.upsert({
      where: { sku: item.sku },
      // Re-applies the pricing rules and the initial availability on every
      // run; the CRM webhook is what moves quantities and prices after that.
      update: data,
      create: { sku: item.sku, ...data },
    });
  }

  const listed = INVENTORY.map((i) => i.sku);
  const retired = await prisma.product.updateMany({
    where: {
      sku: { notIn: listed },
      category: { in: ["cylinders", "blends"] },
      OR: [{ inStock: true }, { stockQuantity: { gt: 0 } }, { stock: { not: "out" } }],
    },
    data: { inStock: false, stockQuantity: 0, stock: "out" },
  });

  return { upserted: INVENTORY.length, retired: retired.count };
}
