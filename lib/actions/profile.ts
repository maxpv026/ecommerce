"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { refreshUserCountryQuietly } from "@/lib/userCountry";
import { AVATAR_TONES, FULFILMENT_PREFS, UNIT_PREFS, isValidCompanyId, isValidIban, normaliseInitials } from "@/lib/profilePrefs";

/** Optional enum: absent = unchanged, "" = clear. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional().or(z.literal(""));

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
    // EU VAT id, or a Ukrainian ЄДРПОУ (8 digits) / ІПН (10 digits).
    .refine((v) => v === "" || isValidCompanyId(v), "vatNumber")
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
  // ── Preferences (lib/profilePrefs) ──
  avatarTone: optionalEnum(AVATAR_TONES),
  avatarInitials: z.string().transform(normaliseInitials).optional(),
  billingEmail: z.string().trim().toLowerCase().max(254).email("billingEmail").optional().or(z.literal("")),
  depositIban: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => v === "" || isValidIban(v), "depositIban")
    .optional(),
  preferredFulfilment: optionalEnum(FULFILMENT_PREFS),
  preferredUnits: optionalEnum(UNIT_PREFS),
});

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "FAILED"; field?: string };

export async function updateProfile(rawInput: unknown): Promise<UpdateProfileResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = UpdateProfileInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const { name, companyName, jobTitle, phone, vatNumber, avatarTone, avatarInitials, billingEmail, depositIban, preferredFulfilment, preferredUnits } = parsed.data;

  // An omitted field is left as it is; only an explicit "" clears one.
  // Treating "absent" as "blank" erased data: the desktop modal has no phone
  // field and the mobile drawer never sent vatNumber, so saving either form
  // silently wiped the other's value — including the VAT number that has to
  // be printed on reverse-charge invoices. (Prisma skips `undefined` keys.)
  const optional = (value: string | undefined) => (value === undefined ? undefined : value || null);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        companyName: optional(companyName),
        vatNumber: optional(vatNumber),
        jobTitle: optional(jobTitle),
        phone: optional(phone),
        avatarTone: optional(avatarTone),
        avatarInitials: optional(avatarInitials),
        billingEmail: optional(billingEmail),
        depositIban: optional(depositIban),
        preferredFulfilment: optional(preferredFulfilment),
        preferredUnits: optional(preferredUnits),
      },
    });
    // Re-renders the profile dashboard in the same action roundtrip, so the
    // bento updates without a hard reload.
    revalidatePath("/[locale]/profile", "page");
    // VAT prefix and phone dialing code are country signals (lib/userCountry).
    if (vatNumber !== undefined || phone !== undefined) after(() => refreshUserCountryQuietly(userId));
    return { ok: true };
  } catch (error) {
    console.error("updateProfile failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
