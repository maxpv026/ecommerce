/**
 * Product sizes. Every size of a product is its own Product row (own SKU,
 * price, stock, deposit, CRM id, order lines); `familyKey` only says which
 * rows are sizes of the same thing. Pure — shared by the storefront, the
 * admin editor and the server actions.
 */

/** The containers the admin can pick from. Free text in the DB, constrained here. */
export const CONTAINER_TYPES = ["Cylinder", "Drum", "Isotank", "Can"] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export function isContainerType(value: string): value is ContainerType {
  return (CONTAINER_TYPES as readonly string[]).includes(value);
}

/** "10 kg cylinder" / "800 kg drum" — trims float noise, keeps up to 2 decimals. */
export function sizeLabel(weightKg: number, containerType: string): string {
  return `${Number(weightKg.toFixed(2))} kg ${containerType.toLowerCase()}`;
}

/**
 * Family keys are slugs ("r134a-virgin"), so two admins typing "R-134a
 * Virgin" and "r134a virgin" land in the same family.
 */
export function normalizeFamilyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Refrigerant mark from the leading token of the name: "R-134a Bulk" → "R-134a". */
export function refrigerantTypeOf(name: string): string {
  return name.split(" ")[0] ?? name;
}

/**
 * The family a row belongs to. An unset key falls back to the refrigerant
 * mark — the grouping the size selector used before families existed — so
 * the catalog behaves exactly as before until an admin assigns one.
 * Prefixed so an explicit key can never collide with a fallback mark.
 */
export function resolveFamily(familyKey: string | null | undefined, refrigerantType: string): string {
  return familyKey ? `key:${familyKey}` : `type:${refrigerantType.toLowerCase()}`;
}

/**
 * Points the address bar at the chosen size's own page without a navigation,
 * so a reload or a shared link lands on the size the buyer picked. Each
 * size has a real /products/<id> route, so the URL is always resolvable.
 */
export function showSizeInUrl(productId: string): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname.replace(/[^/]+\/?$/, encodeURIComponent(productId));
  if (path !== window.location.pathname) window.history.replaceState(window.history.state, "", path + window.location.search);
}

/**
 * The filter every catalog read applies. A size an admin deleted but that
 * has order or quote history is archived instead (Product.archivedAt): it
 * stays in the database for those records and disappears everywhere a buyer
 * — or the AI tools acting for one — could find, quote or buy it.
 */
export const LISTED = { archivedAt: null } as const;
