import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isFounderEmail } from "@/lib/rbac";
import { readCertificate } from "@/lib/fgasStorage";

/**
 * GET /api/fgas/certificate/<userId>[?download=1]
 *
 * The one way a browser gets an F-Gas certificate. The document names a
 * company, a certificate number and a person's qualifications, so it is
 * served only to:
 *
 *   - the account it belongs to, or
 *   - an admin (role ADMIN *and* ADMIN_EMAIL, read from the row — the
 *     session claim alone is not trusted).
 *
 *   401  no session
 *   403  signed in, but neither the owner nor an admin
 *   404  allowed, but there is no document on file (or it can't be read)
 *
 * The 403 is decided before the target is looked up, so it can't be used to
 * learn which user ids exist. The storage location — a private Vercel Blob
 * URL or a local key — is read from the row and never returned; the bytes
 * are streamed through here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function GET(request: Request, ctx: RouteContext<"/api/fgas/certificate/[userId]">) {
  const { userId } = await ctx.params;
  if (!userId || userId.length > 64) return text("Not found", 404);

  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return text("Sign in to view this document.", 401);

  if (viewerId !== userId) {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true, email: true } });
    const isAdmin = viewer?.role === "ADMIN" && isFounderEmail(viewer.email);
    if (!isAdmin) return text("You don't have access to this document.", 403);
  }

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { fGasDocumentUrl: true } });
  if (!owner?.fGasDocumentUrl) return text("No certificate on file.", 404);

  const file = await readCertificate(owner.fGasDocumentUrl).catch((error) => {
    console.error(`[fgas] could not read the certificate for ${userId}:`, error);
    return null;
  });
  if (!file) return text("The document couldn't be retrieved.", 404);

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `fgas-certificate.${EXT[file.contentType] ?? "bin"}`;

  return new Response(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // Personal data: never in a shared cache, never kept by the browser.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
