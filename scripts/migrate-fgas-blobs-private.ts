/**
 * One-off: move F-Gas certificates uploaded as PUBLIC Vercel Blobs to
 * private storage, so the old URLs stop working.
 *
 *   npx tsx --env-file=.env scripts/migrate-fgas-blobs-private.ts            # dry run: lists what it would do
 *   npx tsx --env-file=.env scripts/migrate-fgas-blobs-private.ts --apply    # does it
 *
 * Needs DATABASE_URL and BLOB_READ_WRITE_TOKEN for the production store.
 *
 * Per certificate: copy to a new private blob → point the user row at it →
 * delete the public original. In that order, so a failure part-way leaves
 * the account readable (worst case: a private copy is orphaned, or the
 * public one survives and is retried next run). Safe to re-run: documents
 * already private are skipped. Local-driver documents are untouched — they
 * were never public.
 *
 * Until it has run, /api/fgas/certificate still serves the old public blobs
 * (it falls back to public access), but their URLs remain fetchable by
 * anyone who has them.
 */
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const token = process.env.BLOB_READ_WRITE_TOKEN;
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function isPrivate(url: string): Promise<boolean> {
  try {
    const r = await get(url, { access: "private", token, useCache: false });
    return r?.statusCode === 200;
  } catch {
    return false;
  }
}

async function main() {
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set — nothing to migrate against.");

  const users = await prisma.user.findMany({
    where: { fGasDocumentUrl: { contains: ".blob.vercel-storage.com" } },
    select: { id: true, fGasDocumentUrl: true },
  });
  console.log(`${users.length} blob-stored certificate(s). ${APPLY ? "APPLYING." : "Dry run — pass --apply to migrate."}`);

  let moved = 0, skipped = 0, failed = 0;
  for (const user of users) {
    const url = user.fGasDocumentUrl!;
    if (await isPrivate(url)) {
      skipped++;
      continue;
    }
    if (!APPLY) {
      console.log(`would move ${user.id}`);
      continue;
    }
    try {
      const source = await get(url, { access: "public", token, useCache: false });
      if (source?.statusCode !== 200) throw new Error("public blob not readable");
      const bytes = new Uint8Array(await new Response(source.stream).arrayBuffer());
      const contentType = source.blob.contentType;
      const copy = await put(`fgas/${randomUUID()}.${EXT[contentType] ?? "bin"}`, Buffer.from(bytes), {
        access: "private",
        contentType,
        addRandomSuffix: true,
        token,
      });
      // Only repoint if the row still names the URL we copied (no re-upload in between).
      const { count } = await prisma.user.updateMany({ where: { id: user.id, fGasDocumentUrl: url }, data: { fGasDocumentUrl: copy.url } });
      if (count === 0) {
        await del(copy.url, { token });
        console.warn(`skipped ${user.id}: the certificate changed during migration`);
        continue;
      }
      await del(url, { token });
      moved++;
      console.log(`moved ${user.id}`);
    } catch (error) {
      failed++;
      console.error(`FAILED ${user.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`done: moved=${moved} already-private=${skipped} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
