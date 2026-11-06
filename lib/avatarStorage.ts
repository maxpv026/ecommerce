import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where profile photos live. Same two drivers as lib/fgasStorage.ts:
 *
 *  - `blob`  — Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production).
 *  - `local` — `.uploads/avatars` outside the web root, for development,
 *              served by app/api/avatar/[key].
 *
 * Unlike certificates, a photo needs no authenticated read: it is shown
 * wherever the user appears, so the protection is an unguessable random
 * name. That also makes each upload's URL immutable — a new photo is a new
 * URL — so both drivers can be cached forever.
 */

export type AvatarMediaType = "image/jpeg" | "image/png" | "image/webp";

/** The client resizes to 512 px WebP (~50-150 KB) before upload; this is the server's ceiling. */
export const AVATAR_MAX_BYTES = 512 * 1024;

const EXTENSIONS: Record<AvatarMediaType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const LOCAL_ROOT = () => path.resolve(process.cwd(), process.env.AVATAR_UPLOAD_DIR?.trim() || ".uploads/avatars");
const LOCAL_PREFIX = "/api/avatar/";
const BLOB_PREFIX = "avatars/";

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

/** Persists a photo and returns the URL to store in User.image. Throws on failure. */
export async function storeAvatar(bytes: Uint8Array, contentType: AvatarMediaType): Promise<string> {
  const name = `${randomUUID()}.${EXTENSIONS[contentType]}`;

  if (blobConfigured()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${BLOB_PREFIX}${name}`, Buffer.from(bytes), {
      access: "public",
      contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: 31536000,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  const root = LOCAL_ROOT();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, name), bytes, { mode: 0o600 });
  return `${LOCAL_PREFIX}${name}`;
}

/**
 * Deletes a photo this module stored. Anything else — a Google profile
 * picture, a URL from before uploads existed — is left alone. Best effort:
 * an orphaned file costs a few kilobytes, a thrown error here would fail a
 * save the user already sees as done.
 */
export async function deleteStoredAvatar(url: string | null): Promise<void> {
  if (!url) return;
  try {
    if (url.startsWith(LOCAL_PREFIX)) {
      const key = url.slice(LOCAL_PREFIX.length);
      if (!isSafeAvatarKey(key)) return;
      await unlink(path.join(LOCAL_ROOT(), key));
      return;
    }
    const parsed = new URL(url);
    if (blobConfigured() && parsed.hostname.endsWith(".blob.vercel-storage.com") && parsed.pathname.startsWith(`/${BLOB_PREFIX}`)) {
      const { del } = await import("@vercel/blob");
      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
  } catch (error) {
    console.error("deleteStoredAvatar failed (left orphaned):", error);
  }
}

/** Only ever `<uuid>.<ext>` — no separators, no traversal. */
const SAFE_KEY = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export function isSafeAvatarKey(key: string): boolean {
  return SAFE_KEY.test(key);
}

/** Reads a locally stored photo back, for the dev route. */
export async function readLocalAvatar(key: string): Promise<{ bytes: Buffer; contentType: AvatarMediaType } | null> {
  if (!isSafeAvatarKey(key)) return null;
  const root = LOCAL_ROOT();
  const target = path.resolve(root, key);
  if (target !== path.join(root, key)) return null;
  try {
    const ext = path.extname(key).slice(1).toLowerCase();
    const contentType: AvatarMediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { bytes: await readFile(target), contentType };
  } catch {
    return null;
  }
}
