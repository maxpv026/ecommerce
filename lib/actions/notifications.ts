"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { NOTIFICATION_COLUMNS, type NotificationTopic } from "@/lib/notifications";

const PreferencesInput = z
  .object({
    backInStock: z.boolean(),
    priceDrops: z.boolean(),
    regulatory: z.boolean(),
    restockReminders: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type UpdateNotificationPreferencesResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "FAILED" };

/**
 * Saves the signed-in user's email preferences.
 *
 * Partial on purpose: the settings page sends only the toggle that changed,
 * so two quick flips in a row can never overwrite each other with a stale
 * copy of the full set (the same omitted-means-unchanged rule as
 * updateProfile). Unknown keys are rejected rather than ignored.
 */
export async function updateNotificationPreferences(
  rawInput: unknown
): Promise<UpdateNotificationPreferencesResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = PreferencesInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  const data = Object.fromEntries(
    (Object.entries(parsed.data) as Array<[NotificationTopic, boolean]>).map(([topic, value]) => [
      NOTIFICATION_COLUMNS[topic],
      value,
    ])
  );

  try {
    await prisma.user.update({ where: { id: userId }, data });
    revalidatePath("/[locale]/profile/settings", "page");
    return { ok: true };
  } catch (error) {
    console.error("updateNotificationPreferences failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
