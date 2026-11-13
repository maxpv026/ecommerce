import "server-only";

/**
 * The Telegram Bot API, as the admin bot uses it (HTML formatting, inline
 * keyboards, documents, webhook management). Every call goes through `call`:
 *
 *   • no TELEGRAM_BOT_TOKEN → { ok: false, reason: "unconfigured" }, never a
 *     throw — alerts are best-effort and the shop runs without a bot;
 *   • TELEGRAM_API_BASE redirects every call (tests run a local mock; the
 *     real bot is never reached from a test);
 *   • 8 s timeout, the token never appears in a log line.
 */

const TIMEOUT_MS = 8000;
const MAX_TEXT = 4096;
const MAX_CAPTION = 1024;

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
export const webhookSecret = () => process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
const apiBase = () => process.env.TELEGRAM_API_BASE?.trim().replace(/\/+$/, "") || "https://api.telegram.org";

export type TgResult<T> = { ok: true; result: T } | { ok: false; reason: "unconfigured" | "http" | "network"; detail: string };

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export type InlineKeyboard = InlineButton[][];
export interface ReplyKeyboard {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  is_persistent?: boolean;
}

/** HTML parse mode: only &, < and > are special. */
export const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call<T>(method: string, body: Record<string, unknown> | FormData): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, reason: "unconfigured", detail: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const isForm = body instanceof FormData;
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!res.ok || !json?.ok) return { ok: false, reason: "http", detail: `${method}: ${res.status} ${json?.description ?? ""}`.trim() };
    return { ok: true, result: json.result as T };
  } catch (error) {
    return { ok: false, reason: "network", detail: `${method}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export interface SentMessage {
  message_id: number;
  chat: { id: number | string };
}

export function sendMessage(chatId: string | number, text: string, opts: { keyboard?: InlineKeyboard; reply?: ReplyKeyboard; replyTo?: number } = {}) {
  return call<SentMessage>("sendMessage", {
    chat_id: chatId,
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : opts.reply ? { reply_markup: opts.reply } : {}),
    ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}),
  });
}

export function editMessage(chatId: string | number, messageId: number, text: string, keyboard?: InlineKeyboard) {
  return call<SentMessage | true>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export function answerCallback(callbackId: string, text?: string, alert = false) {
  return call<true>("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200), show_alert: alert } : {}) });
}

export function sendDocument(chatId: string | number, file: { bytes: Uint8Array; filename: string; contentType: string }, caption: string) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption.length > MAX_CAPTION ? `${caption.slice(0, MAX_CAPTION - 1)}…` : caption);
  form.append("parse_mode", "HTML");
  form.append("document", new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.filename);
  return call<SentMessage>("sendDocument", form);
}

export const getMe = () => call<{ id: number; username?: string; first_name: string }>("getMe", {});
export const getWebhookInfo = () => call<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>("getWebhookInfo", {});
export const setWebhook = (url: string, secret: string) =>
  call<true>("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
export const deleteWebhook = () => call<true>("deleteWebhook", { drop_pending_updates: false });
export const getUpdates = (offset: number, timeout = 25) => call<TgUpdate[]>("getUpdates", { offset, timeout, allowed_updates: ["message", "callback_query"] });

// ── Incoming updates (the subset the bot reads) ──

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}
export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number };
}
export interface TgCallback {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}
