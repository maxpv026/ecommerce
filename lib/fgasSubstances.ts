/**
 * Does selling this product require an F-Gas certificate?
 *
 * Decided by the SUBSTANCE, not by the catalogue category. Regulation (EU)
 * 2024/573 restricts the sale of fluorinated greenhouse gases — the HFCs of
 * Annex I and the unsaturated HFCs/HFOs and other fluorinated gases of
 * Annex II, and blends containing them — to certified undertakings. It does
 * not cover hydrocarbons (R-290 propane, R-600a isobutane, R-1270
 * propylene…), CO2 (R-744), ammonia (R-717) or water (R-718); nor tools and
 * accessories (manifolds, gauges, empty recovery cylinders).
 *
 * Fail-safe: a gas we cannot classify (an unknown designation, a custom
 * blend) REQUIRES a certificate. Wrongly asking a buyer for a certificate is
 * an inconvenience; wrongly selling fluorinated gas without one is a breach.
 *
 * Pure and client-safe: the cart, checkout and quotes all use it, so the
 * three can never disagree. Confirm the HFO scope (Annex II) with counsel —
 * it is treated here as requiring a certificate.
 */

/** Natural refrigerants and other non-fluorinated gases. */
const NOT_FLUORINATED = new Set(["R170", "R290", "R600", "R600A", "R601", "R601A", "R1150", "R1270", "R717", "R718", "R744", "R764"]);

/** Catalogue categories that are equipment, never gas. */
const NON_GAS_CATEGORIES = new Set(["equipment", "recovery", "tools", "accessories"]);

/** "R-290 Propane 5 kg" → "R290"; null when the name doesn't lead with a designation. */
export function refrigerantDesignation(name: string): string | null {
  const lead = name.trim().split(/\s+/)[0] ?? "";
  const n = lead.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return /^R\d{2,4}[A-Z]{0,2}$/.test(n) ? n : null;
}

export interface GateableProduct {
  name: string;
  category: string;
  gwp?: number | null;
}

export function requiresFgasCertificate(product: GateableProduct): boolean {
  if (NON_GAS_CATEGORIES.has(product.category)) return false;
  const code = refrigerantDesignation(product.name);
  if (code && NOT_FLUORINATED.has(code)) return false;
  // A designation we know is fluorinated, an unknown one, or a gas row
  // without one (a custom blend): all require it.
  if (code) return true;
  return product.category === "cylinders" || product.category === "blends" || product.gwp != null;
}

/** True when any line of a basket needs a certificate. */
export function basketRequiresFgas(products: GateableProduct[]): boolean {
  return products.some(requiresFgasCertificate);
}
