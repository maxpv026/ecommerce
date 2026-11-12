"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { approveFGasCertificate, rejectFGasCertificate, type ReviewErrorCode } from "@/lib/fgasReview";
import { requirePermission } from "@/lib/admin/permissions";
import { ASSIGNABLE_ROLES, effectiveRole, isFounderEmail, isRole, type AppRole } from "@/lib/rbac";
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
  const admin = await requirePermission(session?.user?.id, "users.view");
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

export type SetRoleResult = { ok: true; role: AppRole } | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "TWO_FACTOR_REQUIRED" | "INVALID_ROLE" | "NOT_FOUND" | "OWNER_LOCKED" | "SELF" };

/**
 * Changes a user's role — the owner only (users.roles). SUPER_ADMIN can
 * never be assigned, and the owner's own row can never be changed, so the
 * account that holds every permission can't be demoted by accident or by a
 * forged request. The new role applies on the person's next request: the
 * session re-reads it (auth.ts), and every guard reads the row anyway.
 */
export async function setUserRole(targetUserId: unknown, role: unknown): Promise<SetRoleResult> {
  const session = await auth();
  const owner = await requirePermission(session?.user?.id, "users.roles");
  if (!owner.ok) return { ok: false, code: owner.code };
  if (!isRole(role) || !ASSIGNABLE_ROLES.includes(role)) return { ok: false, code: "INVALID_ROLE" };
  if (typeof targetUserId !== "string" || targetUserId.length > 64) return { ok: false, code: "NOT_FOUND" };
  if (targetUserId === owner.value.id) return { ok: false, code: "SELF" };

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, role: true } });
  if (!target) return { ok: false, code: "NOT_FOUND" };
  if (isFounderEmail(target.email) || effectiveRole(target.email, target.role) === "SUPER_ADMIN") return { ok: false, code: "OWNER_LOCKED" };

  await prisma.user.update({ where: { id: target.id }, data: { role } });
  console.info(`[rbac] ${owner.value.id} set ${target.id} → ${role}`);
  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true, role };
}
