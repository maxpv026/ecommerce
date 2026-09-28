import { GAS_MARKS, productHasGasMark, type GasMark } from "./gasMarks";

/**
 * Maps a catalog product onto its artwork: the 3D model used on the product
 * page, and the still render used in the catalog grid.
 *
 * Both are named after the refrigerant mark, lower-cased, with the
 * punctuation dropped: R-410A → `/r410a.glb` and `/images/products/r410a.webp`.
 *
 * Naively lower-casing the product name would not work — the catalog stores
 * "R-410A Premium" and SKUs like "HC-R410A-25", neither of which reduces to
 * "r410a" by string munging. So we identify the *mark* first (reusing the
 * same matcher the gas-mark filters use, which already normalises the
 * hyphen/prefix disagreement between `name` and `sku`) and derive the
 * filename from the canonical mark rather than from the raw product text.
 *
 * Non-gas rows — manifolds, recovery equipment, services — resolve to no
 * mark and therefore to no artwork, which is the signal each surface uses to
 * fall back to its outline placeholder.
 */

/**
 * Longest mark first, so a mark that is a prefix of another can never claim
 * a product before the more specific one gets a look (e.g. a future "R507"
 * must not swallow "R507A").
 */
const MARKS_BY_SPECIFICITY: readonly GasMark[] = [...GAS_MARKS].sort((a, b) => b.length - a.length);

export interface ProductIdentity {
  name?: string;
  sku?: string;
}

/** The refrigerant this product is, or null if it isn't a gas. */
export function gasMarkForProduct(product: ProductIdentity): GasMark | null {
  const identity = { name: product.name ?? "", sku: product.sku ?? "" };
  return MARKS_BY_SPECIFICITY.find((mark) => productHasGasMark(identity, mark)) ?? null;
}

/**
 * Public path of this product's 3D model, or null when we don't ship one.
 *
 * Null is a normal answer, not an error: equipment and services have no
 * cylinder to render. A path being returned is not a promise that the file
 * is on disk — the viewer still degrades to its poster if the fetch fails.
 */
export function modelPathForProduct(product: ProductIdentity): string | null {
  const mark = gasMarkForProduct(product);
  return mark ? `/${mark.toLowerCase()}.glb` : null;
}

/**
 * Public path of this product's catalog still, or null when we don't ship
 * one. Rendered from the .glb by `scripts/render-model-images.mjs`, so the
 * thumbnail and the interactive stage show the same object from the same
 * angle.
 */
export function imagePathForProduct(product: ProductIdentity): string | null {
  const mark = gasMarkForProduct(product);
  return mark ? `/images/products/${mark.toLowerCase()}.webp` : null;
}
