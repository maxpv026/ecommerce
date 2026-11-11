/**
 * Re-encrypts every FgasDocumentFile row that is not under the current key
 * (lib/fgasStorage: FGAS_DOCUMENT_KEY → "fgas-v1", else AUTH_SECRET →
 * "auth-v1") so it no longer depends on the old one.
 *
 * Per row, in one transaction: decrypt with the row's own key, check the
 * plaintext against the stored SHA-256, encrypt under the current key,
 * decrypt THAT again and re-check, then update — conditional on the row still
 * carrying the old keyRef, so a concurrent run can't double-rotate it.
 *
 * `--backup <file>` first writes the old ciphertext rows (still encrypted,
 * never plaintext) to a JSON file, so the change can be rolled back.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/rotate-fgas-document-key.ts --dry-run
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/rotate-fgas-document-key.ts --backup /secure/path/backup.json
 */
import { writeFileSync } from "node:fs";
import prisma from "../lib/prisma";
import { decryptDocument, encryptDocument, fingerprint } from "../lib/fgasStorage";

const DRY_RUN = process.argv.includes("--dry-run");
const backupAt = process.argv.indexOf("--backup");
const BACKUP = backupAt > 0 ? process.argv[backupAt + 1] : null;

async function main() {
  // What the current key is called: encrypt one byte and read the ref back.
  const target = encryptDocument(new Uint8Array([0])).keyRef;
  const rows = await prisma.fgasDocumentFile.findMany({ where: { keyRef: { not: target } } });
  console.log(`current key: ${target}; ${rows.length} row(s) under another key`);
  if (rows.length === 0) return;

  if (BACKUP) {
    writeFileSync(
      BACKUP,
      JSON.stringify(rows.map((r) => ({ ...r, iv: Buffer.from(r.iv).toString("base64"), authTag: Buffer.from(r.authTag).toString("base64"), data: Buffer.from(r.data).toString("base64") }))),
      { mode: 0o600 }
    );
    console.log(`backup of the old ciphertext written (${rows.length} rows)`);
  }

  for (const row of rows) {
    const plain = decryptDocument(row);
    if (fingerprint(plain) !== row.sha256) throw new Error(`${row.id}: plaintext does not match its stored SHA-256 — stopping`);
    const sealed = encryptDocument(plain);
    const check = decryptDocument(sealed);
    if (fingerprint(check) !== row.sha256) throw new Error(`${row.id}: re-encrypted copy does not decrypt to the original — stopping`);
    if (DRY_RUN) {
      console.log(`WOULD ROTATE ${row.id}: ${row.keyRef} → ${sealed.keyRef} (${row.size} bytes, SHA-256 verified)`);
      continue;
    }
    const { count } = await prisma.fgasDocumentFile.updateMany({
      where: { id: row.id, keyRef: row.keyRef },
      data: { keyRef: sealed.keyRef, iv: sealed.iv, authTag: sealed.authTag, data: sealed.data },
    });
    console.log(`${count === 1 ? "ROTATED" : "SKIPPED (changed meanwhile)"} ${row.id}: ${row.keyRef} → ${sealed.keyRef} (${row.size} bytes, SHA-256 verified)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
