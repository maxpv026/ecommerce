"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { sniffMediaType } from "@/lib/fgasVision";
import { AVATAR_MAX_BYTES, deleteStoredAvatar, storeAvatar, type AvatarMediaType } from "@/lib/avatarStorage";

export type AvatarResult =
  | { ok: true; avatarUrl: string | null }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_FILE" | "TOO_LARGE" | "FAILED" };

const IMAGE_TYPES: ReadonlySet<string> = new Set<AvatarMediaType>(["image/jpeg", "image/png", "image/webp"]);

/**
 * Replaces the signed-in user's profile photo.
 *
 * Takes FormData (field `avatar`) because a server action can't receive a
 * File any other way. The type is decided by the file's own bytes, never by
 * its name or the browser's claim, so an SVG or HTML file renamed .png is
 * refused rather than stored and served as an image.
 */
export async function uploadAvatar(formData: FormData): Promise<AvatarResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "INVALID_FILE" };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, code: "TOO_LARGE" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffMediaType(bytes);
  if (!type || !IMAGE_TYPES.has(type)) return { ok: false, code: "INVALID_FILE" };

  try {
    const previous = await prisma.user.findUnique({ where: { id: userId }, select: { image: true } });
    const avatarUrl = await storeAvatar(bytes, type as AvatarMediaType);
    await prisma.user.update({ where: { id: userId }, data: { image: avatarUrl } });
    // After the row points at the new photo, so a failed delete can only
    // leave an orphan, never a broken avatar.
    await deleteStoredAvatar(previous?.image ?? null);
    revalidatePath("/[locale]/profile", "page");
    return { ok: true, avatarUrl };
  } catch (error) {
    console.error("uploadAvatar failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/** Removes the profile photo; the initials show instead. */
export async function removeAvatar(): Promise<AvatarResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  try {
    const previous = await prisma.user.findUnique({ where: { id: userId }, select: { image: true } });
    await prisma.user.update({ where: { id: userId }, data: { image: null } });
    await deleteStoredAvatar(previous?.image ?? null);
    revalidatePath("/[locale]/profile", "page");
    return { ok: true, avatarUrl: null };
  } catch (error) {
    console.error("removeAvatar failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
