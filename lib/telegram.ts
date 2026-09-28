import "server-only";

/**
 * Admin notifications over Telegram.
 *
 * This is a courtesy channel, not part of the transaction: an order that is
 * already committed to the database must never be rolled back or reported as
 * failed because a notification didn't send. Every function here therefore
 * resolves rather than throws, and says in its return value what happened so
 * the caller can log it.
 */

const API_ROOT = "https://api.telegram.org";

/** Telegram rejects anything over 4096 characters. */
const MAX_MESSAGE_LENGTH = 4096;

/** Telegram caps a media caption at 1024 characters. */
const MAX_CAPTION_LENGTH = 1024;

/** Don't let a hanging request keep a serverless invocation alive. */
const TIMEOUT_MS = 8000;
/** Uploading a 5 MB certificate needs longer than a text message. */
const UPLOAD_TIMEOUT_MS = 20_000;

export type TelegramResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "http" | "network"; detail: string };

/**
 * Escapes the five characters Telegram's classic Markdown parser treats as
 * formatting. Order matters: the backslash has to go first, or it would
 * escape the escapes added after it.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/([\\_*`[])/g, "\\$1");
}

/**
 * Sends a message to the admin chat.
 *
 * Returns `unconfigured` rather than throwing when the token or chat id is
 * missing, so a deployment without Telegram set up still takes orders — it
 * just doesn't ping anyone. The caller logs it.
 */
export async function sendTelegramNotification(message: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (!token || !chatId) {
    return {
      ok: false,
      reason: "unconfigured",
      detail: "TELEGRAM_BOT_TOKEN and/or TELEGRAM_ADMIN_CHAT_ID are not set",
    };
  }

  const text =
    message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : message;

  try {
    const response = await fetch(`${API_ROOT}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      // Telegram puts the useful part ("chat not found", "bot was blocked")
      // in the body, not the status line.
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        reason: "http",
        detail: `Telegram answered ${response.status}: ${body.slice(0, 300)}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "network",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The certificate itself, sent to the admin chat so it can be reviewed from
 * a phone without opening the back office.
 *
 * Takes either a URL Telegram can fetch, or the bytes themselves. The bytes
 * form is not a convenience: local development stores certificates outside
 * the web root behind an authenticated route, so there is no URL Telegram
 * could ever fetch — and making one public to satisfy Telegram would expose
 * every buyer's compliance document. Uploading the bytes keeps storage
 * private in every environment.
 *
 * Images go to `sendPhoto` so they preview inline in the chat; PDFs go to
 * `sendDocument`.
 */
export async function sendTelegramDocument(
  source: string | { bytes: Uint8Array; filename: string; contentType: string },
  caption: string
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (!token || !chatId) {
    return {
      ok: false,
      reason: "unconfigured",
      detail: "TELEGRAM_BOT_TOKEN and/or TELEGRAM_ADMIN_CHAT_ID are not set",
    };
  }

  const contentType = typeof source === "string" ? guessContentType(source) : source.contentType;
  const asPhoto = contentType.startsWith("image/");
  const method = asPhoto ? "sendPhoto" : "sendDocument";
  const field = asPhoto ? "photo" : "document";

  // Captions are capped well below the message limit.
  const text = caption.length > MAX_CAPTION_LENGTH ? `${caption.slice(0, MAX_CAPTION_LENGTH - 1)}…` : caption;

  let body: BodyInit;
  let headers: HeadersInit | undefined;

  if (typeof source === "string") {
    body = JSON.stringify({ chat_id: chatId, [field]: source, caption: text, parse_mode: "Markdown" });
    headers = { "Content-Type": "application/json" };
  } else {
    // multipart: fetch sets the boundary itself, so no Content-Type here.
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("caption", text);
    form.set("parse_mode", "Markdown");
    form.set(field, new Blob([new Uint8Array(source.bytes)], { type: contentType }), source.filename);
    body = form;
  }

  try {
    const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: "http", detail: `Telegram answered ${response.status}: ${detail.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "network", detail: error instanceof Error ? error.message : String(error) };
  }
}

function guessContentType(url: string): string {
  const extension = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "application/pdf";
}

/**
 * Fire-and-forget wrapper: never rejects, logs whatever went wrong.
 *
 * Awaiting this is still the right thing to do inside a serverless handler —
 * a promise left dangling when the response is returned may simply be killed
 * — but it costs the caller nothing but latency, and never an error.
 */
export async function notifyAdmin(message: string, context: string): Promise<TelegramResult> {
  return report(await sendTelegramNotification(message), context);
}

/**
 * Same contract as notifyAdmin, for the document send: never rejects, logs
 * whatever went wrong. The decision is committed to the database before this
 * is called and stands whether or not the send lands — but for an
 * auto-approval this chat copy is the only human-visible record, so the
 * caller logs a failure as an audit gap rather than shrugging it off.
 */
export async function notifyAdminWithDocument(
  source: string | { bytes: Uint8Array; filename: string; contentType: string },
  caption: string,
  context: string
): Promise<TelegramResult> {
  return report(await sendTelegramDocument(source, caption), context);
}

function report(result: TelegramResult, context: string): TelegramResult {
  if (!result.ok) {
    const level = result.reason === "unconfigured" ? console.warn : console.error;
    level(`[telegram] ${context}: ${result.detail}`);
  }
  return result;
}
