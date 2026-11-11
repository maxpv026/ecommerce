import "server-only";

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import type { FgasMediaType } from "@/lib/fgas";

/**
 * Where uploaded F-Gas certificates live.
 *
 * Compliance documents (a company, a certificate number, a person's
 * qualifications), so: never in public/, never under a guessable name, and
 * only ever served through the authenticated routes
 * /api/fgas/document/<key> and /api/fgas/certificate/<userId>.
 *
 * Drivers, in order:
 *   blob      private Vercel Blob, when BLOB_READ_WRITE_TOKEN is set;
 *   database  PostgreSQL (FgasDocumentFile), AES-256-GCM encrypted here —
 *             used when there is no Blob token AND whenever a Blob upload
 *             fails, so an upload never fails for want of a file store.
 *             (Serverless disks are read-only: the old local-disk fallback
 *             broke every upload in production.)
 *   local     read-only now: documents written to .uploads/fgas during
 *             development before this change can still be read back.
 *
 * Encryption key: HKDF-SHA256 over FGAS_DOCUMENT_KEY when set, else
 * AUTH_SECRET. The row records which (keyRef), so rotating AUTH_SECRET
 * without setting FGAS_DOCUMENT_KEY to the old value makes old documents
 * unreadable — set FGAS_DOCUMENT_KEY once and keep it.
 */

export type FgasStorageDriver = "blob" | "database";

export interface StoredCertificate {
  driver: FgasStorageDriver;
  /** What goes in fGasDocumentUrl / Certificate.documentUrl. Server-side only. */
  url: string;
  contentType: FgasMediaType;
  bytes: number;
}

const DB_PREFIX = "/api/fgas/document/";
const DB_KEY = /^db-[0-9a-f-]{36}$/i;
/** Legacy local-disk key: a plain `<uuid>.<ext>`. */
const LOCAL_KEY = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;

export const isDbKey = (key: string) => DB_KEY.test(key);
export const isLocalKey = (key: string) => LOCAL_KEY.test(key);
export const isSafeStorageKey = (key: string) => isDbKey(key) || isLocalKey(key);

/** True for a document only the old local-disk driver holds (absent in production). */
export function isLocalOnlyDocument(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(DB_PREFIX) && isLocalKey(url.slice(DB_PREFIX.length)));
}

export function storageDriver(): FgasStorageDriver {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() ? "blob" : "database";
}

// ── Encryption ───────────────────────────────────────────────────────────

const KEY_REFS = {
  "fgas-v1": () => process.env.FGAS_DOCUMENT_KEY?.trim(),
  "auth-v1": () => process.env.AUTH_SECRET?.trim(),
} as const;
type KeyRef = keyof typeof KEY_REFS;

function currentKeyRef(): KeyRef {
  if (KEY_REFS["fgas-v1"]()) return "fgas-v1";
  if (KEY_REFS["auth-v1"]()) return "auth-v1";
  throw new Error("FGAS_DOCUMENT_KEY or AUTH_SECRET is required to encrypt certificate documents");
}

function keyFor(ref: string): Buffer {
  const secret = (KEY_REFS as Record<string, () => string | undefined>)[ref]?.();
  if (!secret) throw new Error(`No key material for F-Gas document key "${ref}"`);
  return Buffer.from(hkdfSync("sha256", secret, "my-energy:fgas-documents", ref, 32));
}

export function encryptDocument(bytes: Uint8Array) {
  const keyRef = currentKeyRef();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(keyRef), iv);
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { keyRef, iv, authTag: cipher.getAuthTag(), data };
}

export function decryptDocument(row: { keyRef: string; iv: Uint8Array; authTag: Uint8Array; data: Uint8Array }): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", keyFor(row.keyRef), Buffer.from(row.iv));
  decipher.setAuthTag(Buffer.from(row.authTag));
  return Buffer.concat([decipher.update(Buffer.from(row.data)), decipher.final()]);
}

export function fingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ── Store ────────────────────────────────────────────────────────────────

async function storeInDatabase(bytes: Uint8Array, contentType: FgasMediaType, userId: string): Promise<StoredCertificate> {
  const id = `db-${randomUUID()}`;
  const sealed = encryptDocument(bytes);
  await prisma.fgasDocumentFile.create({
    data: {
      id,
      userId,
      mimeType: contentType,
      size: bytes.byteLength,
      sha256: fingerprint(bytes),
      keyRef: sealed.keyRef,
      iv: sealed.iv,
      authTag: sealed.authTag,
      data: sealed.data,
    },
  });
  return { driver: "database", url: `${DB_PREFIX}${id}`, contentType, bytes: bytes.byteLength };
}

/**
 * Persists a certificate for `userId`. Throws only if every driver failed:
 * a decision pointing at a document nobody can open can't be reviewed.
 */
export async function storeCertificate(bytes: Uint8Array, contentType: FgasMediaType, userId: string): Promise<StoredCertificate> {
  if (storageDriver() === "blob") {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`fgas/${randomUUID()}`, Buffer.from(bytes), {
        access: "private",
        contentType,
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return { driver: "blob", url: blob.url, contentType, bytes: bytes.byteLength };
    } catch (error) {
      console.error("[fgas-storage] Blob upload failed; storing in the database instead:", error);
    }
  }
  return storeInDatabase(bytes, contentType, userId);
}

// ── Read ─────────────────────────────────────────────────────────────────

export interface CertificateFile {
  body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>;
  contentType: string;
  size: number | null;
}

const LOCAL_ROOT = () => path.resolve(process.cwd(), process.env.FGAS_UPLOAD_DIR?.trim() || ".uploads/fgas");

async function readLocal(key: string): Promise<CertificateFile | null> {
  if (!isLocalKey(key)) return null;
  const root = LOCAL_ROOT();
  const target = path.resolve(root, key);
  if (target !== path.join(root, key)) return null;
  try {
    const bytes = await readFile(target);
    const ext = path.extname(key).slice(1).toLowerCase();
    const contentType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { body: new Uint8Array(bytes), contentType, size: bytes.length };
  } catch {
    return null;
  }
}

/** Decrypted bytes of a database-stored document, with its owner. */
export async function readDatabaseDocument(key: string): Promise<(CertificateFile & { userId: string }) | null> {
  if (!isDbKey(key)) return null;
  const row = await prisma.fgasDocumentFile.findUnique({ where: { id: key } });
  if (!row) return null;
  const bytes = decryptDocument(row);
  return { body: new Uint8Array(bytes), contentType: row.mimeType, size: bytes.length, userId: row.userId };
}

/**
 * Reads a stored certificate from wherever its URL says it lives. Does NOT
 * authorise — the caller must have checked owner-or-admin first.
 */
export async function readCertificate(storedUrl: string): Promise<CertificateFile | null> {
  if (storedUrl.startsWith(DB_PREFIX)) {
    const key = storedUrl.slice(DB_PREFIX.length);
    if (isDbKey(key)) return readDatabaseDocument(key);
    return readLocal(key);
  }
  let host: string;
  try {
    host = new URL(storedUrl).hostname;
  } catch {
    return null;
  }
  // Only our own blob store — never fetch an arbitrary URL from a DB column.
  if (!host.endsWith(".blob.vercel-storage.com")) return null;
  const { get } = await import("@vercel/blob");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  for (const access of ["private", "public"] as const) {
    try {
      const result = await get(storedUrl, { access, token, useCache: false });
      if (result?.statusCode === 200) return { body: result.stream, contentType: result.blob.contentType, size: result.blob.size };
    } catch {
      // Wrong access mode for this blob; try the other one.
    }
  }
  return null;
}

/**
 * Whose document is this? For database documents the row says so; for
 * legacy local / blob documents, whichever account, certificate or audit
 * entry references the URL. Null when nothing does.
 */
export async function documentOwner(storedUrl: string): Promise<string | null> {
  const key = storedUrl.startsWith(DB_PREFIX) ? storedUrl.slice(DB_PREFIX.length) : null;
  if (key && isDbKey(key)) {
    const row = await prisma.fgasDocumentFile.findUnique({ where: { id: key }, select: { userId: true } });
    return row?.userId ?? null;
  }
  const [user, cert, log] = await Promise.all([
    prisma.user.findFirst({ where: { fGasDocumentUrl: storedUrl }, select: { id: true } }),
    prisma.certificate.findFirst({ where: { documentUrl: storedUrl }, select: { userId: true } }),
    prisma.fgasAuditLog.findFirst({ where: { documentUrl: storedUrl }, select: { userId: true } }),
  ]);
  return user?.id ?? cert?.userId ?? log?.userId ?? null;
}

/** The authenticated URL a browser is given for a stored document. */
export function documentHref(storedUrl: string | null | undefined): string | null {
  if (!storedUrl) return null;
  if (storedUrl.startsWith(DB_PREFIX)) return storedUrl;
  return null;
}

/** The only URL a browser is given for a user's CURRENT certificate. */
export function certificateHref(userId: string): string {
  return `/api/fgas/certificate/${encodeURIComponent(userId)}`;
}
