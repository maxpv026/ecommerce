import "server-only";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { effectiveRole, type AppRole, type Permission } from "@/lib/rbac";

/**
 * The server-side gate for every admin page, action and API route.
 *
 * Always re-reads the database row — the session's role claim is a snapshot
 * and may be minutes old after the owner changes someone's role — and
 * applies the owner rule (lib/rbac effectiveRole) to what it reads. Staff
 * also need an enrolled authenticator: these screens move money and
 * regulated gas.
 *
 * Callers turn a refusal into a 403 (API), a redirect (page) or a
 * { ok: false } result (server action); none of them render or write first.
 */

export { requirePermission, viewerCan, type GuardCode, type GuardResult } from "@/lib/admin/permissionCore";
import { requirePermission, type GuardResult } from "@/lib/admin/permissionCore";

/** The same check for the signed-in caller. */
export async function sessionPermission(permission: Permission): Promise<GuardResult> {
  const session = await auth();
  return requirePermission(session?.user?.id, permission);
}

/** The owner only (role management, broadcasts, diagnostics). */
export const requireSuperAdmin = () => sessionPermission("users.roles");
/** Day-to-day operations: SUPER_ADMIN or ADMIN. */
export const requireOperationalAdmin = () => sessionPermission("orders.manage");
/** Finance: SUPER_ADMIN or ACCOUNTANT. */
export const requireAccountantOrSuperAdmin = () => sessionPermission("analytics.view");

/** The caller's effective role (or null), for rendering role-dependent UI. */
export async function currentRole(): Promise<AppRole | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const row = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, role: true } });
  return row ? effectiveRole(row.email, row.role) : null;
}
