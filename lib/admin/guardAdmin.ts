import "server-only";

import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/admin/permissions";
import { isStaffRole, type AppRole, type Permission } from "@/lib/rbac";

/**
 * The admin page gate, in one place — every /admin page calls it with the
 * permission it needs (lib/rbac). Behind proxy.ts, which already refuses
 * from the session claim; this re-reads the database row, because a claim
 * can be minutes old after the owner changes someone's role.
 *
 *   not staff                      → the storefront
 *   staff without this permission  → /admin/forbidden (in the admin shell)
 *   staff without an authenticator → the profile, told to enrol one
 *
 * Never returns on failure — redirect() throws — so a caller that forgets to
 * check the result still cannot render.
 */
export interface AdminIdentity {
  adminId: string;
  /** Display name, already falling back to the email. */
  name: string;
  email: string;
  role: AppRole;
}

export async function guardAdmin(params: Promise<{ locale: string }>, permission: Permission): Promise<AdminIdentity> {
  const { locale } = await params;

  const session = await auth();
  if (!session?.user || !isStaffRole(session.user.role)) {
    redirect({ href: "/", locale });
    throw new Error("guardAdmin: unreachable");
  }

  const guard = await requirePermission(session.user.id, permission);
  if (!guard.ok) {
    redirect(
      guard.code === "TWO_FACTOR_REQUIRED"
        ? { href: { pathname: "/profile", query: { notice: "admin-2fa-required" } }, locale }
        : guard.code === "FORBIDDEN"
          ? { href: "/admin/forbidden", locale }
          : { href: "/", locale }
    );
    // next-intl types redirect() as void; it throws at runtime.
    throw new Error("guardAdmin: unreachable");
  }

  return {
    adminId: guard.value.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    role: guard.value.role,
  };
}
