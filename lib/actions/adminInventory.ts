"use server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/admin/permissions";
import { applyStockChange } from "@/lib/admin/stock";

/**
 * Manual stock control for the admin inventory screen.
 *
 * This exists because editing `stockQuantity` in Prisma Studio writes the
 * number and nothing else: the back-in-stock mail is sent by application
 * code on a 0 → positive transition, not by a database trigger. A row edited
 * outside the app therefore restocks silently and no one on the waitlist
 * ever hears about it.
 *
 * The work is in lib/admin/stock (shared with the Telegram bot), which runs
 * the update through `applyInventoryUpdate` — the same function the CRM
 * webhook calls — so `inStock`, the stock badge and the transition flag are
 * all derived identically. Writing the row here by hand would drift from the
 * webhook and reintroduce exactly the problem this screen is meant to fix.
 */

export interface InventoryUpdateReport {
  ok: boolean;
  /** One line, ready for a toast. */
  message: string;
  sku?: string;
  quantityBefore?: number;
  quantityAfter?: number;
  /** True when this update took the product from unavailable to purchasable. */
  cameBackInStock?: boolean;
  /** Subscribers who were waiting when the transition happened. */
  waitlistFound?: number;
  emailsSent?: number;
  emailsFailed?: number;
  /** Subscribers deferred because the batch hit its ceiling. */
  remaining?: number;
  error?: string;
}

export async function updateInventory(raw: {
  productId: string;
  newQuantity: number;
}): Promise<InventoryUpdateReport> {
  const session = await auth();
  const admin = await requirePermission(session?.user?.id, "inventory.stock");
  if (!admin.ok) {
    return { ok: false, message: "Admins only.", error: admin.code };
  }

  return applyStockChange(raw);
}
