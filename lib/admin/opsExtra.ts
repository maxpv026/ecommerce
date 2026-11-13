import "server-only";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { expireCatalog } from "@/lib/catalogCache";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { LISTED } from "@/lib/productFamily";
import { isPricedPerKg } from "@/lib/pricing";
import { isPriceDrop, notifyPriceDrop } from "@/lib/priceDrop";
import { onPriceChange } from "@/lib/priceHistory";
import { isFounderEmail } from "@/lib/rbac";
import { ANNOUNCEMENT_TAG } from "@/lib/announcement";

/**
 * Admin operations the Telegram bot needs that had no shared function yet.
 * Each assumes the caller checked the permission (lib/telegram/access
 * `allowed`) and reports why it couldn't act rather than throwing.
 */

type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refreshCatalog() {
  revalidatePath("/[locale]/admin/inventory", "page");
  revalidatePath("/[locale]/products", "page");
  revalidatePath("/[locale]/products/[id]", "page");
  revalidateTag(CATALOG_COUNTS_TAG, "max");
  expireCatalog();
}

/**
 * New €/kg for one size ("inventory.catalog" — the owner). Same follow-ups as
 * the inventory editor: buyers watching a price drop are emailed, and the
 * change becomes a point in the /hub price history (and is checked against
 * price alerts).
 */
export async function setProductPrice(productId: string, pricePerKg: number): Promise<Done<{ sku: string; before: number; after: number }>> {
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0 || pricePerKg > 100_000) return { ok: false, error: "Ціна має бути більшою за 0." };
  const price = Math.round(pricePerKg * 100) / 100;
  const product = await prisma.product.findUnique({ where: { id: productId, ...LISTED }, select: { id: true, sku: true, category: true, pricePerKg: true, weightKg: true } });
  if (!product) return { ok: false, error: "Товар не знайдено." };
  await prisma.product.update({ where: { id: product.id }, data: { pricePerKg: price } });
  const before = { pricePerKg: product.pricePerKg, weightKg: product.weightKg };
  const next = { pricePerKg: price, weightKg: product.weightKg };
  if (isPricedPerKg(product.category) && isPriceDrop(before, next)) {
    after(() => notifyPriceDrop(product.id, before, next).catch((error) => console.error(`[price-drop] ${product.id} failed:`, error)));
  }
  if (product.pricePerKg !== price) after(() => onPriceChange([product.id]));
  refreshCatalog();
  return { ok: true, sku: product.sku, before: product.pricePerKg, after: price };
}

// ── Cylinder returns ──

function refreshReturns() {
  revalidatePath("/[locale]/profile", "page");
}

/** REQUESTED → SCHEDULED: the team has taken it on. */
export async function acceptCylinderReturn(id: string): Promise<Done> {
  const { count } = await prisma.cylinderReturnRequest.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "SCHEDULED" } });
  if (count === 0) return { ok: false, error: "Заявку вже опрацьовано або скасовано." };
  refreshReturns();
  return { ok: true };
}

/**
 * The cylinders are back in the warehouse: the request is COLLECTED and the
 * ledger books them RETURNED, so the buyer's balance and deposit owed drop.
 * Claimed with a conditional update, so a double tap books them once.
 */
export async function receiveCylinderReturn(id: string): Promise<Done<{ quantity: number }>> {
  const req = await prisma.cylinderReturnRequest.findUnique({ where: { id }, select: { userId: true, quantity: true, status: true } });
  if (!req) return { ok: false, error: "Заявку не знайдено." };
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.cylinderReturnRequest.updateMany({ where: { id, status: { in: ["REQUESTED", "SCHEDULED"] } }, data: { status: "COLLECTED" } });
      if (count === 0) throw new Error("ALREADY");
      await tx.cylinderTransaction.create({ data: { userId: req.userId, type: "RETURNED", quantity: req.quantity, notes: `Return request ${id}` } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY") return { ok: false, error: "Тару за цією заявкою вже прийнято." };
    throw error;
  }
  refreshReturns();
  return { ok: true, quantity: req.quantity };
}

// ── Announcement banner ──

export async function setAnnouncement(input: { text?: string; active?: boolean }, byUserId: string): Promise<Done<{ text: string; active: boolean }>> {
  const current = await prisma.siteAnnouncement.findFirst({ orderBy: { updatedAt: "desc" } });
  const text = input.text !== undefined ? input.text.trim().replace(/\s+/g, " ").slice(0, 280) : current?.text;
  if (!text) return { ok: false, error: "Спершу надішліть текст оголошення." };
  const active = input.active ?? (input.text !== undefined ? true : (current?.active ?? false));
  const row = current
    ? await prisma.siteAnnouncement.update({ where: { id: current.id }, data: { text, active, updatedById: byUserId } })
    : await prisma.siteAnnouncement.create({ data: { text, active, updatedById: byUserId } });
  // Expire now, not stale-while-revalidate: a banner switched off (or a
  // corrected typo) must not be served to the next visitor once more.
  revalidateTag(ANNOUNCEMENT_TAG, { expire: 0 });
  return { ok: true, text: row.text, active: row.active };
}

// ── Account lock (owner only — the caller checks "users.roles") ──

export async function setAccountLocked(targetId: string, locked: boolean, byUserId: string, reason?: string): Promise<Done> {
  if (targetId === byUserId) return { ok: false, error: "Не можна заблокувати власний акаунт." };
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { email: true } });
  if (!target) return { ok: false, error: "Користувача не знайдено." };
  if (isFounderEmail(target.email)) return { ok: false, error: "Акаунт власника не блокується." };
  await prisma.user.update({
    where: { id: targetId },
    // Locking ends every session on its next request (auth.ts reads lockedAt) and unlinks the bot.
    data: locked ? { lockedAt: new Date(), lockedReason: reason?.slice(0, 200) || null, telegramChatId: null } : { lockedAt: null, lockedReason: null },
  });
  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}
