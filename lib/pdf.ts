import "server-only";

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { orderBreakdown } from "@/lib/orderTotals";
import InvoiceDocument, {
  type InvoiceDocumentData,
  type InvoiceLine,
} from "@/components/pdf/InvoiceDocument";

/**
 * Invoice PDF rendering.
 *
 * `server-only` at the top is load-bearing: @react-pdf/renderer pulls in
 * fontkit and a PNG/JPEG decoder and is several hundred kilobytes. Importing
 * it from a client component would ship all of that to the browser, and the
 * import would fail at runtime anyway. It is also Node-only — it uses Node
 * streams and Buffer — so any route that calls this must NOT run on Edge.
 * Route handlers that use it therefore declare `export const runtime = "nodejs"`.
 */

/**
 * Registers the invoice typeface.
 *
 * @react-pdf ships only the 14 standard PDF fonts, which are Latin-1. A real
 * customer of this shop — "Пивоваров Максим Романович" — printed as
 * "82>20@>2 <0:A8< ><0=>28G" on the invoice, because Helvetica has no
 * Cyrillic glyphs and every codepoint above U+00FF was mapped to garbage.
 * Noto Sans covers Latin, Cyrillic and Greek in one family, so registering it
 * fixes every European locale this shop sells into.
 *
 * Still NOT covered: CJK (ko, zh). Those need a separate ~5 MB face; a Korean
 * or Chinese name will currently print as blanks rather than mojibake. Worth
 * knowing before the first APAC invoice.
 *
 * Idempotent and lazy — module-level registration would run during `next
 * build` while the files may not be traced yet.
 */
const FONT_DIR = join(process.cwd(), "public", "fonts");
export const PDF_FONT_FAMILY = "NotoSans";
const FONT_FAMILY = PDF_FONT_FAMILY;
let fontsReady = false;

export function registerFonts(): boolean {
  if (fontsReady) return true;

  const regular = join(FONT_DIR, "NotoSans-Regular.ttf");
  const bold = join(FONT_DIR, "NotoSans-Bold.ttf");
  if (!existsSync(regular) || !existsSync(bold)) {
    // Degrade to Helvetica rather than throw: a Latin-only invoice is a bad
    // invoice, but no invoice at all is worse. Run scripts/fetch-invoice-fonts.mjs.
    console.error(
      `[invoice] Noto Sans missing from ${FONT_DIR} — falling back to Helvetica, ` +
        "which cannot render Cyrillic or Greek. Run: node scripts/fetch-invoice-fonts.mjs"
    );
    return false;
  }

  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: regular, fontWeight: "normal" },
      { src: bold, fontWeight: "bold" },
    ],
  });
  // Noto Sans has no hyphenation patterns loaded; leaving the default
  // hyphenator on would break long SKUs at arbitrary points.
  Font.registerHyphenationCallback((word) => [word]);

  fontsReady = true;
  return true;
}

// Moved to lib/seller so emails can use it without this module's PDF
// renderer; re-exported for the existing PDF callers.
import { sellerDetails } from "@/lib/seller";
export { sellerDetails };

/** Fixed locale: an invoice is an archival record, not a localized view. */
const DATE_FMT = new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short", year: "numeric" });

export class InvoiceNotFoundError extends Error {
  constructor(orderId: string) {
    super(`No invoice data for order ${orderId}`);
    this.name = "InvoiceNotFoundError";
  }
}

/**
 * Assembles the printable figures for one order.
 *
 * Money rule, and the reason this is not a straight re-run of
 * calculateCartTotals: **the invoice must always sum to what the customer was
 * actually charged.** `Order.totalAmount` is that number, frozen at checkout.
 * Re-deriving shipping and VAT from today's constants would silently restate
 * a historical invoice the day a rate changes — so the goods and deposit come
 * from the frozen line items, shipping is derived, and VAT is whatever is left
 * over. The document then reconciles to the cent by construction.
 */
export async function buildInvoiceData(orderId: string): Promise<InvoiceDocumentData> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      totalAmount: true,
      shippingAddress: true,
      createdAt: true,
      user: { select: { name: true, email: true, companyName: true, vatNumber: true } },
      invoice: { select: { invoiceNumber: true, issuedAt: true, dueDate: true, status: true } },
      items: {
        select: {
          quantity: true,
          priceAtPurchase: true,
          depositAtPurchase: true,
          product: { select: { name: true, sku: true, weight: true } },
        },
      },
    },
  });

  if (!order || !order.invoice) throw new InvoiceNotFoundError(orderId);

  const lines: InvoiceLine[] = order.items.map((item) => {
    const unitPrice = Number(item.priceAtPurchase);
    return {
      name: item.product.name,
      sku: item.product.sku,
      variant: item.product.weight,
      quantity: item.quantity,
      unitPrice,
      lineTotal: round(unitPrice * item.quantity),
    };
  });

  // Goods, deposit, freight and VAT recovered from the frozen total — the
  // same function the order page uses, so the two always agree to the cent.
  const { subtotal, deposit, depositUnits, shipping, vat, vatRatePercent, total } = orderBreakdown(
    order.items.map((i) => ({ priceAtPurchase: Number(i.priceAtPurchase), quantity: i.quantity, depositAtPurchase: Number(i.depositAtPurchase) })),
    Number(order.totalAmount)
  );

  return {
    invoiceNumber: order.invoice.invoiceNumber,
    issuedAt: DATE_FMT.format(order.invoice.issuedAt),
    dueDate: order.invoice.dueDate ? DATE_FMT.format(order.invoice.dueDate) : null,
    orderNumber: order.orderNumber,
    status: order.invoice.status,
    seller: sellerDetails(),
    buyer: {
      name: order.user.name,
      company: order.user.companyName,
      email: order.user.email,
      // The frozen snapshot, not the address book row — where the cylinders
      // actually went must not change when the customer edits their address.
      addressLines: (order.shippingAddress ?? "")
        .split(/\s*,\s*/)
        .map((l) => l.trim())
        .filter(Boolean),
      // Required on the invoice for EU cross-border B2B (reverse charge).
      // Null for buyers who have not supplied one; the template omits the line.
      vatId: order.user.vatNumber,
    },
    lines,
    subtotal,
    deposit,
    depositUnits,
    shipping,
    vat,
    vatRatePercent,
    total,
    currency: "EUR",
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Renders one order's invoice to a PDF buffer.
 *
 * Buffer rather than a stream: the two consumers are a Nodemailer attachment
 * and a Response body, and both want the whole document. Streaming would only
 * pay off for something far larger than a one-page invoice.
 */
export async function generateInvoicePdfBuffer(orderId: string): Promise<Buffer> {
  const unicodeFonts = registerFonts();
  const data = await buildInvoiceData(orderId);
  // Called as a plain function, not via createElement: renderToBuffer's
  // signature is ReactElement<DocumentProps> — the <Document> element itself,
  // not a wrapper component around one. Invoking it returns exactly that, and
  // avoids an `as` cast that would paper over a real mismatch. It is a pure
  // function of its props with no hooks, so there is nothing to reconcile.
  return renderToBuffer(InvoiceDocument({ data, fontFamily: unicodeFonts ? FONT_FAMILY : undefined }));
}
