"use server";

import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const SaveAddressInput = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(80),
  recipientName: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(80),
  kind: z.enum(["SHIPPING", "BILLING"]).default("SHIPPING"),
  isDefault: z.boolean().default(false),
});

export type AddressActionResult = { ok: true; id: string } | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "NOT_FOUND" | "FAILED" };

// The composed line every legacy consumer (checkout, mobile, shipping card)
// renders — regenerated on every save so both representations stay in sync.
function composeFullAddress(f: { street: string; postalCode: string; city: string; country: string }): string {
  return `${f.street}, ${f.postalCode} ${f.city}, ${f.country}`;
}

/** Create or update one of the caller's own addresses. */
export async function saveAddress(rawInput: unknown): Promise<AddressActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = SaveAddressInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { id, isDefault, ...fields } = parsed.data;

  const data = { ...fields, fullAddress: composeFullAddress(fields), isDefault };

  try {
    let savedId: string;
    if (id) {
      // Ownership check: never update by id alone.
      const owned = await prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) return { ok: false, code: "NOT_FOUND" };
      await prisma.address.update({ where: { id }, data });
      savedId = id;
    } else {
      const created = await prisma.address.create({ data: { userId, ...data } });
      savedId = created.id;
    }

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId, id: { not: savedId } },
        data: { isDefault: false },
      });
    }
    return { ok: true, id: savedId };
  } catch (error) {
    console.error("saveAddress failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/** Delete one of the caller's own addresses (order history keeps a null ref). */
export async function deleteAddress(id: string): Promise<AddressActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  if (!id || id.length > 64) return { ok: false, code: "INVALID_INPUT" };

  try {
    const removed = await prisma.address.deleteMany({ where: { id, userId } });
    if (removed.count === 0) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, id };
  } catch (error) {
    console.error("deleteAddress failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/** Make one of the caller's own addresses the default, atomically. */
export async function setDefaultAddress(id: string): Promise<AddressActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  if (!id || id.length > 64) return { ok: false, code: "INVALID_INPUT" };

  const owned = await prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return { ok: false, code: "NOT_FOUND" };

  try {
    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { ok: true, id };
  } catch (error) {
    console.error("setDefaultAddress failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
