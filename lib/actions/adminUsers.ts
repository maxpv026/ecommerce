"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { approveFGasCertificate, rejectFGasCertificate, requireAdmin, type ReviewErrorCode } from "@/lib/fgasReview";
import { ADMIN_USER_FILTERS, listAdminUsers, type AdminUsersPage } from "@/lib/adminUsers";

/**
 * Admin user-management actions.
 *
 * Both re-check the caller against the database (role, ADMIN_EMAIL, 2FA) —
 * a server action is a public endpoint — and status changes go through
 * lib/fgasReview rather than writing the column, so the rules live in one
 * place: only an account with a submitted document can be verified, every
 * rejection carries the reason the buyer is shown, an approval creates the
 * Certificate row, and two admins clicking at once can only move a row once.
 */

type Failure = { ok: false; error: string };

const MESSAGES: Record<ReviewErrorCode, string> = {
  UNAUTHENTICATED: "Sign in again.",
  FORBIDDEN: "Not authorised.",
  TWO_FACTOR_REQUIRED: "Enable two-factor authentication to review certificates.",
  USER_NOT_FOUND: "That account no longer exists.",
  NOT_PENDING: "That status change isn't possible from the account's current state — refresh to see it.",
  NO_DOCUMENT: "There is no document on file to approve — ask the buyer to upload one.",
  DOCUMENT_EXPIRED: "The certificate's own expiry date has passed — approving it would grant nothing. Ask for a renewed certificate.",
  FAILED: "Couldn't save the change. Try again.",
};

const ListInput = z.object({
  filter: z.enum(ADMIN_USER_FILTERS).catch("all"),
  query: z.string().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});

export async function getAdminUsers(input: unknown): Promise<({ ok: true } & AdminUsersPage) | Failure> {
  const session = await auth();
  const admin = await requireAdmin(session?.user?.id);
  if (!admin.ok) return { ok: false, error: MESSAGES[admin.code] };
  return { ok: true, ...(await listAdminUsers(ListInput.parse(input ?? {}))) };
}

const StatusInput = z.discriminatedUnion("status", [
  z.object({ userId: z.string().trim().min(1).max(64), status: z.literal("VERIFIED") }),
  z.object({
    userId: z.string().trim().min(1).max(64),
    status: z.literal("REJECTED"),
    // The buyer reads this on their profile, so it is required here.
    reason: z.string().trim().min(5).max(500),
  }),
]);

/**
 * Verify or reject a user's F-Gas certificate.
 *
 * VERIFIED unlocks purchasing; REJECTED blocks it and shows the buyer the
 * reason. Re-verifying a REJECTED account (overturning an AI refusal) and
 * revoking a VERIFIED one (an AI approval on a forgery) are both allowed.
 */
export async function updateUserFgasStatus(
  userId: string,
  status: "VERIFIED" | "REJECTED",
  reason?: string,
  /** For REJECTED: "replacement" refuses only a parked replacement; "revoke" ends the certificate in force. */
  mode: unknown = "auto"
): Promise<{ ok: true; status: "VERIFIED" | "REJECTED" } | Failure> {
  const parsed = StatusInput.safeParse({ userId, status, reason });
  const rejectMode = mode === "replacement" || mode === "revoke" ? mode : "auto";
  if (!parsed.success) {
    return { ok: false, error: status === "REJECTED" ? "Give the buyer a reason (at least 5 characters)." : "Invalid request." };
  }

  const session = await auth();
  const result =
    parsed.data.status === "VERIFIED"
      ? await approveFGasCertificate(session?.user?.id, parsed.data.userId)
      : await rejectFGasCertificate(session?.user?.id, parsed.data.userId, parsed.data.reason, rejectMode);

  if (!result.ok) return { ok: false, error: MESSAGES[result.code] };
  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true, status: parsed.data.status };
}
