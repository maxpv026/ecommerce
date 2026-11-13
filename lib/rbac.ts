import type { Role } from "@/lib/generated/prisma/enums";

/**
 * Role-based access control — the single source of truth.
 *
 * Edge-safe (no database): proxy.ts imports it to gate routes from the JWT,
 * and the server guards (lib/admin/permissions) use the same matrix against
 * the database row. A role is never trusted from the client.
 *
 *   SUPER_ADMIN  the owner. Bound to ADMIN_EMAIL: that account is always
 *                SUPER_ADMIN and no other account can be — re-derived on every
 *                request, so a hand-edited row changes nothing. Not assignable,
 *                not demotable, not deletable.
 *   ADMIN        operations: stock, deposits, orders & shipping, F-Gas review,
 *                support. No roles, no broadcasts, no finance, no catalog
 *                structure (create / rename / reprice / delete products).
 *   ACCOUNTANT   read-only finance: turnover, revenue ledger, customer metrics
 *                and the CSV export. No mutation anywhere.
 *   USER         a buyer. No /admin at all.
 *
 * Every staff role additionally needs an enrolled authenticator (checked on
 * the row in lib/admin/permissions).
 */

export const ADMIN_LEGAL_NAME = "Maksym Pyvovarov";

export type AppRole = Role;
export const ROLES: readonly AppRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "USER"];
/** The roles the owner may hand out. SUPER_ADMIN is never assignable. */
export const ASSIGNABLE_ROLES: readonly AppRole[] = ["ADMIN", "ACCOUNTANT", "USER"];
export const STAFF_ROLES: readonly AppRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export type Permission =
  | "admin.access" //      enter /admin at all
  | "dashboard.view" //    /admin overview (content differs per role)
  | "analytics.view" //    /admin/analytics — finance & turnover
  | "finance.export" //    CSV ledger export
  | "inventory.view" //    /admin/inventory
  | "inventory.stock" //   stock counts, deposits, waitlist / restock
  | "inventory.catalog" // create / rename / reprice / regroup / delete products
  | "orders.view" //       /admin/orders
  | "orders.manage" //     status, payment, shipping, cancellation
  | "users.view" //        /admin/users
  | "users.fgas" //        approve / reject / revoke F-Gas certificates, view documents
  | "users.roles" //       change a user's role
  | "broadcasts" //        /admin/broadcast
  | "support" //           /admin/support
  | "telegram.link" //     /admin/telegram — pair a Telegram chat with the admin bot
  | "diagnostics"; //      SMTP self-test and similar owner tools

const MATRIX: Record<AppRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    "admin.access", "dashboard.view", "analytics.view", "finance.export",
    "inventory.view", "inventory.stock", "inventory.catalog",
    "orders.view", "orders.manage",
    "users.view", "users.fgas", "users.roles",
    "broadcasts", "support", "diagnostics", "telegram.link",
  ],
  ADMIN: [
    "admin.access", "dashboard.view",
    "inventory.view", "inventory.stock",
    "orders.view", "orders.manage",
    "users.view", "users.fgas",
    "support", "telegram.link",
  ],
  ACCOUNTANT: ["admin.access", "dashboard.view", "analytics.view", "finance.export"],
  USER: [],
};

export function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isStaffRole(role: unknown): boolean {
  return isRole(role) && STAFF_ROLES.includes(role);
}

export function can(role: unknown, permission: Permission): boolean {
  return isRole(role) && MATRIX[role].includes(permission);
}

/** Every permission of a role — handy for the client (sidebar, buttons). */
export function permissionsOf(role: unknown): readonly Permission[] {
  return isRole(role) ? MATRIX[role] : [];
}

// ── Routes ───────────────────────────────────────────────────────────────

/** Most specific first. /admin/forbidden is the in-shell 403 page. */
const ADMIN_PAGE_RULES: ReadonlyArray<{ prefix: string; permission: Permission }> = [
  { prefix: "/admin/forbidden", permission: "admin.access" },
  { prefix: "/admin/analytics", permission: "analytics.view" },
  { prefix: "/admin/dashboard", permission: "analytics.view" },
  { prefix: "/admin/inventory", permission: "inventory.view" },
  { prefix: "/admin/broadcast", permission: "broadcasts" },
  { prefix: "/admin/orders", permission: "orders.view" },
  { prefix: "/admin/users", permission: "users.view" },
  { prefix: "/admin/support", permission: "support" },
  { prefix: "/admin/telegram", permission: "telegram.link" },
  { prefix: "/admin", permission: "dashboard.view" },
];

const ADMIN_API_RULES: ReadonlyArray<{ prefix: string; permission: Permission }> = [
  { prefix: "/api/admin/finance", permission: "finance.export" },
  { prefix: "/api/admin/fgas", permission: "users.fgas" },
  { prefix: "/api/admin/test-restock", permission: "inventory.stock" },
  { prefix: "/api/admin/test-smtp", permission: "diagnostics" },
];

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The permission a locale-free /admin path needs, or null if it isn't an admin path. */
export function permissionForAdminPath(pathname: string): Permission | null {
  if (!matches(pathname, "/admin")) return null;
  return ADMIN_PAGE_RULES.find((r) => matches(pathname, r.prefix))?.permission ?? "dashboard.view";
}

/** Can this role open this locale-free /admin path? Non-admin paths: true. */
export function canAccessAdminRoute(role: unknown, pathname: string): boolean {
  const permission = permissionForAdminPath(pathname);
  return permission === null || can(role, permission);
}

/** The permission an /api/admin path needs. Unknown admin APIs need the owner. */
export function permissionForAdminApi(pathname: string): Permission {
  return ADMIN_API_RULES.find((r) => matches(pathname, r.prefix))?.permission ?? "diagnostics";
}

// ── The owner rule ───────────────────────────────────────────────────────

/**
 * Warned about once per process. Fail-closed: with no ADMIN_EMAIL nobody is
 * the owner — the safe direction, but a silent one, so it is logged loudly.
 * Not thrown: this sits on the sign-in path, and a missing admin variable
 * must not take the shop down.
 */
let warnedAboutMissingAdminEmail = false;

function ownerEmail(): string | undefined {
  const value = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!value && !warnedAboutMissingAdminEmail) {
    warnedAboutMissingAdminEmail = true;
    console.error("[rbac] ADMIN_EMAIL is not set. No account can be SUPER_ADMIN; set it and sign in again.");
  }
  return value || undefined;
}

export function isFounderEmail(email: string | null | undefined): boolean {
  const configured = ownerEmail();
  if (!configured || typeof email !== "string") return false;
  return email.trim().toLowerCase() === configured;
}

/**
 * The role an account actually has. The owner is SUPER_ADMIN whatever the
 * row says; any other row claiming SUPER_ADMIN is treated as a USER. ADMIN
 * and ACCOUNTANT are taken from the row — they are assigned by the owner.
 */
export function effectiveRole(email: string | null | undefined, stored: unknown): AppRole {
  if (isFounderEmail(email)) return "SUPER_ADMIN";
  if (stored === "ADMIN" || stored === "ACCOUNTANT") return stored;
  return "USER";
}
