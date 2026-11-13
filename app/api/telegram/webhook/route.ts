import { createHash, timingSafeEqual } from "node:crypto";
import { botToken, webhookSecret, type TgUpdate } from "@/lib/telegram/api";
import { handleUpdate } from "@/lib/telegram/bot";

/**
 * POST /api/telegram/webhook — the admin bot's inbox (lib/telegram/bot).
 *
 * Telegram signs every delivery with the secret given to setWebhook, in
 * `X-Telegram-Bot-Api-Secret-Token`. Anything without the right one is 401
 * before a byte of the body is read, compared in constant time. Without a
 * token or secret configured the endpoint is 503 — there's no bot to talk to.
 *
 * Authorization of the *person* (linked admin / allowlisted chat) happens in
 * lib/telegram/access for every update; this route only proves the request
 * came from Telegram. It answers 200 even when the bot ignored the update,
 * or Telegram would keep retrying it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const digest = (v: string) => createHash("sha256").update(v).digest();

export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!botToken() || !secret) return Response.json({ ok: false, error: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });

  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  // Hash both sides first: equal-length buffers, so timingSafeEqual never throws and length leaks nothing.
  if (!timingSafeEqual(digest(given), digest(secret))) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  if (!update || typeof update.update_id !== "number") return Response.json({ ok: false, error: "INVALID_UPDATE" }, { status: 400 });

  try {
    await handleUpdate(update);
  } catch (error) {
    // Logged, not retried: a failing update would otherwise be redelivered forever.
    console.error("[telegram] update failed:", error);
  }
  return Response.json({ ok: true });
}
