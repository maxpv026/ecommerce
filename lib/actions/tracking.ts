"use server";

import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { fetchDhlTracking } from "@/lib/dhl";
import type { TrackingResult } from "@/lib/tracking";

/**
 * A server action is a public POST endpoint and its argument is whatever JSON
 * the caller chose to send — the declared TypeScript type is erased. The old
 * `trackingNumber.trim()` therefore threw a TypeError for any non-string
 * (`{"trackingNumber": 123}`), which is an unhandled 500 rather than a
 * refusal. Parsing first turns that into an ordinary NOT_FOUND.
 */
const TrackingInput = z.string().trim().min(1).max(64);

/**
 * Live DHL status for one of the caller's own shipments.
 *
 * Server Actions are public POST endpoints, so this guards twice before any
 * upstream call: a session must exist, and the tracking number must belong
 * to one of that user's orders — otherwise the action would be a free,
 * key-bearing DHL proxy for anyone. The DHL_API_KEY itself never leaves
 * lib/dhl.ts (server-only).
 */
export async function getTrackingStatus(trackingNumber: string): Promise<TrackingResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = TrackingInput.safeParse(trackingNumber);
  if (!parsed.success) return { ok: false, code: "NOT_FOUND" };
  const trimmed = parsed.data;

  try {
    const owned = await prisma.order.findFirst({
      where: { trackingNumber: trimmed, userId },
      select: { id: true },
    });
    if (!owned) return { ok: false, code: "FORBIDDEN" };

    return await fetchDhlTracking(trimmed);
  } catch (error) {
    // A DHL outage or a dropped database connection is not a reason to hand
    // the buyer a crashed page: the order detail screen renders this result.
    console.error("getTrackingStatus failed:", error);
    return { ok: false, code: "UPSTREAM_ERROR" };
  }
}
