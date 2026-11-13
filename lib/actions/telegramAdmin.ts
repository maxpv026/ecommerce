"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin/permissions";
import { siteOrigin } from "@/lib/siteUrl";
import { botToken, esc, getMe, sendMessage, setWebhook, webhookSecret } from "@/lib/telegram/api";
import { issueLink, NOTIFY_EVENTS, unlink } from "@/lib/telegram/linking";

/**
 * /admin/telegram — pairing this admin's Telegram, their alert preferences,
 * a test message, and (owner only) registering the webhook. Every action
 * re-checks the caller: "telegram.link" (SUPER_ADMIN, ADMIN), and
 * "diagnostics" for the webhook.
 */

type Failure = { ok: false; code: "FORBIDDEN" | "NOT_CONFIGURED" | "NOT_LINKED" | "FAILED" | "NOT_HTTPS"; detail?: string };

async function me() {
  const session = await auth();
  return requirePermission(session?.user?.id, "telegram.link");
}

function refresh() {
  revalidatePath("/[locale]/admin/telegram", "page");
}

export async function createTelegramLink(): Promise<{ ok: true; deepLink: string | null; code: string; expiresAt: string; botUsername: string | null } | Failure> {
  const who = await me();
  if (!who.ok) return { ok: false, code: "FORBIDDEN" };
  if (!botToken()) return { ok: false, code: "NOT_CONFIGURED" };
  const bot = await getMe();
  const { token, code, expiresAt } = await issueLink(who.value.id);
  const username = bot.ok ? (bot.result.username ?? null) : null;
  return { ok: true, deepLink: username ? `https://t.me/${username}?start=${token}` : null, code, expiresAt: expiresAt.toISOString(), botUsername: username };
}

export async function unlinkTelegram(): Promise<{ ok: true } | Failure> {
  const who = await me();
  if (!who.ok) return { ok: false, code: "FORBIDDEN" };
  await unlink(who.value.id);
  refresh();
  return { ok: true };
}

const Prefs = z.object({ enabled: z.boolean(), events: z.array(z.enum(NOTIFY_EVENTS)).max(NOTIFY_EVENTS.length) });

export async function saveTelegramPrefs(raw: unknown): Promise<{ ok: true } | Failure> {
  const who = await me();
  if (!who.ok) return { ok: false, code: "FORBIDDEN" };
  const parsed = Prefs.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "FAILED" };
  await prisma.user.update({ where: { id: who.value.id }, data: { telegramNotificationsEnabled: parsed.data.enabled, telegramNotifyEvents: [...new Set(parsed.data.events)] } });
  refresh();
  return { ok: true };
}

export async function sendTelegramTest(): Promise<{ ok: true } | Failure> {
  const who = await me();
  if (!who.ok) return { ok: false, code: "FORBIDDEN" };
  if (!botToken()) return { ok: false, code: "NOT_CONFIGURED" };
  const row = await prisma.user.findUnique({ where: { id: who.value.id }, select: { telegramChatId: true, name: true } });
  if (!row?.telegramChatId) return { ok: false, code: "NOT_LINKED" };
  const r = await sendMessage(row.telegramChatId, `✅ <b>Тестове повідомлення</b>\nБот My Energy підключено до акаунта ${esc(row.name ?? who.value.email ?? "")}. Сповіщення працюють.`);
  return r.ok ? { ok: true } : { ok: false, code: "FAILED", detail: r.detail };
}

export async function registerTelegramWebhook(): Promise<{ ok: true; url: string } | Failure> {
  const session = await auth();
  const owner = await requirePermission(session?.user?.id, "diagnostics");
  if (!owner.ok) return { ok: false, code: "FORBIDDEN" };
  const secret = webhookSecret();
  if (!botToken() || !secret) return { ok: false, code: "NOT_CONFIGURED" };
  const url = `${siteOrigin()}/api/telegram/webhook`;
  // Telegram only delivers to https; the TELEGRAM_API_BASE mock in tests accepts anything.
  if (!url.startsWith("https://") && !process.env.TELEGRAM_API_BASE) return { ok: false, code: "NOT_HTTPS", detail: url };
  const r = await setWebhook(url, secret);
  refresh();
  return r.ok ? { ok: true, url } : { ok: false, code: "FAILED", detail: r.detail };
}
