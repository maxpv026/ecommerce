import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { sdsArchiveEntries } from "@/lib/sdsDirectory";
import { buildSafetyDataSheet, renderSafetyDataSheet } from "@/lib/sdsPdf";

/**
 * GET /api/documents/sds-archive — every safety data sheet in one ZIP.
 *
 * Built per request from the same list the /compliance/sds rows use
 * (lib/sdsDirectory), so the archive can't hold a sheet the page no longer
 * lists (the old static ZIP still carried R-454B) or miss a released one.
 * A released generated sheet is rendered; everything else is the static
 * file the row's button serves. MANIFEST.txt says which is which.
 *
 * The static files are read from public/ — included in this function's
 * trace by next.config.ts, since a serverless function doesn't otherwise
 * see public/.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await sdsArchiveEntries();
  const files: Record<string, Uint8Array> = {};
  const manifest: string[] = [];

  for (const entry of entries) {
    let data: Uint8Array | null = null;
    let status = entry.status;
    if (entry.source.kind === "generated") {
      const sheet = buildSafetyDataSheet(entry.source.product);
      try {
        if (sheet) data = new Uint8Array(await renderSafetyDataSheet(sheet));
      } catch (error) {
        console.error(`[sds-archive] render failed for ${entry.label}:`, error);
      }
      if (!data) status = "placeholder";
    } else {
      try {
        data = new Uint8Array(await readFile(path.join(process.cwd(), "public", entry.source.path)));
      } catch (error) {
        console.error(`[sds-archive] missing ${entry.source.path}:`, error);
      }
    }
    if (!data) continue;
    files[entry.filename] = data;
    manifest.push(`${entry.label.padEnd(10)} ${entry.filename.padEnd(22)} ${entry.revision.padEnd(24)} ${status === "released" ? "controlled document" : "PLACEHOLDER - not a controlled document"}`);
  }

  if (Object.keys(files).length === 0) return Response.json({ error: "No safety data sheets are available" }, { status: 404 });

  files["MANIFEST.txt"] = strToU8(
    [
      "My Energy - safety data sheets",
      `Generated ${new Date().toISOString().slice(0, 10)}`,
      "",
      ...manifest,
      "",
      "A file marked PLACEHOLDER is not a controlled safety document; request the",
      "manufacturer's SDS from your account manager before relying on it.",
      "",
    ].join("\r\n")
  );

  // PDFs are already compressed; level 0 keeps this fast.
  const zip = zipSync(files, { level: 0 });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": `attachment; filename="My-Energy-SDS-${new Date().toISOString().slice(0, 10)}.zip"`,
      // Same for every viewer (drafts are never included); a release shows up within the hour.
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
