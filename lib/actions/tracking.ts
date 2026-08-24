"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { fetchDhlTracking } from "@/lib/dhl";
import type { TrackingResult } from "@/lib/tracking";

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

  const trimmed = trackingNumber.trim();
  if (!trimmed || trimmed.length > 64) return { ok: false, code: "NOT_FOUND" };

  const owned = await prisma.order.findFirst({
    where: { trackingNumber: trimmed, userId },
    select: { id: true },
  });
  if (!owned) return { ok: false, code: "FORBIDDEN" };

  return fetchDhlTracking(trimmed);
}
