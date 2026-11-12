import "server-only";

import prisma from "@/lib/prisma";
import { can, effectiveRole, isStaffRole, type AppRole, type Permission } from "@/lib/rbac";

/**
 * The database half of the admin gate — no session, no Next.js imports — so
 * it is usable anywhere a user id is known (and testable on its own).
 * lib/admin/permissions wraps it with the signed-in caller.
 *
 * Always re-reads the row: the session's role claim is a snapshot and may be
 * minutes old after the owner changes someone's role. Applies the owner rule
 * (lib/rbac effectiveRole) and requires an enrolled authenticator for staff.
 */

export type GuardCode = "UNAUTHENTICATED" | "FORBIDDEN" | "TWO_FACTOR_REQUIRED";
export type GuardResult = { ok: true; value: { id: string; email: string | null; role: AppRole } } | { ok: false; code: GuardCode };

export async function requirePermission(userId: string | null | undefined, permission: Permission): Promise<GuardResult> {
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, isTwoFactorEnabled: true } });
  if (!row) return { ok: false, code: "UNAUTHENTICATED" };
  const role = effectiveRole(row.email, row.role);
  if (!isStaffRole(role) || !can(role, permission)) {
    console.warn(`[rbac] ${role} ${row.id} refused "${permission}"`);
    return { ok: false, code: "FORBIDDEN" };
  }
  if (!row.isTwoFactorEnabled) return { ok: false, code: "TWO_FACTOR_REQUIRED" };
  return { ok: true, value: { id: row.id, email: row.email, role } };
}

/**
 * Reading a protected document (a certificate, an invoice). Same matrix,
 * without the authenticator requirement — viewing is not a change, and the
 * owner of the document may be the one asking.
 */
export async function viewerCan(userId: string | null | undefined, ...permissions: Permission[]): Promise<boolean> {
  if (!userId) return false;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  if (!row) return false;
  const role = effectiveRole(row.email, row.role);
  return permissions.some((p) => can(role, p));
}

