import "server-only";

import prisma from "@/lib/prisma";
import { can, effectiveRole, type Permission } from "@/lib/rbac";
import { botToken, esc, sendDocument, sendMessage, type InlineKeyboard } from "@/lib/telegram/api";
import { allowlistedChats } from "@/lib/telegram/access";
import { adminLink, fgasCard, orderCard, returnCard } from "@/lib/telegram/cards";
import type { NotifyEvent } from "@/lib/telegram/linking";

/**
 * Real-time alerts to the admins' Telegram chats, with working buttons.
 *
 * Recipients: every linked admin (SUPER_ADMIN / ADMIN, not locked) who has
 * alerts on and this event ticked, and whose role may act on it — plus the
 * allowlisted chats (TELEGRAM_ADMIN_CHAT_IDS / the legacy
 * TELEGRAM_ADMIN_CHAT_ID), which get everything. Best-effort by design:
 * nothing here throws, and without TELEGRAM_BOT_TOKEN it does nothing at all.
 */

const PERMISSION: Record<NotifyEvent, Permission> = {
  order: "orders.manage",
  payment: "orders.manage",
  fgas: "users.fgas",
  returns: "inventory.stock",
  support: "support",
};

export async function recipients(event: NotifyEvent): Promise<string[]> {
  const linked = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, telegramNotificationsEnabled: true, telegramNotifyEvents: { has: event }, lockedAt: null },
    select: { telegramChatId: true, email: true, role: true },
  });
  const chats = linked.filter((u) => can(effectiveRole(u.email, u.role), PERMISSION[event])).map((u) => u.telegramChatId!);
  return [...new Set([...chats, ...allowlistedChats()])];
}

async function broadcast(event: NotifyEvent, card: { text: string; keyboard: InlineKeyboard } | null, label: string): Promise<{ sent: number; messages: Array<{ chatId: string; messageId: number }> }> {
  const out = { sent: 0, messages: [] as Array<{ chatId: string; messageId: number }> };
  if (!card || !botToken()) return out;
  try {
    for (const chatId of await recipients(event)) {
      const r = await sendMessage(chatId, card.text, { keyboard: card.keyboard });
      if (r.ok) {
        out.sent += 1;
        out.messages.push({ chatId, messageId: r.result.message_id });
      } else console.warn(`[telegram] ${label} → ${chatId}: ${r.detail}`);
    }
  } catch (error) {
    console.error(`[telegram] ${label} failed:`, error);
  }
  return out;
}

/** 📦 A new order (from /api/checkout). */
export const alertNewOrder = async (orderId: string) => broadcast("order", await orderCard(orderId, "📦 Нове замовлення"), `order ${orderId}`);

/** 💶 The buyer says the transfer is on its way (/checkout/success). */
export const alertPaymentReported = async (orderId: string) => broadcast("payment", await orderCard(orderId, "💶 Клієнт повідомив про оплату SEPA"), `payment ${orderId}`);

/** 🛡 A certificate was uploaded and read (the document goes first, then the card with buttons). */
export async function alertFgasReview(userId: string, input: { verdict: string; reason?: string | null; document?: { bytes: Uint8Array; contentType: string } }) {
  const head = input.verdict === "PENDING_REVIEW" ? "🛡 Новий сертифікат F-Gas на перевірку" : input.verdict === "VERIFIED" ? "🛡 Сертифікат F-Gas підтверджено автоматично" : "🛡 Сертифікат F-Gas відхилено автоматично";
  const card = await fgasCard(userId, head);
  if (card && input.reason) card.text += `\n🤖 ${esc(input.reason)}`;
  if (card && input.document && botToken()) {
    const ext = input.document.contentType === "application/pdf" ? "pdf" : (input.document.contentType.split("/")[1] ?? "bin");
    for (const chatId of await recipients("fgas").catch(() => [])) {
      const r = await sendDocument(chatId, { bytes: input.document.bytes, filename: `fgas-certificate.${ext}`, contentType: input.document.contentType }, esc(head));
      if (!r.ok) console.warn(`[telegram] fgas document → ${chatId}: ${r.detail}`);
    }
  }
  return broadcast("fgas", card, `fgas ${userId}`);
}

/** ♻️ A cylinder return request. */
export const alertCylinderReturn = async (returnId: string) => broadcast("returns", await returnCard(returnId, "♻️ Заявка на повернення порожніх балонів"), `return ${returnId}`);

/**
 * 💬 A customer message for the team. Each sent copy is remembered, so an
 * admin who simply replies to it in Telegram answers that conversation.
 */
export async function alertSupportMessage(sessionId: string, text: string | null) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { id: true, user: { select: { name: true, email: true, companyName: true } } } });
  if (!session) return { sent: 0, messages: [] };
  const who = session.user ? [session.user.name, session.user.companyName, session.user.email].filter(Boolean).join(" · ") : "Гість";
  const link = adminLink(`/admin/support/${session.id}`);
  const card = {
    text: [`💬 <b>Нове повідомлення у підтримку</b>`, `👤 ${esc(who)}`, "", text ? `«${esc(text.slice(0, 1500))}»` : "<i>Клієнт попросив зв'язатися з людиною.</i>", "", "<i>Відповідайте на це повідомлення (Reply) — відповідь з'явиться у чаті на сайті.</i>"].join("\n"),
    keyboard: [[{ text: "✍️ Відповісти клієнту", callback_data: `sr:${session.id}` }], ...(link ? [[{ text: "🌐 Відкрити чат в адмінці", url: link }]] : [])] as InlineKeyboard,
  };
  const out = await broadcast("support", card, `support ${sessionId}`);
  if (out.messages.length) {
    await prisma.telegramMessageRef
      .createMany({ data: out.messages.map((m) => ({ chatId: m.chatId, messageId: m.messageId, kind: "support", refId: session.id })), skipDuplicates: true })
      .catch((error) => console.error("[telegram] could not remember support messages:", error));
  }
  return out;
}
