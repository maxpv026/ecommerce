import "server-only";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Permission } from "@/lib/rbac";
import { LISTED } from "@/lib/productFamily";
import { gasMarkForProduct } from "@/lib/productMedia";
import { normalizeMark } from "@/lib/gasMarks";
import { saveFulfilment, advanceShipment } from "@/lib/shipping/update";
import { sendOrderConfirmation, sendOrderStatusEmail } from "@/lib/orderEmails";
import { approveFGasCertificate, rejectFGasCertificate } from "@/lib/fgasReview";
import { cancelOrderAndRelease, settleOrderPayment } from "@/lib/admin/orderOps";
import { applyStockChange } from "@/lib/admin/stock";
import { postAgentReply } from "@/lib/admin/supportOps";
import { acceptCylinderReturn, receiveCylinderReturn, setAccountLocked, setAnnouncement, setProductPrice } from "@/lib/admin/opsExtra";
import { answerCallback, editMessage, esc, sendMessage, type InlineKeyboard, type ReplyKeyboard, type TgCallback, type TgMessage, type TgUpdate } from "@/lib/telegram/api";
import { actorFor, allowed, type BotActor } from "@/lib/telegram/access";
import { linkByCode, linkByToken } from "@/lib/telegram/linking";
import { eur, fgasCard, orderCard, productCard, returnCard, SHIP_CODES, shipTarget, STAGE_UK, userCard, type ShipCode } from "@/lib/telegram/cards";

/**
 * The admin bot: one entry point (handleUpdate) for every update Telegram
 * delivers, from the webhook (app/api/telegram/webhook) or the dev poller
 * (scripts/telegram-dev-poll.ts).
 *
 *   • Retried deliveries are dropped (TelegramUpdate keeps handled ids).
 *   • Anyone who isn't a linked admin / allowlisted chat gets one locked
 *     message and no data — except /start <token> and /link <code>, which is
 *     how an admin pairs a new chat.
 *   • Every action re-checks the actor's permission against the database
 *     (lib/telegram/access `allowed`), exactly as /admin's server actions do.
 *   • Multi-step inputs (tracking number, exact stock, price, rejection
 *     reason, support reply, announcement, user search) live in
 *     TelegramChatState and expire after 15 minutes.
 *
 * Callback data: o[p|s|d|x|X|i|v|n] orders · f[v|r|R|c] F-Gas · r[a|g] returns ·
 * p[g|v|a|z|s|p] products · u[l|v|k|u|s] users · sr support · an announcement ·
 * m menus · ol order lists · x cancel input. Ids are cuids; all ≤ 64 bytes.
 */

const STATE_TTL_MS = 15 * 60 * 1000;
const MENU: ReplyKeyboard = {
  keyboard: [[{ text: "📊 Огляд та Каса" }, { text: "📦 Замовлення" }], [{ text: "🛡 Користувачі та F-Gas" }, { text: "🧪 Склад та Ціни" }], [{ text: "📢 Оголошення" }]],
  resize_keyboard: true,
  is_persistent: true,
};
const LOCKED = "🔒 Доступ закрито. Цей бот керує магазином і доступний лише адміністраторам.";
const GUARD_TEXT = { UNAUTHENTICATED: "Акаунт не знайдено — підключіть бота заново в /admin.", FORBIDDEN: "⛔ Недостатньо прав для цієї дії.", TWO_FACTOR_REQUIRED: "🔐 Увімкніть двофакторну автентифікацію в профілі на сайті — без неї дії адміністратора вимкнені." } as const;
const CANCEL_ROW = [{ text: "✖️ Скасувати", callback_data: "x" }];
const GAS_GROUPS = [
  { key: "R32", label: "R-32" },
  { key: "R134A", label: "R-134a" },
  { key: "R410A", label: "R-410A" },
  { key: "R404A", label: "R-404A" },
  { key: "R1234YF", label: "R-1234yf" },
  { key: "R290", label: "R-290" },
  { key: "EQ", label: "Обладнання" },
] as const;

type Reply = { text: string; keyboard?: InlineKeyboard };

// ── State ──

async function setState(chatId: string, state: string, payload: Prisma.InputJsonValue) {
  await prisma.telegramChatState.upsert({
    where: { chatId },
    create: { chatId, state, payload, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
    update: { state, payload, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  });
}
async function takeState(chatId: string): Promise<{ state: string; payload: Record<string, string> } | null> {
  const row = await prisma.telegramChatState.findUnique({ where: { chatId } });
  if (!row?.state || !row.expiresAt || row.expiresAt < new Date()) return null;
  await prisma.telegramChatState.update({ where: { chatId }, data: { state: null, payload: undefined, expiresAt: null } });
  return { state: row.state, payload: (row.payload ?? {}) as Record<string, string> };
}
const clearState = (chatId: string) => prisma.telegramChatState.updateMany({ where: { chatId }, data: { state: null, expiresAt: null } });

async function guard(actor: BotActor, permission: Permission): Promise<string | null> {
  const g = await allowed(actor, permission);
  return g.ok ? null : GUARD_TEXT[g.code];
}

// ── Entry ──

export async function handleUpdate(update: TgUpdate): Promise<void> {
  // Telegram retries a delivery it thinks failed: handle each update once.
  try {
    await prisma.telegramUpdate.create({ data: { updateId: BigInt(update.update_id) } });
  } catch {
    return;
  }
  if (update.callback_query) return onCallback(update.callback_query);
  if (update.message) return onMessage(update.message);
}

async function onMessage(m: TgMessage): Promise<void> {
  const chatId = String(m.chat.id);
  const text = (m.text ?? "").trim();
  const username = m.from?.username ?? null;

  // Pairing works before the chat is known.
  const start = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{20,64})$/);
  const link = text.match(/^\/link(?:@\w+)?\s+(\d[\d\s]{4,8})$/);
  if ((start || link) && m.chat.type === "private" && m.from) {
    const r = start ? await linkByToken(start[1]!, String(m.from.id), username) : await linkByCode(link![1]!, String(m.from.id), username);
    if (r.ok) {
      await sendMessage(chatId, `✅ <b>Підключено.</b> Вітаємо, ${esc(r.name)}! Тепер ви отримуватимете сповіщення та можете керувати магазином тут.`, { reply: MENU });
    } else {
      const why = { INVALID: "Посилання або код недійсні.", EXPIRED: "Термін дії посилання минув — згенеруйте нове в /admin.", NOT_ADMIN: LOCKED, TOO_MANY: "Забагато спроб. Спробуйте пізніше.", LOCKED: LOCKED }[r.code];
      await sendMessage(chatId, why);
    }
    return;
  }

  const actor = await actorFor(m.from?.id, chatId);
  if (!actor) {
    await sendMessage(chatId, LOCKED);
    return;
  }

  // A reply to a forwarded support message answers that conversation.
  if (m.reply_to_message && text) {
    const ref = await prisma.telegramMessageRef.findUnique({ where: { chatId_messageId: { chatId, messageId: m.reply_to_message.message_id } } });
    if (ref?.kind === "support") {
      await sendMessage(chatId, await supportReply(actor, ref.refId, text));
      return;
    }
  }

  if (text && !text.startsWith("/") && !MENU.keyboard.flat().some((b) => b.text === text)) {
    const pending = await takeState(chatId);
    if (pending) {
      const reply = await onInput(actor, pending.state, pending.payload, text);
      await sendMessage(chatId, reply.text, { keyboard: reply.keyboard });
      return;
    }
  }

  const cmd = text.split(/\s+/)[0]?.replace(/@\w+$/, "") ?? "";
  const route: Record<string, () => Promise<Reply>> = {
    "/stats": () => statsScreen(actor),
    "📊 Огляд та Каса": () => statsScreen(actor),
    "/orders": () => ordersScreen(actor, "a"),
    "📦 Замовлення": () => ordersScreen(actor, "a"),
    "/users": () => usersScreen(actor, "p"),
    "🛡 Користувачі та F-Gas": () => usersScreen(actor, "p"),
    "/inventory": () => inventoryScreen(actor),
    "🧪 Склад та Ціни": () => inventoryScreen(actor),
    "/broadcast": () => announcementScreen(actor),
    "📢 Оголошення": () => announcementScreen(actor),
  };
  const screen = route[cmd] ?? route[text];
  if (screen) {
    await clearState(chatId);
    const r = await screen();
    await sendMessage(chatId, r.text, { keyboard: r.keyboard });
    return;
  }
  // /start, /menu, /admin, /help, anything else: the menu.
  await sendMessage(
    chatId,
    `🧊 <b>My Energy · керування</b>\nВи увійшли як ${esc(actor.name)} (${esc(actor.role)}).\nОберіть розділ нижче або: /stats · /orders · /users · /inventory · /broadcast`,
    { reply: MENU }
  );
}

// ── Inputs (multi-step) ──

async function onInput(actor: BotActor, state: string, p: Record<string, string>, text: string): Promise<Reply> {
  switch (state) {
    case "tracking": {
      const tracking = text.replace(/\s+/g, "").toUpperCase();
      return ship(actor, p.orderId!, p.code as ShipCode, tracking);
    }
    case "stock": {
      const n = Number(text.replace(/\s+/g, ""));
      if (!Number.isInteger(n) || n < 0) {
        await setState(actor.chatId, "stock", p);
        return { text: "Введіть ціле число від 0.", keyboard: [CANCEL_ROW] };
      }
      return stockChange(actor, p.productId!, n);
    }
    case "price": {
      const v = Number(text.replace(",", ".").replace(/[^\d.]/g, ""));
      const denied = await guard(actor, "inventory.catalog");
      if (denied) return { text: denied };
      const r = await setProductPrice(p.productId!, v);
      if (!r.ok) {
        await setState(actor.chatId, "price", p);
        return { text: r.error, keyboard: [CANCEL_ROW] };
      }
      const card = await productCard(p.productId!, actor.role);
      return { text: `💶 Ціну ${esc(r.sku)} змінено: ${eur(r.before)} → <b>${eur(r.after)}</b>/кг. Точку додано в історію цін /hub.\n\n${card?.text ?? ""}`, keyboard: card?.keyboard };
    }
    case "reject":
      return fgasReject(actor, p.userId!, text);
    case "support":
      return { text: await supportReply(actor, p.sessionId!, text) };
    case "announce": {
      const denied = await guard(actor, "broadcasts");
      if (denied) return { text: denied };
      const r = await setAnnouncement({ text, active: true }, actor.userId);
      return r.ok ? announcementScreen(actor, "📢 Оголошення опубліковано на сайті.") : { text: r.error };
    }
    case "usersearch":
      return usersScreen(actor, "s", text);
    default:
      return { text: "Дію скасовано." };
  }
}

// ── Callbacks ──

async function onCallback(cb: TgCallback): Promise<void> {
  const chatId = cb.message ? String(cb.message.chat.id) : String(cb.from.id);
  const actor = await actorFor(cb.from.id, chatId);
  if (!actor) {
    await answerCallback(cb.id, LOCKED, true);
    return;
  }
  const [op = "", id = "", arg = ""] = (cb.data ?? "").split(":");
  let reply: Reply | null = null;
  let toast: string | undefined;
  let fresh = false; // send as a new message instead of editing the card

  try {
    switch (op) {
      case "x":
        await clearState(chatId);
        toast = "Скасовано";
        break;
      case "m":
        reply = id === "s" ? await statsScreen(actor) : id === "o" ? await ordersScreen(actor, "a") : id === "u" ? await usersScreen(actor, "p") : id === "i" ? await inventoryScreen(actor) : await announcementScreen(actor);
        break;
      case "ol":
        reply = await ordersScreen(actor, id as "a" | "t" | "r");
        break;
      case "ov":
        reply = await orderReply(actor, id);
        break;
      case "op": {
        const denied = await guard(actor, "orders.manage");
        if (denied) toast = denied;
        else {
          const r = await settleOrderPayment(id);
          refreshOrder(id);
          toast = r.ok ? "✅ Оплату підтверджено, клієнту надіслано лист" : r.error;
          reply = await orderReply(actor, id);
        }
        break;
      }
      case "os": {
        const denied = await guard(actor, "orders.manage");
        if (denied) {
          toast = denied;
          break;
        }
        const code = arg as ShipCode;
        if (!(code in SHIP_CODES)) break;
        const t = shipTarget(code);
        await setState(chatId, "tracking", { orderId: id, code });
        fresh = true;
        reply = {
          text: t.needsTracking ? "🚚 Надішліть номер відстеження DHL (тільки цифри й літери)." : `🚚 ${code === "PIC" ? "Самовивіз" : code === "OWN" ? "Власний ADR" : "DB Schenker"}: надішліть номер відстеження / CMR або відправте без номера.`,
          keyboard: [...(t.needsTracking ? [] : [[{ text: "➡️ Без номера", callback_data: `on:${id}:${code}` }]]), CANCEL_ROW],
        };
        break;
      }
      case "on": {
        await clearState(chatId);
        reply = await ship(actor, id, arg as ShipCode, null);
        break;
      }
      case "od": {
        const denied = await guard(actor, "orders.manage");
        if (denied) toast = denied;
        else {
          const r = await advanceShipment(id, { stage: "DELIVERED" }, "admin");
          if (r.ok) {
            const email = r.value.email;
            if (email) after(() => sendOrderStatusEmail(id, email));
            refreshOrder(id);
            toast = "✅ Позначено доставленим";
          } else toast = `Не вдалося: ${r.code}`;
          reply = await orderReply(actor, id);
        }
        break;
      }
      case "ox":
        reply = { text: "Скасувати це замовлення? Резерв повернеться на склад, рахунок буде анульовано.", keyboard: [[{ text: "Так, скасувати", callback_data: `oX:${id}` }, { text: "Ні", callback_data: `ov:${id}` }]] };
        break;
      case "oX": {
        const denied = await guard(actor, "orders.manage");
        if (denied) toast = denied;
        else {
          const r = await cancelOrderAndRelease(id);
          refreshOrder(id);
          toast = r.ok ? "Замовлення скасовано" : r.error;
          reply = await orderReply(actor, id);
        }
        break;
      }
      case "oi": {
        const denied = await guard(actor, "orders.manage");
        if (denied) toast = denied;
        else {
          let pdf: Buffer | null = null;
          try {
            const { generateInvoicePdfBuffer } = await import("@/lib/pdf");
            pdf = await generateInvoicePdfBuffer(id);
          } catch (error) {
            console.error("[telegram] invoice PDF failed:", error);
          }
          const sent = await sendOrderConfirmation(id, pdf);
          toast = sent && sent.accepted.length > 0 ? "🧾 Рахунок надіслано клієнту" : "Не вдалося надіслати рахунок";
        }
        break;
      }
      case "fc":
        reply = await withGuard(actor, "users.view", () => fgasCard(id));
        break;
      case "fv": {
        const r = await approveFGasCertificate(actor.userId, id);
        toast = r.ok ? "✅ Сертифікат підтверджено" : GUARD_TEXT[r.code as keyof typeof GUARD_TEXT] ?? `Не вдалося: ${r.code}`;
        if (r.ok) revalidatePath("/[locale]/admin/users", "page");
        reply = await fgasReply(id);
        break;
      }
      case "fr": {
        const denied = await guard(actor, "users.fgas");
        if (denied) {
          toast = denied;
          break;
        }
        await setState(chatId, "reject", { userId: id });
        fresh = true;
        reply = { text: "❌ Напишіть причину відхилення (її побачить клієнт) або відхиліть без пояснення.", keyboard: [[{ text: "Відхилити без пояснення", callback_data: `fR:${id}` }], CANCEL_ROW] };
        break;
      }
      case "fR":
        await clearState(chatId);
        reply = await fgasReject(actor, id, "");
        break;
      case "ra":
      case "rg": {
        const denied = await guard(actor, "orders.manage");
        if (denied) toast = denied;
        else {
          const r = op === "ra" ? await acceptCylinderReturn(id) : await receiveCylinderReturn(id);
          toast = r.ok ? (op === "ra" ? "Заявку прийнято в роботу" : "♻️ Тару отримано, баланс клієнта оновлено") : r.error;
          const card = await returnCard(id);
          if (card) reply = card;
        }
        break;
      }
      case "sr": {
        const denied = await guard(actor, "support");
        if (denied) {
          toast = denied;
          break;
        }
        await setState(chatId, "support", { sessionId: id });
        fresh = true;
        reply = { text: "✍️ Напишіть відповідь клієнту — вона з'явиться у чаті на сайті.", keyboard: [CANCEL_ROW] };
        break;
      }
      case "pg":
        reply = await withGuard(actor, "inventory.view", () => productList(id));
        break;
      case "pv":
        reply = await withGuard(actor, "inventory.view", () => productCard(id, actor.role));
        break;
      case "pa":
      case "pz": {
        const p = await prisma.product.findUnique({ where: { id }, select: { stockQuantity: true } });
        if (!p) break;
        const target = op === "pz" ? 0 : Math.max(0, p.stockQuantity + Number(arg));
        const r = await stockChange(actor, id, target);
        toast = r.text.split("\n")[0]?.replace(/<[^>]+>/g, "").slice(0, 190);
        reply = (await productCard(id, actor.role)) ?? null;
        break;
      }
      case "ps": {
        const denied = await guard(actor, "inventory.stock");
        if (denied) {
          toast = denied;
          break;
        }
        await setState(chatId, "stock", { productId: id });
        fresh = true;
        reply = { text: "✏️ Надішліть точний залишок (ціле число).", keyboard: [CANCEL_ROW] };
        break;
      }
      case "pp": {
        const denied = await guard(actor, "inventory.catalog");
        if (denied) {
          toast = denied;
          break;
        }
        await setState(chatId, "price", { productId: id });
        fresh = true;
        reply = { text: "💶 Надішліть нову ціну в EUR за кг (наприклад 24.50).", keyboard: [CANCEL_ROW] };
        break;
      }
      case "ul":
        reply = id === "s" ? await searchPrompt(actor) : await usersScreen(actor, id as "p" | "a");
        if (id === "s") fresh = true;
        break;
      case "uv":
        reply = await withGuard(actor, "users.view", () => userCard(id, actor.role));
        break;
      case "uk":
      case "uu": {
        const denied = await guard(actor, "users.roles");
        if (denied) toast = denied;
        else {
          const r = await setAccountLocked(id, op === "uk", actor.userId, "Telegram");
          toast = r.ok ? (op === "uk" ? "🔒 Акаунт заблоковано" : "🔓 Акаунт розблоковано") : r.error;
          reply = await userCard(id, actor.role);
        }
        break;
      }
      case "an": {
        const denied = await guard(actor, "broadcasts");
        if (denied) {
          toast = denied;
          break;
        }
        if (id === "new") {
          await setState(chatId, "announce", {});
          fresh = true;
          reply = { text: "📢 Надішліть текст оголошення (до 280 символів) — він одразу з'явиться на сайті.", keyboard: [CANCEL_ROW] };
        } else {
          const r = await setAnnouncement({ active: id === "on" }, actor.userId);
          toast = r.ok ? (r.active ? "Оголошення показано" : "Оголошення приховано") : r.error;
          reply = await announcementScreen(actor);
        }
        break;
      }
    }
  } catch (error) {
    console.error(`[telegram] callback ${op} failed:`, error);
    toast = "Сталася помилка — подробиці в журналі сервера.";
  }

  await answerCallback(cb.id, toast);
  if (!reply) return;
  if (!fresh && cb.message) {
    const r = await editMessage(chatId, cb.message.message_id, reply.text, reply.keyboard);
    if (r.ok || /not modified/.test(r.detail)) return;
  }
  await sendMessage(chatId, reply.text, { keyboard: reply.keyboard });
}

async function withGuard(actor: BotActor, permission: Permission, build: () => Promise<Reply | null>): Promise<Reply> {
  const denied = await guard(actor, permission);
  if (denied) return { text: denied };
  return (await build()) ?? { text: "Не знайдено." };
}

// ── Actions ──

function refreshOrder(orderId: string) {
  revalidatePath("/[locale]/admin/orders", "page");
  revalidatePath("/[locale]/profile", "page");
  revalidatePath(`/[locale]/profile/orders/${orderId}`, "page");
}

const orderReply = async (actor: BotActor, orderId: string): Promise<Reply> => withGuard(actor, "orders.view", () => orderCard(orderId));
const fgasReply = async (userId: string): Promise<Reply> => (await fgasCard(userId)) ?? { text: "Користувача не знайдено." };

async function ship(actor: BotActor, orderId: string, code: ShipCode, tracking: string | null): Promise<Reply> {
  const denied = await guard(actor, "orders.manage");
  if (denied) return { text: denied };
  if (!(code in SHIP_CODES)) return { text: "Невідомий перевізник." };
  const t = shipTarget(code);
  if (t.needsTracking && !tracking) {
    await setState(actor.chatId, "tracking", { orderId, code });
    return { text: "Для DHL потрібен номер відстеження — надішліть його.", keyboard: [CANCEL_ROW] };
  }
  const saved = await saveFulfilment(orderId, { carrier: t.carrier, trackingNumber: tracking ?? "" });
  if (!saved.ok) {
    if (saved.code === "INVALID") await setState(actor.chatId, "tracking", { orderId, code });
    return { text: saved.code === "INVALID" ? "Номер відстеження виглядає неправильно — надішліть ще раз." : `Не вдалося зберегти перевізника: ${saved.code}`, keyboard: saved.code === "INVALID" ? [CANCEL_ROW] : undefined };
  }
  const moved = await advanceShipment(orderId, { stage: t.stage }, "admin");
  if (!moved.ok) return { text: `Перевізника збережено, але етап не змінено: ${moved.code}` };
  const email = moved.value.email;
  if (email) after(() => sendOrderStatusEmail(orderId, email));
  refreshOrder(orderId);
  const card = await orderCard(orderId);
  return { text: `🚚 Відправлено (${esc(STAGE_UK[t.stage] ?? t.stage)})${tracking ? `, трекінг <code>${esc(tracking)}</code>` : ""}. Клієнту надіслано лист.\n\n${card?.text ?? ""}`, keyboard: card?.keyboard };
}

async function stockChange(actor: BotActor, productId: string, quantity: number): Promise<Reply> {
  const denied = await guard(actor, "inventory.stock");
  if (denied) return { text: denied };
  const r = await applyStockChange({ productId, newQuantity: quantity });
  const card = await productCard(productId, actor.role);
  const line = r.ok
    ? `✅ Залишок ${esc(r.sku ?? "")}: ${r.quantityBefore ?? "—"} → <b>${r.quantityAfter ?? quantity}</b>${r.cameBackInStock ? ` · знову в наявності, листів підписникам: ${r.emailsSent ?? 0}` : ""}`
    : `⚠️ Не вдалося змінити залишок: ${esc(r.error ?? r.message)}`;
  return { text: `${line}\n\n${card?.text ?? ""}`, keyboard: card?.keyboard };
}

async function fgasReject(actor: BotActor, userId: string, reason: string): Promise<Reply> {
  const r = await rejectFGasCertificate(actor.userId, userId, reason.slice(0, 500), "auto");
  if (r.ok) revalidatePath("/[locale]/admin/users", "page");
  const card = await fgasCard(userId);
  return { text: `${r.ok ? "❌ Сертифікат відхилено, клієнта повідомлено." : (GUARD_TEXT[r.code as keyof typeof GUARD_TEXT] ?? `Не вдалося: ${r.code}`)}\n\n${card?.text ?? ""}`, keyboard: card?.keyboard };
}

async function supportReply(actor: BotActor, sessionId: string, text: string): Promise<string> {
  const denied = await guard(actor, "support");
  if (denied) return denied;
  const r = await postAgentReply(sessionId, text, true);
  return r.ok ? `✅ Відповідь надіслано у чат на сайті${r.emailed ? " і на email клієнта" : ""}.` : `Не вдалося: ${esc(r.error)}`;
}

// ── Screens ──

async function statsScreen(actor: BotActor): Promise<Reply> {
  const denied = await guard(actor, "dashboard.view");
  if (denied) return { text: denied };
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const paidSum = (from: Date) => prisma.order.aggregate({ where: { paymentStatus: "PAID", paidAt: { gte: from } }, _sum: { totalAmount: true }, _count: true });
  const [today, week, month, awaiting, transit, fgasPending, low, out, co2e] = await Promise.all([
    paidSum(dayStart),
    paidSum(since(7)),
    paidSum(since(30)),
    prisma.order.aggregate({ where: { paymentStatus: "PENDING", status: "PENDING" }, _sum: { totalAmount: true }, _count: true }),
    prisma.order.count({ where: { shipmentStage: { in: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } } }),
    prisma.user.count({ where: { OR: [{ fGasStatus: "PENDING_REVIEW" }, { fGasPendingSubmissionId: { not: null } }] } }),
    prisma.product.count({ where: { ...LISTED, stock: "low" } }),
    prisma.product.count({ where: { ...LISTED, stockQuantity: 0, category: { in: ["cylinders", "blends"] } } }),
    prisma.orderItem.aggregate({ where: { order: { paymentStatus: { not: "FAILED" }, createdAt: { gte: yearStart } } }, _sum: { co2eKg: true } }),
  ]);
  const money = (a: { _sum: { totalAmount: unknown } }) => eur(Number(a._sum.totalAmount ?? 0));
  const text = [
    "📊 <b>Огляд та Каса</b>",
    "",
    `💶 Надійшло сьогодні: <b>${money(today)}</b> (${today._count})`,
    `💶 За 7 днів: <b>${money(week)}</b> (${week._count}) · за 30 днів: <b>${money(month)}</b> (${month._count})`,
    `⏳ Очікують оплати SEPA: <b>${awaiting._count}</b> на ${money(awaiting)}`,
    `🚚 У дорозі: <b>${transit}</b>`,
    `🛡 Сертифікати F-Gas на перевірці: <b>${fgasPending}</b>`,
    `🧪 Закінчуються: <b>${low}</b> · немає в наявності: <b>${out}</b>`,
    `🌍 Поставлено з початку року: <b>${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(co2e._sum.co2eKg ?? 0) / 1000)} т CO₂e</b>`,
  ].join("\n");
  return {
    text,
    keyboard: [
      [{ text: "⏳ Очікують оплати", callback_data: "ol:a" }, { text: "🛡 На перевірці", callback_data: "ul:p" }],
      [{ text: "🔄 Оновити", callback_data: "m:s" }],
    ],
  };
}

async function ordersScreen(actor: BotActor, filter: "a" | "t" | "r"): Promise<Reply> {
  const denied = await guard(actor, "orders.view");
  if (denied) return { text: denied };
  const where: Prisma.OrderWhereInput =
    filter === "a" ? { paymentStatus: "PENDING", status: "PENDING" } : filter === "t" ? { shipmentStage: { in: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] } } : {};
  const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true, shipmentStage: true, status: true } });
  const title = { a: "⏳ Очікують оплати", t: "🚚 У дорозі", r: "🕘 Усі останні" }[filter];
  const pill = (f: "a" | "t" | "r", label: string) => ({ text: f === filter ? `● ${label}` : label, callback_data: `ol:${f}` });
  return {
    text: `📦 <b>Замовлення · ${title}</b>\n${orders.length ? "Оберіть замовлення:" : "Немає замовлень у цьому фільтрі."}`,
    keyboard: [
      [pill("a", "Очікують оплати"), pill("t", "У дорозі"), pill("r", "Усі останні")],
      ...orders.map((o) => [{ text: `${o.orderNumber} · ${eur(Number(o.totalAmount))} · ${o.paymentStatus === "PAID" ? (STAGE_UK[o.shipmentStage ?? ""] ?? "оплачено") : o.paymentStatus === "FAILED" ? "скасовано" : "чекає оплати"}`, callback_data: `ov:${o.id}` }]),
    ],
  };
}

async function usersScreen(actor: BotActor, filter: "p" | "a" | "s", query?: string): Promise<Reply> {
  const denied = await guard(actor, "users.view");
  if (denied) return { text: denied };
  const q = query?.trim().slice(0, 80) ?? "";
  const where: Prisma.UserWhereInput =
    filter === "p"
      ? { OR: [{ fGasStatus: "PENDING_REVIEW" }, { fGasPendingSubmissionId: { not: null } }] }
      : filter === "s"
        ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
        : {};
  const users = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true, email: true, companyName: true, fGasStatus: true, lockedAt: true } });
  const pill = (f: "p" | "a" | "s", label: string) => ({ text: f === filter ? `● ${label}` : label, callback_data: `ul:${f}` });
  const title = filter === "p" ? "На перевірці F-Gas" : filter === "s" ? `Пошук «${esc(q)}»` : "Усі користувачі";
  return {
    text: `🛡 <b>Користувачі · ${title}</b>\n${users.length ? "Оберіть користувача:" : "Нікого не знайдено."}`,
    keyboard: [
      [pill("p", "На перевірці F-Gas"), pill("s", "🔎 Пошук"), pill("a", "Усі")],
      ...users.map((u) => [{ text: `${u.lockedAt ? "🔒 " : ""}${u.companyName ?? u.name ?? u.email ?? u.id} · ${u.fGasStatus}`.slice(0, 60), callback_data: filter === "p" ? `fc:${u.id}` : `uv:${u.id}` }]),
    ],
  };
}

async function searchPrompt(actor: BotActor): Promise<Reply> {
  const denied = await guard(actor, "users.view");
  if (denied) return { text: denied };
  await setState(actor.chatId, "usersearch", {});
  return { text: "🔎 Надішліть email, назву компанії або ім'я.", keyboard: [CANCEL_ROW] };
}

async function inventoryScreen(actor: BotActor): Promise<Reply> {
  const denied = await guard(actor, "inventory.view");
  if (denied) return { text: denied };
  return {
    text: "🧪 <b>Склад та Ціни</b>\nОберіть газ або обладнання:",
    keyboard: [GAS_GROUPS.slice(0, 4), GAS_GROUPS.slice(4)].map((row) => row.map((g) => ({ text: g.label, callback_data: `pg:${g.key}` }))),
  };
}

async function productList(group: string): Promise<Reply> {
  const products = await prisma.product.findMany({ where: LISTED, select: { id: true, name: true, sku: true, weightKg: true, stockQuantity: true, category: true }, orderBy: [{ weightKg: "asc" }] });
  const inGroup = products.filter((p) => {
    if (group === "EQ") return p.category === "equipment" || p.category === "recovery";
    const mark = gasMarkForProduct(p);
    return mark !== null && normalizeMark(mark) === group && (p.category === "cylinders" || p.category === "blends");
  });
  const label = GAS_GROUPS.find((g) => g.key === group)?.label ?? group;
  return {
    text: `🧪 <b>${esc(label)}</b>\n${inGroup.length ? "Оберіть позицію:" : "У каталозі немає позицій цього газу."}`,
    keyboard: [
      ...inGroup.map((p) => [{ text: `${p.name} · ${p.category === "cylinders" || p.category === "blends" ? `${p.weightKg} кг` : "шт."} · залишок ${p.stockQuantity}`.slice(0, 60), callback_data: `pv:${p.id}` }]),
      [{ text: "⬅️ Усі групи", callback_data: "m:i" }],
    ],
  };
}

async function announcementScreen(actor: BotActor, note?: string): Promise<Reply> {
  const denied = await guard(actor, "broadcasts");
  if (denied) return { text: denied };
  const a = await prisma.siteAnnouncement.findFirst({ orderBy: { updatedAt: "desc" } });
  const text = [note ? `<b>${esc(note)}</b>\n` : "", "📢 <b>Оголошення на сайті</b>", a ? `«${esc(a.text)}»` : "Ще немає оголошення.", a ? `Статус: <b>${a.active ? "показується" : "приховано"}</b>` : ""].filter(Boolean).join("\n");
  const kb: InlineKeyboard = [[{ text: "✏️ Новий текст", callback_data: "an:new" }]];
  if (a) kb.push([a.active ? { text: "🔕 Приховати", callback_data: "an:off" } : { text: "🔔 Показати", callback_data: "an:on" }]);
  return { text, keyboard: kb };
}
