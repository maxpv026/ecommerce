"use server";

import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const SaveAddressInput = z.object({
  id: z.string().min(1).optional(),
  // Optional: the checkout form asks only for shipping facts, so a label is
  // derived below. The profile address manager still sets one explicitly.
  title: z.string().trim().min(1).max(80).optional(),
  recipientName: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(80),
  // Delivery contact for the ADR carrier. Optional here so older callers
  // (and legacy rows) keep working; checkout requires it in the form.
  phone: z.string().trim().max(40).optional(),
  kind: z.enum(["SHIPPING", "BILLING"]).default("SHIPPING"),
  isDefault: z.boolean().default(false),
});

export type AddressErrorCode = "UNAUTHENTICATED" | "INVALID_INPUT" | "NOT_FOUND" | "FAILED";

/** saveAddress: echoes the saved row back so callers can use it immediately. */
export type AddressActionResult = { ok: true; id: string; address: SavedAddress } | { ok: false; code: AddressErrorCode };

/** delete / setDefault: nothing to hand back but which row was touched. */
export type AddressMutationResult = { ok: true; id: string } | { ok: false; code: AddressErrorCode };

/**
 * The saved row, echoed back so a caller can put it straight into local
 * state — checkout selects the new address without waiting for a refetch.
 */
export interface SavedAddress {
  id: string;
  title: string;
  recipientName: string;
  fullAddress: string;
  isDefault: boolean;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  kind: "SHIPPING" | "BILLING";
}

// The composed line every legacy consumer (checkout, mobile, shipping card)
// renders — regenerated on every save so both representations stay in sync.
function composeFullAddress(f: { street: string; postalCode: string; city: string; country: string }): string {
  return `${f.street}, ${f.postalCode} ${f.city}, ${f.country}`;
}

/**
 * A human label for the address list. Checkout deliberately doesn't ask for
 * one — the city reads naturally next to the recipient and the full line
 * ("Amsterdam · Test Cooling BV · Kanaalweg 1…"), and it never duplicates a
 * field already on the card. Falls back to the recipient if a city is odd.
 */
function deriveTitle(fields: { city: string; recipientName: string }): string {
  return (fields.city.trim() || fields.recipientName.trim()).slice(0, 80);
}

/**
 * Ids arrive from the client as untyped JSON. A cuid is well under 64 chars;
 * anything else is refused before it can reach Prisma.
 */
const AddressId = z.string().trim().min(1).max(64);

/** Create or update one of the caller's own addresses. */
export async function saveAddress(rawInput: unknown): Promise<AddressActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = SaveAddressInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { id, isDefault, title, phone, ...fields } = parsed.data;

  const data = {
    ...fields,
    title: title ?? deriveTitle(fields),
    // Empty string and "not given" mean the same thing in a nullable column.
    phone: phone && phone.length > 0 ? phone : null,
    fullAddress: composeFullAddress(fields),
    isDefault,
  };

  try {
    let saved;
    if (id) {
      // Ownership check: never update by id alone.
      const owned = await prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) return { ok: false, code: "NOT_FOUND" };
      saved = await prisma.address.update({ where: { id }, data });
    } else {
      // The very first address a buyer saves becomes their default, so the
      // next checkout preselects it instead of starting blank again.
      const existing = await prisma.address.count({ where: { userId } });
      saved = await prisma.address.create({
        data: { userId, ...data, isDefault: isDefault || existing === 0 },
      });
    }

    if (saved.isDefault) {
      await prisma.address.updateMany({
        where: { userId, id: { not: saved.id } },
        data: { isDefault: false },
      });
    }

    return {
      ok: true,
      id: saved.id,
      address: {
        id: saved.id,
        title: saved.title,
        recipientName: saved.recipientName,
        fullAddress: saved.fullAddress,
        isDefault: saved.isDefault,
        street: saved.street,
        city: saved.city,
        postalCode: saved.postalCode,
        country: saved.country,
        phone: saved.phone,
        kind: saved.kind === "BILLING" ? "BILLING" : "SHIPPING",
      },
    };
  } catch (error) {
    console.error("saveAddress failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/** Delete one of the caller's own addresses (order history keeps a null ref). */
export async function deleteAddress(id: string): Promise<AddressMutationResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = AddressId.safeParse(id);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const addressId = parsed.data;

  try {
    const removed = await prisma.address.deleteMany({ where: { id: addressId, userId } });
    if (removed.count === 0) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, id: addressId };
  } catch (error) {
    console.error("deleteAddress failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/** Make one of the caller's own addresses the default, atomically. */
export async function setDefaultAddress(id: string): Promise<AddressMutationResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  // `id.length` on a non-string is undefined, so the old guard let anything
  // through to Prisma — and the ownership read below sat OUTSIDE the try, so
  // Prisma's validation error escaped as an unhandled 500.
  const parsed = AddressId.safeParse(id);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const addressId = parsed.data;

  try {
    const owned = await prisma.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });
    if (!owned) return { ok: false, code: "NOT_FOUND" };

    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
    ]);
    return { ok: true, id: addressId };
  } catch (error) {
    console.error("setDefaultAddress failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
