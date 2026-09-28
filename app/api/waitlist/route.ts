import { z } from "zod";
import { routing } from "@/i18n/routing";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  MAX_EMAIL_LENGTH,
  isPurchasable,
  isValidEmail,
  normalizeEmail,
  type WaitlistErrorCode,
  type WaitlistResponse,
} from "@/lib/waitlist";

/**
 * POST /api/waitlist — join the back-in-stock waitlist for one product.
 *
 * Body (JSON), identifying the product by either field:
 *   { "productId": "clx…" }            signed in: the session address is used
 *   { "sku": "R404A", "email": "…" }   guest: the address is required
 *
 * A signed-in caller may still pass an explicit address (to be told at a
 * different one); with neither an address nor a session, the request is
 * rejected rather than silently dropped.
 *
 * Responses:
 *   200 { ok: true, email, alreadySubscribed }
 *   400 INVALID_REQUEST / INVALID_EMAIL
 *   404 PRODUCT_NOT_FOUND
 *   409 ALREADY_IN_STOCK   the product is purchasable — nothing to wait for
 *   500 FAILED
 *
 * Re-subscribing is safe: the unique (productId, email) row is re-armed
 * rather than duplicated, so a buyer who was notified about an earlier
 * restock is put back on the list.
 */

export const dynamic = "force-dynamic";

const Payload = z
  .object({
    productId: z.string().trim().min(1).max(64).optional(),
    sku: z.string().trim().min(1).max(64).optional(),
    email: z.string().trim().max(MAX_EMAIL_LENGTH).optional(),
    /**
     * Which language to link them to later. Constrained to the locales the
     * app actually serves — this value is interpolated into a URL inside an
     * email, so an arbitrary string would let a caller point that link
     * wherever they liked.
     *
     * `.catch` rather than a hard reject: an unrecognised locale is dropped
     * and the default stands, so a stray value costs the subscriber their
     * preferred language, not their subscription.
     */
    locale: z.enum(routing.locales).optional().catch(undefined),
  })
  .refine((body) => body.productId || body.sku, { message: "productId or sku is required" });

const STATUS: Record<WaitlistErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_EMAIL: 400,
  PRODUCT_NOT_FOUND: 404,
  ALREADY_IN_STOCK: 409,
  FAILED: 500,
};

const fail = (code: WaitlistErrorCode) =>
  Response.json({ ok: false, code } satisfies WaitlistResponse, { status: STATUS[code] });

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("INVALID_REQUEST");
  }

  const parsed = Payload.safeParse(raw);
  if (!parsed.success) return fail("INVALID_REQUEST");
  const { productId, sku, email: providedEmail } = parsed.data;

  // An explicit address wins; otherwise fall back to the signed-in one. The
  // session is only ever a source for the address — never authority to skip
  // validation.
  const session = await auth();
  const candidate = providedEmail?.trim() || session?.user?.email || "";
  if (!isValidEmail(candidate)) return fail("INVALID_EMAIL");
  const email = normalizeEmail(candidate);

  const product = productId
    ? await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, inStock: true, stockQuantity: true },
      })
    : await prisma.product.findFirst({
        where: { sku: { equals: sku!, mode: "insensitive" } },
        select: { id: true, inStock: true, stockQuantity: true },
      });

  if (!product) return fail("PRODUCT_NOT_FOUND");
  // Availability is re-read here, not taken from the client: a page rendered
  // before a restock must not be able to file a pointless subscription.
  if (isPurchasable(product)) return fail("ALREADY_IN_STOCK");

  // Only link the account when the address really is the session's own.
  const userId = session?.user?.id && session.user.email?.toLowerCase() === email ? session.user.id : null;

  try {
    const existing = await prisma.stockSubscription.findUnique({
      where: { productId_email: { productId: product.id, email } },
      select: { id: true },
    });

    // Re-subscribing refreshes the locale too: someone now browsing in
    // Bulgarian should get the Bulgarian link, not the one from last year.
    const locale = parsed.data.locale ?? routing.defaultLocale;

    await prisma.stockSubscription.upsert({
      where: { productId_email: { productId: product.id, email } },
      // Re-arm: someone notified about a past restock wants to hear again.
      update: { notified: false, notifiedAt: null, userId, locale },
      create: { productId: product.id, email, userId, locale },
    });

    return Response.json(
      { ok: true, email, alreadySubscribed: existing !== null } satisfies WaitlistResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error("waitlist subscribe failed:", error);
    return fail("FAILED");
  }
}
