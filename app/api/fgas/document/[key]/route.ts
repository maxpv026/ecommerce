import { auth } from "@/auth";
import { documentOwner, isSafeStorageKey, readCertificate } from "@/lib/fgasStorage";
import { isAdminViewer } from "@/lib/fgasReview";

/**
 * GET /api/fgas/document/<key>[?download=1]
 *
 * One stored certificate document — the current one or any earlier
 * submission in a buyer's history — decrypted and streamed. Keys are
 * random ("db-<uuid>" in PostgreSQL, or a legacy local-disk "<uuid>.<ext>").
 *
 *   401  no session
 *   403  signed in, but neither the document's owner nor an admin
 *   404  no such document (or the bytes can't be read)
 *   200  the owner, or an admin (role ADMIN + ADMIN_EMAIL, read from the row)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function GET(request: Request, ctx: RouteContext<"/api/fgas/document/[key]">) {
  const { key } = await ctx.params;
  if (!isSafeStorageKey(key)) return text("Not found", 404);

  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return text("Sign in to view this document.", 401);

  const storedUrl = `/api/fgas/document/${key}`;
  const owner = await documentOwner(storedUrl);
  if (!owner) return text("Not found", 404);
  if (owner !== viewerId && !(await isAdminViewer(viewerId))) return text("You don't have access to this document.", 403);

  const file = await readCertificate(storedUrl).catch((error) => {
    console.error(`[fgas] could not read document ${key}:`, error);
    return null;
  });
  if (!file) return text("The document couldn't be retrieved.", 404);

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="fgas-certificate.${EXT[file.contentType] ?? "bin"}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
