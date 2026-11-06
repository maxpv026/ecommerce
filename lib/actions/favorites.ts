"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { LISTED } from "@/lib/productFamily";
import { getFavoriteProducts, type StoreProduct } from "@/lib/data";

/**
 * Favorites (wishlist). A favourite is one specific size — one Product row —
 * so the heart on the 10 kg cylinder doesn't also save the 800 kg drum.
 * Every action reads the user from the session; the client only ever names
 * a product.
 */

type Failure = { ok: false; code: "UNAUTHENTICATED" | "NOT_FOUND" | "INVALID_INPUT" | "FAILED" };

const ProductId = z.string().trim().min(1).max(64);

/** Adds or removes one size. Returns the resulting state, so the heart shows the truth. */
export async function toggleFavorite(productId: string): Promise<{ ok: true; favorited: boolean } | Failure> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = ProductId.safeParse(productId);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    // Removing first: if the row exists this is the whole job, and deleteMany
    // can't fail on a row a second tab removed a moment ago.
    const removed = await prisma.favorite.deleteMany({ where: { userId, productId: parsed.data } });
    if (removed.count > 0) {
      revalidatePath("/[locale]/profile/favorites", "page");
      return { ok: true, favorited: false };
    }

    // Only sizes that can be listed can be favourited.
    const exists = await prisma.product.count({ where: { id: parsed.data, ...LISTED } });
    if (!exists) return { ok: false, code: "NOT_FOUND" };

    // upsert, not create: a double click racing itself still ends with one row.
    await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId: parsed.data } },
      create: { userId, productId: parsed.data },
      update: {},
    });
    revalidatePath("/[locale]/profile/favorites", "page");
    return { ok: true, favorited: true };
  } catch (error) {
    console.error("[favorites] toggleFavorite failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/** The signed-in buyer's favourites, as catalog cards (newest first). */
export async function getFavorites(): Promise<{ ok: true; products: StoreProduct[] } | Failure> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  return { ok: true, products: await getFavoriteProducts(userId) };
}

/** Just the ids — what every heart on a page needs to show its state. */
export async function getFavoriteIds(): Promise<{ ok: true; ids: string[] } | Failure> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const rows = await prisma.favorite.findMany({ where: { userId }, select: { productId: true }, take: 500 });
  return { ok: true, ids: rows.map((r) => r.productId) };
}
