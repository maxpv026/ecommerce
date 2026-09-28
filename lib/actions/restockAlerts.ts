"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * Client-facing actions on a customer's own restock suggestions.
 *
 * The id arrives as untyped JSON from a public POST endpoint, so it is parsed
 * before it reaches Prisma, and every write is scoped by `userId` — never by
 * id alone. Dismissing someone else's alert is not a data leak, but it is
 * still a write on another tenant's row.
 */

const AlertId = z.string().trim().min(1).max(64);

export type RestockAlertActionResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "NOT_FOUND" | "FAILED" };

/**
 * "Not interested" — hides the suggestion for good.
 *
 * Terminal on purpose. The cron's suppression check only looks at PENDING and
 * NOTIFIED rows, so a DISMISSED one both disappears from the dashboard and
 * stops blocking a future prediction once the customer's cadence comes round
 * again — which is the behaviour you want: they said no to *this* nudge, not
 * to the product for ever.
 */
export async function dismissRestockAlert(rawId: string): Promise<RestockAlertActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = AlertId.safeParse(rawId);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    // updateMany with the ownership predicate baked in: there is no window
    // between "check it is theirs" and "write it".
    const { count } = await prisma.restockAlert.updateMany({
      where: { id: parsed.data, userId, status: { in: ["PENDING", "NOTIFIED"] } },
      data: { status: "DISMISSED" },
    });
    if (count === 0) return { ok: false, code: "NOT_FOUND" };

    revalidatePath("/[locale]/profile", "page");
    return { ok: true };
  } catch (error) {
    console.error("dismissRestockAlert failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
