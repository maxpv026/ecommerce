import "server-only";

import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/fgasReview";

/**
 * The admin page gate, in one place.
 *
 * This is the second wall behind proxy.ts, and it existed as a verbatim copy
 * in every admin page. Duplicated security is security that drifts: the
 * moment one page gains a rule the others do not, the weakest copy is the
 * real policy. Every admin route calls this instead.
 *
 * Three checks, in order:
 *   1. an authenticated session exists;
 *   2. it carries the ADMIN role;
 *   3. `requireAdmin` re-reads the database row — role, ADMIN_EMAIL and an
 *      enrolled second factor.
 *
 * Step 3 is the one that matters most. The session claim is a snapshot: a JWT
 * minted before 2FA was switched off still says `isTwoFactorEnabled: true`,
 * and these pages show real operational data. The row is the authority.
 *
 * Never returns on failure — `redirect()` throws — so a caller that forgets
 * to check the result still cannot render.
 */
export interface AdminIdentity {
  adminId: string;
  /** Display name, already falling back to the email. */
  name: string;
  email: string;
}

export async function guardAdmin(params: Promise<{ locale: string }>): Promise<AdminIdentity> {
  const { locale } = await params;

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect({ href: "/", locale });
    throw new Error("guardAdmin: unreachable");
  }

  const guard = await requireAdmin(session.user.id);
  if (!guard.ok) {
    // An admin without an authenticator is sent somewhere actionable rather
    // than bounced to the home page with no explanation.
    redirect(
      guard.code === "TWO_FACTOR_REQUIRED"
        ? { href: { pathname: "/profile", query: { notice: "admin-2fa-required" } }, locale }
        : { href: "/", locale }
    );
    // `redirect()` throws to unwind the render, but next-intl types it as
    // returning void rather than `never`, so TypeScript still believes this
    // branch can fall through to a non-admin `guard`. The throw is purely to
    // close that hole — it is not reachable at runtime.
    throw new Error("guardAdmin: unreachable");
  }

  // Returned so callers do not need a second `auth()` round trip just to
  // print who is signed in.
  return {
    adminId: guard.value.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
  };
}
