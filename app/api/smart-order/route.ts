import { MAX_TEXT_CHARS } from "@/lib/smartOrder/extract";
import { MAX_FILE_BYTES, fileToText } from "@/lib/smartOrder/fileText";
import { runSmartOrder, type SmartOrderErrorCode, type SmartOrderResponse } from "@/lib/smartOrder/run";

/**
 * POST /api/smart-order — Smart Bulk Order: messy text or a file → a
 * stock-verified, priced order preview. Nothing is added to a cart here;
 * the buyer reviews the lines and the widget adds the ones they keep.
 *
 *   application/json      { "text": "потрібно 35 кг 32-го…" }
 *   multipart/form-data   file=<.txt|.csv|.xlsx|.pdf ≤ 2 MB> [text=<extra notes>]
 *
 *   200 { ok: true, lines: SolvedLine[], removedLines }
 *   4xx { ok: false, code }
 *
 * Public (the cart works for guests), and every request costs a model call:
 * proxy.ts rate-limits this path per address. Prices in the response come
 * from the database; the cart treats them as display snapshots, and checkout
 * re-reads them anyway — nothing a client sends here or later can set one.
 */

export const runtime = "nodejs";
// A PDF is transcribed before it is read: two model calls.
export const maxDuration = 60;

/** Multipart overhead on top of the file itself. */
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;

const STATUS: Record<SmartOrderErrorCode, number> = {
  INVALID_INPUT: 400,
  TEXT_TOO_LONG: 413,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE: 415,
  FILE_UNREADABLE: 422,
  NOTHING_FOUND: 422,
  NOT_CONFIGURED: 503,
  UNAVAILABLE: 502,
};

const reply = (body: SmartOrderResponse) => Response.json(body, { status: body.ok ? 200 : STATUS[body.code], headers: { "Cache-Control": "no-store" } });

/** The body, refusing to buffer past `limit` whatever Content-Length claims. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (!body) return reply({ ok: false, code: "FILE_TOO_LARGE" });

  let text = "";
  if (type.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await new Response(body as BodyInit, { headers: { "content-type": type } }).formData();
    } catch {
      return reply({ ok: false, code: "INVALID_INPUT" });
    }
    const notes = form.get("text");
    const file = form.get("file");
    if (typeof notes === "string") text = notes;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) return reply({ ok: false, code: "FILE_TOO_LARGE" });
      const read = await fileToText(file);
      if (!read.ok) return reply(read);
      text = text ? `${text}\n${read.text}` : read.text;
    }
  } else if (type.startsWith("application/json")) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(body)) as { text?: unknown };
      if (typeof parsed?.text !== "string") return reply({ ok: false, code: "INVALID_INPUT" });
      text = parsed.text;
    } catch {
      return reply({ ok: false, code: "INVALID_INPUT" });
    }
  } else {
    return reply({ ok: false, code: "INVALID_INPUT" });
  }

  // Checked again after sanitising (which only shortens), but refuse the
  // obviously oversized before any work at all.
  if (text.length > MAX_TEXT_CHARS * 2) return reply({ ok: false, code: "TEXT_TOO_LONG" });
  return reply(await runSmartOrder(text));
}
