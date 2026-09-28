"use server";

import { z } from "zod";
import { auth } from "@/auth";
import {
  approveFGasCertificate as approve,
  rejectFGasCertificate as reject,
  listPendingReviews,
  requireAdmin,
  type PendingReview,
  type ReviewResult,
} from "@/lib/fgasReview";

/**
 * Server actions for F-Gas review.
 *
 * Thin wrappers: they resolve the caller from the session and hand off to
 * lib/fgasReview, which re-checks admin rights against the database. The
 * identity is never taken from an argument — a server action is a public
 * HTTP endpoint, so `approveFGasCertificate(someUserId)` called by anyone
 * must not be able to nominate its own approver.
 */

/**
 * The arguments are untrusted. These are public POST endpoints and the
 * declared parameter types are erased at runtime, so a caller can send a
 * number, an object or nothing at all — which previously reached
 * `reason.trim()` and Prisma's `where: { id }` as a non-string, throwing an
 * unhandled 500 instead of returning a refusal.
 */
const UserId = z.string().trim().min(1).max(64);
/** Empty is allowed: lib/fgasReview substitutes a default rejection reason. */
const Reason = z.string().trim().max(500).catch("");

export async function approveFGasCertificate(userId: string): Promise<ReviewResult> {
  const parsed = UserId.safeParse(userId);
  if (!parsed.success) return { ok: false, code: "USER_NOT_FOUND" };

  const session = await auth();
  return approve(session?.user?.id, parsed.data);
}

export async function rejectFGasCertificate(userId: string, reason: string): Promise<ReviewResult> {
  const parsed = UserId.safeParse(userId);
  if (!parsed.success) return { ok: false, code: "USER_NOT_FOUND" };

  const session = await auth();
  return reject(session?.user?.id, parsed.data, Reason.parse(reason));
}

/** Admin-only: the queue of certificates awaiting a decision. */
export async function getPendingFGasReviews(): Promise<ReviewResult<PendingReview[]>> {
  const session = await auth();
  const admin = await requireAdmin(session?.user?.id);
  if (!admin.ok) return admin;
  return { ok: true, value: await listPendingReviews() };
}
