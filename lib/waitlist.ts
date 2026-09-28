// Contract shared by POST /api/waitlist and the storefront's "Notify me"
// UI. Client-safe: no Prisma, no mail transport, no secrets.

/** A product is purchasable only when both agree — either alone is not enough. */
export function isPurchasable(product: { inStock: boolean; stockQuantity: number }): boolean {
  return product.inStock && product.stockQuantity > 0;
}

export const isOutOfStock = (product: { inStock: boolean; stockQuantity: number }): boolean =>
  !isPurchasable(product);

/** Deliberately permissive — real bounces are the mail provider's job, not a regex's. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

export type WaitlistErrorCode =
  /** Body wasn't usable JSON, or the product reference was missing. */
  | "INVALID_REQUEST"
  /** Address missing or malformed, and no session address to fall back on. */
  | "INVALID_EMAIL"
  /** No product with that id or sku. */
  | "PRODUCT_NOT_FOUND"
  /** The product is already purchasable — nothing to wait for. */
  | "ALREADY_IN_STOCK"
  /** Database write failed. */
  | "FAILED";

export type WaitlistResponse =
  | {
      ok: true;
      /** The address the subscription was filed under, echoed for the UI. */
      email: string;
      /** True when this address was already on the list (the row was re-armed). */
      alreadySubscribed: boolean;
    }
  | { ok: false; code: WaitlistErrorCode };
