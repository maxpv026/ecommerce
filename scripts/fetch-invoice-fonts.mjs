#!/usr/bin/env node
/**
 * Fetches the TTFs the invoice PDF renders with.
 *
 * @react-pdf/renderer can only use the 14 standard PDF fonts out of the box,
 * and those are Latin-1: a customer called "Пивоваров" printed as
 * "82>20@>2" on the invoice. Noto Sans covers Latin, Cyrillic and Greek in
 * one face, so one registration fixes every European locale this shop sells
 * into.
 *
 * Run after a fresh clone if the files are not committed:
 *   node scripts/fetch-invoice-fonts.mjs
 *
 * CJK (ko, zh) is deliberately NOT covered — that needs a separate ~5 MB
 * face. See the note in lib/pdf.ts.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans";
const DEST = join(process.cwd(), "public", "fonts");
const FILES = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"];
/** A sane floor: the real files are ~560 KB, an error page is a few hundred bytes. */
const MIN_BYTES = 100_000;

await mkdir(DEST, { recursive: true });

for (const file of FILES) {
  const target = join(DEST, file);
  try {
    const existing = await stat(target);
    if (existing.size >= MIN_BYTES) {
      console.log(`✓ ${file} already present (${existing.size} bytes)`);
      continue;
    }
  } catch {
    // Not there yet — fall through and fetch.
  }

  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) {
    console.error(`✗ ${file}: HTTP ${res.status} from ${BASE}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // A CDN can answer 200 with an HTML error page; a TTF starts with one of
  // these four signatures. Writing that to disk would fail far later, inside
  // fontkit, with a much less obvious message.
  const sig = buf.subarray(0, 4);
  const valid = [Buffer.from([0, 1, 0, 0]), Buffer.from("true"), Buffer.from("ttcf"), Buffer.from("OTTO")];
  if (buf.length < MIN_BYTES || !valid.some((v) => sig.equals(v))) {
    console.error(`✗ ${file}: not a TrueType file (${buf.length} bytes, sig ${sig.toString("hex")})`);
    process.exitCode = 1;
    continue;
  }

  await writeFile(target, buf);
  console.log(`✓ ${file} (${buf.length} bytes)`);
}
