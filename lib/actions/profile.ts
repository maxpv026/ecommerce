"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const UpdateProfileInput = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(120).optional().or(z.literal("")),
  // EU VAT ids are 2 country letters + up to 12 alphanumerics. Kept loose on
  // purpose: this is a reference printed on the invoice, and rejecting an
  // unusual-but-valid format would block a real customer from being billed
  // correctly. Whitespace and dots are stripped so "NL 8634.95921 B01" and
  // "NL863495921B01" store identically.
  vatNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.\-]/g, "").toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{2}[A-Z0-9]{2,14}$/.test(v), "vatNumber")
    .optional()
    .or(z.literal("")),
  // Free-text job title — NOT the RBAC role. The `role` column is derived
  // exclusively from ADMIN_EMAIL (lib/rbac.ts) and is never client-writable.
  jobTitle: z.string().trim().max(80).optional().or(z.literal("")),
  // Contact number. Loose on format by design — international numbers are
  // written a dozen ways and rejecting a valid one is worse than storing it
  // as typed; only length and character class are constrained.
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[\d\s+()./-]*$/, "phone")
    .optional()
    .or(z.literal("")),
});

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "FAILED" };

export async function updateProfile(rawInput: unknown): Promise<UpdateProfileResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = UpdateProfileInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { name, companyName, jobTitle, phone, vatNumber } = parsed.data;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        companyName: companyName || null,
        vatNumber: vatNumber || null,
        jobTitle: jobTitle || null,
        phone: phone || null,
      },
    });
    // Re-renders the profile dashboard in the same action roundtrip, so the
    // bento updates without a hard reload.
    revalidatePath("/[locale]/profile", "page");
    return { ok: true };
  } catch (error) {
    console.error("updateProfile failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
