import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isFounderEmail } from "@/lib/rbac";
import { isSafeStorageKey, readLocalCertificate } from "@/lib/fgasStorage";

/**
 * GET /api/fgas/document/<key>
 *
 * Serves a locally-stored F-Gas certificate. This exists because the upload
 * directory is deliberately outside `public/`: a compliance document naming
 * a company, its certificate number and an individual's qualifications must
 * not be fetchable by anyone who guesses a URL.
 *
 * Two callers are allowed, and nobody else:
 *   - the buyer the certificate belongs to;
 *   - an admin, who has to open it to approve or reject it.
 *
 * A missing file and an unauthorised request both answer 404, so this can't
 * be used to probe which certificate ids exist.
 *
 * `?download=1` switches the disposition to `attachment` so the profile's
 * download button saves the file instead of rendering it. The same query
 * param does the same thing on a Vercel Blob URL, so the button can be built
 * the same way whichever driver stored the document.
 */

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isSafeStorageKey(key)) return notFound();

  const download = new URL(request.url).searchParams.get("download");
  const asAttachment = download === "1" || download === "true";

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return notFound();

  // Authorise against the row, never against the URL: the only people who
  // may read this document are its owner and an admin.
  const [owner, viewer] = await Promise.all([
    prisma.user.findFirst({
      where: { fGasDocumentUrl: `/api/fgas/document/${key}` },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } }),
  ]);

  const isAdmin = viewer?.role === "ADMIN" && isFounderEmail(viewer.email);
  if (!owner) return notFound();
  if (owner.id !== userId && !isAdmin) return notFound();

  const file = await readLocalCertificate(key);
  if (!file) return notFound();

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
      // Inline so a reviewer can read it in the browser, but never cached by
      // a shared proxy and never indexed. `?download=1` flips it to a save.
      "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="fgas-certificate.${key.split(".").pop()}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
