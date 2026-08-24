"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const UpdateProfileInput = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(120).optional().or(z.literal("")),
  // Free-text job title — NOT the RBAC role. The `role` column is derived
  // exclusively from ADMIN_EMAIL (lib/rbac.ts) and is never client-writable.
  jobTitle: z.string().trim().max(80).optional().or(z.literal("")),
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
  const { name, companyName, jobTitle } = parsed.data;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        companyName: companyName || null,
        jobTitle: jobTitle || null,
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
