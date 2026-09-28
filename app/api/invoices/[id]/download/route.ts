import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isFounderEmail } from "@/lib/rbac";
import { generateInvoicePdfBuffer } from "@/lib/pdf";

/**
 * GET /api/invoices/<invoiceId>/download
 *
 * Serves one invoice as a PDF, rendered on the fly from the order it belongs
 * to. Nothing is read from disk: `Invoice.pdfUrl` is a cache for a stored
 * copy, never the source of truth, so a document can always be reproduced
 * from the database even if no file was ever written.
 *
 * Two callers are allowed and nobody else: the buyer the invoice belongs to,
 * and an admin. An invoice names a company, its address, what it bought and
 * what it paid — an id-guessing stranger must get nothing.
 *
 * A missing invoice and an unauthorised request both answer 404, so this
 * cannot be used to probe which invoice ids exist.
 */

// @react-pdf/renderer is Node-only (Buffer, streams, fontkit), so this route
// must never be moved to the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 64) return notFound();

  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return notFound();

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, orderId: true, order: { select: { userId: true } } },
    });
    if (!invoice) return notFound();

    const isOwner = invoice.order.userId === viewerId;
    if (!isOwner) {
      // Same DB-backed admin rule the rest of the app uses — the role claim
      // in the session is not enough on its own.
      const viewer = await prisma.user.findUnique({
        where: { id: viewerId },
        select: { role: true, email: true },
      });
      const isAdmin = viewer?.role === "ADMIN" && isFounderEmail(viewer.email);
      if (!isAdmin) return notFound();
    }

    const pdf = await generateInvoicePdfBuffer(invoice.orderId);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        // An invoice is per-customer and must never be held by a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(`[INVOICE] download failed for ${id}:`, error);
    return new Response("Could not generate the invoice", { status: 500 });
  }
}
