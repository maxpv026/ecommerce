import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { BANK_TRANSFER_METHOD } from "@/lib/payment";
import { commitOrder, prepareOrder, type OrderErrorCode } from "@/lib/orders";
import { buildNewOrderMessage } from "@/lib/orderNotification";
import { notifyAdmin } from "@/lib/telegram";
import { issueInvoiceForOrder } from "@/lib/invoicing";
import { convertRestockAlerts } from "@/lib/smartRestock";
import { generateInvoicePdfBuffer } from "@/lib/pdf";
import { sendOrderConfirmationEmail } from "@/lib/mail";
import { absoluteUrl } from "@/lib/siteUrl";

/**
 * Places a B2B order for payment by bank transfer.
 *
 *   POST /api/checkout
 *   { "addressId": "...", "items": [{ "sku": "R32", "qty": 2 }] }
 *
 *   200 { ok: true, orderId, orderNumber, totalAmount }
 *   4xx { ok: false, code }   — see OrderErrorCode
 *
 * There is no payment provider in this flow: the order is recorded as
 * PENDING / awaiting payment, the buyer is shown the company's bank details,
 * and an admin marks it paid when the transfer lands.
 *
 * Order of operations, and why:
 *
 *   1. Validate everything first — identity, the F-Gas certificate, address
 *      ownership, the products, their stock. Nothing is written for a basket
 *      that could never legally ship.
 *   2. Price the basket from the database, never from the request body.
 *   3. Reserve the stock and write the order in one transaction.
 *   4. Tell the admin. This is deliberately last and deliberately non-fatal:
 *      the order already exists, so a Telegram outage must not turn a placed
 *      order into an error the buyer sees.
 */

// The Telegram call is the only slow part, and it is capped at 8s.
export const maxDuration = 20;

const CheckoutRequest = z.object({
  addressId: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(1), qty: z.number().int().min(1).max(99) })).min(1).max(50),
});

const STATUS: Record<OrderErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FGAS_UNVERIFIED: 403,
  INVALID_INPUT: 400,
  ADDRESS_NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  OUT_OF_STOCK: 409,
  ORDER_FAILED: 500,
};

const fail = (code: OrderErrorCode) => Response.json({ ok: false, code }, { status: STATUS[code] });

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail("UNAUTHENTICATED");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("INVALID_INPUT");
  }

  const parsed = CheckoutRequest.safeParse(raw);
  if (!parsed.success) return fail("INVALID_INPUT");

  // ── 1 & 2. Every gate, and the authoritative totals ──
  const prepared = await prepareOrder(userId, parsed.data);
  if (!prepared.ok) return fail(prepared.code);
  const draft = prepared.value;

  // ── 3. Reserve the stock and record the order ──
  const committed = await commitOrder(draft, {
    paymentMethod: BANK_TRANSFER_METHOD,
    totalAmount: draft.totals.total,
  });
  if (!committed.ok) return fail(committed.code);
  const order = committed.value;

  // ── 4. Tell the admin where the cylinders are going ──
  //
  // Awaited, not fire-and-forget: a promise still in flight when the response
  // is returned can simply be discarded on a serverless runtime, which would
  // silently drop notifications. `notifyAdmin` never rejects and is capped at
  // 8s, so the worst case is a slower response — never a failed order.
  const buyer = await prisma.user
    .findUnique({ where: { id: userId }, select: { name: true, email: true, companyName: true } })
    .catch(() => null);

  await notifyAdmin(
    buildNewOrderMessage({
      orderNumber: order.orderNumber,
      orderId: order.id,
      customerName: buyer?.name ?? null,
      customerEmail: buyer?.email ?? null,
      companyName: buyer?.companyName ?? null,
      totalAmount: order.totalAmount,
      shippingAddress: draft.address,
      lines: draft.lines.map(({ product, qty }) => ({
        name: product.name,
        sku: product.sku,
        variant: product.weight,
        qty,
      })),
    }),
    `new order ${order.orderNumber}`
  );

  // ── 5. Credit any restock suggestion this order acted on ──
  //
  // A completed sale, not a click: the card deliberately leaves the alert
  // open when the item is added to the basket, because a basket is abandoned
  // often enough that converting there would flatter the metric. Only
  // NOTIFIED rows are promoted — a PENDING one was never actually sent, and
  // crediting a message nobody received would overstate how well this works.
  //
  // Caught separately: a conversion is a statistic. Losing one must never
  // turn a placed order into a failed response.
  try {
    const converted = await convertRestockAlerts(
      userId,
      draft.lines.map(({ product }) => product.id)
    );
    if (converted > 0) {
      console.info(`[SMART-RESTOCK] ${order.orderNumber} converted ${converted} alert(s).`);
    }
  } catch (error) {
    console.error(`[SMART-RESTOCK] could not credit alerts for ${order.orderNumber}:`, error);
  }

  // ── 6. Bill it, open the cylinder ledger, and send the invoice ──
  //
  // Everything from here is POST-SALE. The order is committed and the stock
  // is reserved; if any of this fails the customer still has a valid order,
  // so each step is caught separately and the response never depends on them.
  // issueInvoiceForOrder is idempotent, so a support tool can re-run it.
  let invoiceNumber: string | null = null;
  let cylindersBorrowed = 0;

  try {
    const issued = await issueInvoiceForOrder(order.id);
    invoiceNumber = issued.invoiceNumber;
    cylindersBorrowed = issued.cylindersBorrowed;
  } catch (error) {
    console.error(`[INVOICE] could not issue an invoice for ${order.orderNumber}:`, error);
  }

  if (invoiceNumber && buyer?.email) {
    // Rendering is the part most likely to break (fonts, a odd glyph, a big
    // order), and it must not take the email down with it — the confirmation
    // still goes, just without the attachment.
    let pdf: Buffer | null = null;
    try {
      pdf = await generateInvoicePdfBuffer(order.id);
    } catch (error) {
      console.error(`[INVOICE] PDF render failed for ${invoiceNumber}:`, error);
    }

    try {
      const delivery = await sendOrderConfirmationEmail(
        buyer.email,
        {
          orderNumber: order.orderNumber,
          invoiceNumber,
          customerName: buyer.name ?? null,
          total: new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
            order.totalAmount
          ),
          cylinders: cylindersBorrowed,
          lines: draft.lines.map(({ product, qty }) => ({
            name: product.name,
            variant: product.weight,
            qty,
          })),
          orderUrl: absoluteUrl(`/profile/orders/${order.id}`),
        },
        pdf
      );
      if (delivery.accepted.length === 0 || delivery.rejected.length > 0) {
        console.error(`[INVOICE] confirmation for ${order.orderNumber} was not accepted:`, delivery);
      }
    } catch (error) {
      console.error(`[INVOICE] confirmation email failed for ${order.orderNumber}:`, error);
    }
  }

  return Response.json({
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    invoiceNumber,
    cylindersBorrowed,
  });
}
