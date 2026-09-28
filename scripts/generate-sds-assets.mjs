// Generates the placeholder SDS assets served from /public/sds:
// one PDF per document in lib/sds.ts, plus a ZIP of all of them.
//
//   node scripts/generate-sds-assets.mjs
//
// Everything is written with Node builtins — no PDF or ZIP dependency — so
// the assets are reproducible from source. They are deliberately obvious
// placeholders: each page says so, because a document that looks like a real
// safety data sheet but isn't is worse than no document at all.
//
// Replace the contents of public/sds with the real, controlled documents
// before go-live; the filenames are the contract (lib/sds.ts -> `file`).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";

const OUT_DIR = join(process.cwd(), "public", "sds");

// Mirrors lib/sds.ts. Kept as plain data so this script stays runnable
// without the TypeScript toolchain.
const DOCUMENTS = [
  { file: "R-410A-SDS.pdf", name: "R-410A Premium", cas: "Mixture (75-10-5 / 354-33-6)", revision: "SDS v2.4 · Jan 2026", hazard: "A1 — non-flammable. Asphyxiant in confined spaces." },
  { file: "R-32-SDS.pdf", name: "R-32 Premium", cas: "75-10-5", revision: "SDS v2.1 · Oct 2025", hazard: "A2L — mildly flammable. Keep away from ignition sources." },
  { file: "R-134a-SDS.pdf", name: "R-134a Standard", cas: "811-97-2", revision: "SDS v3.0 · Mar 2026", hazard: "A1 — non-flammable. Asphyxiant in confined spaces." },
  { file: "R-404A-SDS.pdf", name: "R-404A Reclaimed", cas: "Mixture (AHRI-700)", revision: "SDS v1.8 · Aug 2025", hazard: "A1 — non-flammable. Reclaimed to AHRI-700 purity." },
  { file: "R-407C-SDS.pdf", name: "R-407C Service", cas: "Mixture (354-33-6 / 811-97-2)", revision: "SDS v2.2 · Dec 2025", hazard: "A1 — non-flammable. Asphyxiant in confined spaces." },
  { file: "R-454B-SDS.pdf", name: "R-454B Low GWP", cas: "Mixture (75-10-5 / 116-14-3)", revision: "SDS v1.3 · Feb 2026", hazard: "A2L — mildly flammable. Keep away from ignition sources." },
  { file: "R-1234yf-SDS.pdf", name: "R-1234yf", cas: "754-12-1", revision: "SDS v1.6 · Nov 2025", hazard: "A2L — mildly flammable. Keep away from ignition sources." },
];

const ZIP_NAME = "my-energy-sds-all.zip";

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Escapes the three characters that are special inside a PDF string literal. */
const pdfString = (text) => text.replace(/([\\()])/g, "\\$1");

/**
 * A single-page PDF, built by hand. The cross-reference table needs the exact
 * byte offset of every object, so the file is assembled incrementally and the
 * offsets recorded as we go.
 */
function buildPdf(doc) {
  const lines = [
    { size: 20, y: 760, text: doc.name },
    { size: 13, y: 730, text: "Safety Data Sheet (placeholder)" },
    { size: 11, y: 696, text: `CAS: ${doc.cas}` },
    { size: 11, y: 678, text: `Revision: ${doc.revision}` },
    { size: 11, y: 660, text: `Classification: ${doc.hazard}` },
    { size: 11, y: 618, text: "THIS IS NOT A CONTROLLED SAFETY DOCUMENT." },
    { size: 11, y: 600, text: "It is a placeholder shipped with the My Energy storefront so that" },
    { size: 11, y: 582, text: "the download flow can be exercised end to end. Do not rely on it" },
    { size: 11, y: 564, text: "for handling, transport, first aid or disposal decisions." },
    { size: 11, y: 522, text: "For a real emergency in Europe call NCEC on +44 1865 407 333," },
    { size: 11, y: 504, text: "or 112 for anything life-threatening." },
  ];

  const content =
    "BT\n" +
    lines
      .map(({ size, y, text }) => `/F1 ${size} Tf\n1 0 0 1 56 ${y} Tm\n(${pdfString(text)}) Tj`)
      .join("\n") +
    "\nET\n";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // latin1 keeps every byte offset equal to its string index — the "·" and
  // "—" above are written through WinAnsiEncoding, which is single-byte.
  return Buffer.from(pdf, "latin1");
}

// ---------------------------------------------------------------------------
// ZIP (stored, i.e. uncompressed — these files are tiny)
// ---------------------------------------------------------------------------

/** MS-DOS date/time, as ZIP has recorded timestamps since 1980. */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function buildZip(entries, now = new Date()) {
  const { time, day } = dosDateTime(now);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method 0 = stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); // central directory signature
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk number
    dir.writeUInt16LE(0, 36); // internal attrs
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42); // offset of local header
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const entries = DOCUMENTS.map((doc) => {
  const data = buildPdf(doc);
  writeFileSync(join(OUT_DIR, doc.file), data);
  return { name: doc.file, data };
});

const zip = buildZip(entries);
writeFileSync(join(OUT_DIR, ZIP_NAME), zip);

console.log(`Wrote ${entries.length} PDFs to public/sds:`);
for (const e of entries) console.log(`  ${e.name.padEnd(20)} ${e.data.length} bytes`);
console.log(`  ${ZIP_NAME.padEnd(20)} ${zip.length} bytes`);
