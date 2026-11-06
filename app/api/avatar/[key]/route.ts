import { readLocalAvatar } from "@/lib/avatarStorage";

/**
 * GET /api/avatar/<uuid>.<ext> — profile photos stored by the local driver
 * (development; production uses Vercel Blob URLs directly).
 *
 * No auth by design: a photo is shown wherever its owner appears, and the
 * random name is the protection. The name never changes for a given file,
 * so it is cached as immutable.
 */

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/avatar/[key]">) {
  const { key } = await ctx.params;
  const file = await readLocalAvatar(key);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      // Served as an image, never sniffed into anything executable.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
