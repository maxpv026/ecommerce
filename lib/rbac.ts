import type { Role } from "@/lib/generated/prisma/enums";

// Single source of truth for the founder/admin rule. ADMIN_EMAIL in the
// environment is the only thing that can mint an ADMIN — the database role
// column is derived state, re-enforced from this on every sign-in, so even
// a manually edited row cannot keep ADMIN without the matching email.

export const ADMIN_LEGAL_NAME = "Maksym Pyvovarov";

export function isFounderEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !email) return false;
  return email.trim().toLowerCase() === adminEmail;
}

export function roleForEmail(email: string | null | undefined): Role {
  return isFounderEmail(email) ? "ADMIN" : "USER";
}
