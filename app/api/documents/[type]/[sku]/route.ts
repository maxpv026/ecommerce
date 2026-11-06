import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isFounderEmail } from "@/lib/rbac";
import { isProductDocumentType, productDocument } from "@/lib/productDocuments";
import { buildSafetyDataSheet, renderSafetyDataSheet } from "@/lib/sdsPdf";

/**
 * GET /api/documents/<type>/<sku>   e.g. /api/documents/sds/HC-R410A-25
 *
 * A stable, SKU-addressed URL for a product's compliance documents.
 *
 * Static documents are not streamed through here: the SKU is resolved to the
 * file under /public and answered with a redirect, so the bytes come from the
 * CDN and the function only runs long enough to do one indexed lookup. The
 * redirect is itself CDN-cacheable, so repeat downloads of the same SKU don't
 * invoke the function at all.
 *
 * Generated SDS (lib/sdsContent.ts, currently R-32): rendered here once the
 * sheet is complete and signed off, and CDN-cached the same way. Until then
 * it is a draft, and drafts go to admins only — everyone else keeps getting
 * the static file, so an unreviewed sheet never reaches a customer.
 *
 * Unknown type, unknown SKU and "we hold no such document" all answer 404.
 */

// @react-pdf/renderer is Node-only (Buffer, streams, fontkit).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = (message = "Not found") => new Response(message, { status: 404 });

/** Same DB-backed admin rule the rest of the app uses; the session claim alone is not enough. */
async function viewerIsAdmin(): Promise<boolean> {
  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return false;
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true, email: true } });
  return viewer?.role === "ADMIN" && isFounderEmail(viewer.email);
}

export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[type]/[sku]">) {
  const { type, sku } = await ctx.params;
  if (!isProductDocumentType(type)) return notFound();
  if (!sku || sku.length > 64) return notFound();

  // The product row, not just the SKU text: a few SKUs drop the R
  // ("HC-410A-50") and only the name identifies the gas. It also means an
  // invented SKU 404s instead of resolving to some gas by substring luck.
  const product = await prisma.product.findUnique({
    where: { sku },
    select: { sku: true, name: true, purity: true, gwp: true },
  });
  if (!product) return notFound();

  // The answer differs by viewer while a generated sheet is still a draft
  // (admins get the draft, everyone else the static file), so the redirect
  // below must not be shared-cached then — the CDN does not key on cookies.
  let viewerDependent = false;

  if (type === "sds") {
    const sheet = buildSafetyDataSheet({
      name: product.name,
      sku: product.sku,
      purity: product.purity !== null ? Number(product.purity) : null,
      gwp: product.gwp,
    });
    const released = sheet !== null && sheet.draftReasons.length === 0;
    viewerDependent = sheet !== null && !released;
    if (sheet && (released || (await viewerIsAdmin()))) {
      try {
        const pdf = await renderSafetyDataSheet(sheet);
        return new Response(new Uint8Array(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdf.length),
            "Content-Disposition": `${released ? "attachment" : "inline"}; filename="${product.sku}-SDS${released ? "" : "-DRAFT"}.pdf"`,
            // A released sheet is the same for everyone; a draft is admin-only
            // and must never sit in a shared cache.
            "Cache-Control": released ? "public, max-age=0, s-maxage=86400" : "private, no-store",
          },
        });
      } catch (error) {
        console.error(`[SDS] render failed for ${product.sku}:`, error);
        // Fall through to the static file rather than fail the download.
      }
    }
  }

  const document = productDocument(type, product);
  if (!document) return notFound("No document of this type is held for this product");

  return new Response(null, {
    status: 307,
    headers: {
      // Relative on purpose: behind Vercel's proxy request.url can carry an
      // internal host, and browsers resolve a relative Location correctly.
      Location: document.path,
      // Public, identical for every visitor. A deploy purges the CDN, so a
      // replaced PDF is picked up on the next release.
      "Cache-Control": viewerDependent ? "private, no-store" : "public, max-age=0, s-maxage=86400",
    },
  });
}
