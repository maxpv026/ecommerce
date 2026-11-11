/**
 * One-off: move F-Gas certificate documents that only exist on a developer's
 * disk (.uploads/fgas — the old local driver) into encrypted PostgreSQL
 * storage (FgasDocumentFile), so production can serve them.
 *
 * For every account or certificate pointing at a local
 * `/api/fgas/document/<uuid>.<ext>` path whose file is present here: encrypt
 * it for the referencing account, repoint those live references, and append a
 * DOCUMENT_MIGRATED audit row. Audit rows are history and keep their old
 * paths, so they are not followed. Idempotent: a second run finds no live
 * local reference left to move.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/migrate-fgas-local-docs.ts --dry-run
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/migrate-fgas-local-docs.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import prisma from "../lib/prisma";
import { encryptDocument, fingerprint } from "../lib/fgasStorage";

const DRY_RUN = process.argv.includes("--dry-run");
const PREFIX = "/api/fgas/document/";
const LOCAL = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const isLocal = (url: string | null | undefined): url is string =>
  Boolean(url?.startsWith(PREFIX) && LOCAL.test(url.slice(PREFIX.length)));

async function main() {
  const [users, certs] = await Promise.all([
    prisma.user.findMany({
      where: { fGasDocumentUrl: { startsWith: PREFIX } },
      select: { id: true, fGasDocumentUrl: true },
    }),
    prisma.certificate.findMany({
      where: { documentUrl: { startsWith: PREFIX } },
      select: { id: true, userId: true, documentUrl: true },
    }),
  ]);

  // url → owner. One owner per document: the referencing rows all name the same user.
  const owners = new Map<string, string>();
  for (const u of users)
    if (isLocal(u.fGasDocumentUrl)) owners.set(u.fGasDocumentUrl, u.id);
  for (const c of certs)
    if (isLocal(c.documentUrl)) owners.set(c.documentUrl, c.userId);

  let moved = 0;
  for (const [url, userId] of owners) {
    const key = url.slice(PREFIX.length);
    let bytes: Buffer;
    try {
      bytes = await readFile(path.resolve(".uploads/fgas", key));
    } catch {
      console.log(
        `MISSING  ${key} (user ${userId}) — not on this disk; stays flagged for re-upload`,
      );
      continue;
    }
    const id = `db-${randomUUID()}`;
    const next = `${PREFIX}${id}`;
    console.log(
      `${DRY_RUN ? "WOULD MOVE" : "MOVE"}  ${key} (${bytes.length} bytes, user ${userId}) → ${id}`,
    );
    if (DRY_RUN) continue;
    const sealed = encryptDocument(bytes);
    await prisma.$transaction(async (tx) => {
      await tx.fgasDocumentFile.create({
        data: {
          id,
          userId,
          mimeType:
            MIME[key.split(".").pop()!.toLowerCase()] ??
            "application/octet-stream",
          size: bytes.length,
          sha256: fingerprint(bytes),
          keyRef: sealed.keyRef,
          iv: sealed.iv,
          authTag: sealed.authTag,
          data: sealed.data,
        },
      });
      await tx.user.updateMany({
        where: { fGasDocumentUrl: url },
        data: { fGasDocumentUrl: next },
      });
      await tx.certificate.updateMany({
        where: { documentUrl: url },
        data: { documentUrl: next },
      });
      // The audit log is append-only: earlier rows keep the old path, and this
      // row records where the document went.
      await tx.fgasAuditLog.create({
        data: {
          userId,
          action: "DOCUMENT_MIGRATED",
          actorId: "system",
          certificateId: null,
          reason: `Document moved from local disk (${key}) to encrypted database storage.`,
          documentUrl: next,
        },
      });
    });
    moved++;
  }
  console.log(
    `${DRY_RUN ? "Dry run" : "Done"}: ${owners.size} local document(s) referenced, ${moved} moved.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
