import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FgasMediaType } from "@/lib/fgas";

/**
 * Where uploaded F-Gas certificates live.
 *
 * These are compliance documents carrying a company's name, certificate
 * number and an individual's qualifications — not marketing assets. Two
 * rules follow from that and drive everything here:
 *
 *  1. They never go in `public/`. A file under public/ is served to anyone
 *     who can guess the path, forever, with no audit trail.
 *  2. The stored name is random, never derived from the user's filename or
 *     id, so one URL leaking tells an attacker nothing about the others.
 *
 * Two drivers:
 *
 *  - `blob`  — Vercel Blob, used when BLOB_READ_WRITE_TOKEN is present.
 *              Stored with `access: "private"`: the URL alone fetches
 *              nothing, only a request carrying the store token does. (It
 *              used to be public-but-unguessable, which made every leaked
 *              URL — a log line, a chat message — a working copy of
 *              someone's certificate.)
 *  - `local` — a directory outside the web root (default `.uploads/fgas`),
 *              for development.
 *
 * Either way the stored URL is internal. The browser only ever sees
 * /api/fgas/certificate/<userId>, which checks the caller and streams the
 * file through `readCertificate` below.
 */

export type FgasStorageDriver = "blob" | "local";

export interface StoredCertificate {
  driver: FgasStorageDriver;
  /**
   * What goes in `User.fGasDocumentUrl`.
   *
   * For `blob` the private blob URL (useless without the store token). For
   * `local` an app-relative path into the authenticated retrieval route —
   * never a filesystem path. Server-side only; never sent to a browser.
   */
  url: string;
  /** Opaque key for the retrieval route; null for blob. */
  key: string | null;
  contentType: FgasMediaType;
  bytes: number;
}

const LOCAL_ROOT = () => path.resolve(process.cwd(), process.env.FGAS_UPLOAD_DIR?.trim() || ".uploads/fgas");

const EXTENSIONS: Record<FgasMediaType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function storageDriver(): FgasStorageDriver {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() ? "blob" : "local";
}

/** Random, unguessable, and carrying no user-supplied text. */
function objectName(contentType: FgasMediaType): string {
  return `${randomUUID()}.${EXTENSIONS[contentType]}`;
}

/**
 * Persists the certificate and returns where it went.
 *
 * Throws on failure: an upload the reviewer can never open is worse than a
 * failed submission the buyer can retry.
 */
export async function storeCertificate(
  bytes: Uint8Array,
  contentType: FgasMediaType
): Promise<StoredCertificate> {
  const name = objectName(contentType);

  if (storageDriver() === "blob") {
    // Imported lazily so the package is only required when it is configured.
    const { put } = await import("@vercel/blob");
    const blob = await put(`fgas/${name}`, Buffer.from(bytes), {
      access: "private",
      contentType,
      // Vercel's suffix keeps two uploads of the same document from colliding.
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { driver: "blob", url: blob.url, key: null, contentType, bytes: bytes.byteLength };
  }

  const root = LOCAL_ROOT();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, name), bytes, { mode: 0o600 });

  return {
    driver: "local",
    url: `/api/fgas/document/${name}`,
    key: name,
    contentType,
    bytes: bytes.byteLength,
  };
}

/** Only ever a plain `<uuid>.<ext>` — no separators, no traversal. */
const SAFE_KEY = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;

export function isSafeStorageKey(key: string): boolean {
  return SAFE_KEY.test(key);
}

/**
 * Reads a locally-stored certificate back.
 *
 * The key is validated against SAFE_KEY *and* the resolved path is checked
 * to still sit inside the upload root, so a crafted key can never walk out
 * of it. Callers must do their own authorisation first — this function does
 * not know who is asking.
 */
export async function readLocalCertificate(
  key: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!isSafeStorageKey(key)) return null;

  const root = LOCAL_ROOT();
  const target = path.resolve(root, key);
  if (target !== path.join(root, key)) return null;

  try {
    const bytes = await readFile(target);
    const extension = path.extname(key).slice(1).toLowerCase();
    const contentType =
      extension === "pdf"
        ? "application/pdf"
        : extension === "png"
          ? "image/png"
          : extension === "webp"
            ? "image/webp"
            : "image/jpeg";
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/** Stable fingerprint of the document, for spotting re-uploads in review. */
export function fingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

const LOCAL_PREFIX = "/api/fgas/document/";

export interface CertificateFile {
  body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>;
  contentType: string;
  size: number | null;
}

/**
 * Reads a stored certificate back from wherever `User.fGasDocumentUrl` says
 * it lives. Does NOT authorise — the caller must have checked that the
 * requester owns the certificate or is an admin.
 *
 * Blob documents are tried as private first; a document uploaded before the
 * switch to private storage is still public until
 * scripts/migrate-fgas-blobs-private.ts moves it, so that is the fallback.
 */
export async function readCertificate(storedUrl: string): Promise<CertificateFile | null> {
  if (storedUrl.startsWith(LOCAL_PREFIX)) {
    const file = await readLocalCertificate(storedUrl.slice(LOCAL_PREFIX.length));
    return file ? { body: new Uint8Array(file.bytes), contentType: file.contentType, size: file.bytes.length } : null;
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
      if (result?.statusCode === 200) {
        return { body: result.stream, contentType: result.blob.contentType, size: result.blob.size };
      }
    } catch {
      // Wrong access mode for this blob; try the other one.
    }
  }
  return null;
}

/** The only URL a browser is given for a user's certificate. */
export function certificateHref(userId: string): string {
  return `/api/fgas/certificate/${encodeURIComponent(userId)}`;
}
