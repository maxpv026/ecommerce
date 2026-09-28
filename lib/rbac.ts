import type { Role } from "@/lib/generated/prisma/enums";

// Single source of truth for the founder/admin rule. ADMIN_EMAIL in the
// environment is the only thing that can mint an ADMIN — the database role
// column is derived state, re-enforced from this on every sign-in, so even
// a manually edited row cannot keep ADMIN without the matching email.

export const ADMIN_LEGAL_NAME = "Maksym Pyvovarov";

/**
 * Warned about once per process, not once per call — this is consulted on
 * every sign-in and every admin action, and a per-call log would bury the
 * signal in noise.
 */
let warnedAboutMissingAdminEmail = false;

/**
 * Why a missing ADMIN_EMAIL is worth shouting about.
 *
 * The rule below is deliberately fail-closed: no ADMIN_EMAIL means nobody is
 * the founder. That is the safe direction, but it fails *silently* and the
 * consequence is not obvious — `roleForEmail` is applied on every sign-in, so
 * an unset variable in production does not merely block the admin screens, it
 * rewrites the founder's stored role to USER the next time they log in. The
 * fix afterwards is to set the variable and sign in again, but nothing in the
 * UI would ever tell you that was what happened.
 *
 * Deliberately NOT a thrown error: this is imported by the sign-in path, and
 * taking the whole shop down because an admin-only variable is missing would
 * turn a degraded admin console into an outage.
 */
function adminEmail(): string | undefined {
  const value = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!value && !warnedAboutMissingAdminEmail) {
    warnedAboutMissingAdminEmail = true;
    console.error(
      "[rbac] ADMIN_EMAIL is not set. No account can hold ADMIN, and the " +
        "founder's role will be downgraded to USER on their next sign-in. " +
        "Set ADMIN_EMAIL in the environment and sign in again."
    );
  }
  return value || undefined;
}

export function isFounderEmail(email: string | null | undefined): boolean {
  const configured = adminEmail();
  if (!configured || typeof email !== "string") return false;
  return email.trim().toLowerCase() === configured;
}

export function roleForEmail(email: string | null | undefined): Role {
  return isFounderEmail(email) ? "ADMIN" : "USER";
}
