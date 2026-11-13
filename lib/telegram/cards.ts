import "server-only";

import prisma from "@/lib/prisma";
import { orderBreakdown } from "@/lib/orderTotals";
import { flagEmoji } from "@/lib/country";
import { absoluteUrl } from "@/lib/siteUrl";
import { stageOf, methodOf, isCarrierCode, CARRIERS } from "@/lib/shipping/carriers";
import { getCylinderLedger } from "@/lib/invoicing";
import { can, type AppRole } from "@/lib/rbac";
import { esc, type InlineKeyboard } from "@/lib/telegram/api";

/**
 * The bot's messages: one card per thing an admin acts on (order, F-Gas
 * review, cylinder return, product, user), built from the database at the
 * moment it is sent or refreshed, in Ukrainian, with only the buttons that
 * make sense for the current state. Alerts and the menus share them, so a
 * button pressed on an hour-old alert re-renders the card as it is now.
 *
 * Callback data (≤ 64 bytes): `<op>:<id>[:<arg>]` — see lib/telegram/bot.
 */

const n2 = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (v: number) => `${n2.format(v).replace(/ /g, " ")} EUR`;
const kg = (v: number) => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v).replace(/ /g, " ")} кг`;
const day = (d: Date) => new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeZone: "Europe/Kyiv" }).format(d);
const GAS = new Set(["cylinders", "blends"]);

/** An https link the button can open; local http origins are left out (Telegram refuses them). */
export function adminLink(path: string): string | null {
  const url = absoluteUrl(path, "uk");
  return url.startsWith("https://") ? url : null;
}

export const STAGE_UK: Record<string, string> = {
  ORDER_PLACED: "Оформлено",
  ADR_PACKING: "Комплектування ADR",
  DISPATCHED: "Відправлено",
  IN_TRANSIT: "У дорозі",
  OUT_FOR_DELIVERY: "Доставляється",
  READY_FOR_PICKUP: "Готово до самовивозу",
  DELIVERED: "Доставлено",
};
const PREF_UK: Record<string, string> = { DHL: "DHL", FREIGHT: "Вантажний перевізник", OWN_FLEET: "Власний ADR-транспорт", PICKUP: "Самовивіз" };
export const SHIP_CODES = { DHL: "DHL", DBS: "DB_SCHENKER", OWN: "OWN_FLEET", PIC: "PICKUP" } as const;
export type ShipCode = keyof typeof SHIP_CODES;
const carrierLabel = (code: string | null, name: string | null) =>
  !code ? "DHL" : code === "OWN_FLEET" ? "Власний ADR" : code === "PICKUP" ? "Самовивіз" : code === "OTHER" ? (name ?? "Інший перевізник") : isCarrierCode(code) ? (CARRIERS[code].name ?? code) : code;

// ── Orders ──

export async function orderCard(orderId: string, heading?: string): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      status: true,
      paymentStatus: true,
      paymentReportedAt: true,
      paymentReportedRef: true,
      shipmentStage: true,
      shippingCarrier: true,
      carrierName: true,
      trackingNumber: true,
      shippingAddress: true,
      customerNote: true,
      createdAt: true,
      user: { select: { name: true, email: true, companyName: true, vatNumber: true, countryCode: true, preferredFulfilment: true } },
      items: { select: { quantity: true, priceAtPurchase: true, depositAtPurchase: true, weightKgAtPurchase: true, product: { select: { name: true, category: true } } } },
      invoice: { select: { invoiceNumber: true } },
    },
  });
  if (!o) return null;
  const b = orderBreakdown(
    o.items.map((i) => ({ priceAtPurchase: Number(i.priceAtPurchase), quantity: i.quantity, depositAtPurchase: Number(i.depositAtPurchase) })),
    Number(o.totalAmount)
  );
  const stage = stageOf(o.shipmentStage, o.status);
  const paid = o.paymentStatus === "PAID";
  const failed = o.paymentStatus === "FAILED";
  const delivered = stage === "DELIVERED";
  const dispatched = ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "DELIVERED"].includes(stage);
  const u = o.user;
  const lines = [
    heading ? `<b>${esc(heading)}</b>` : `📦 <b>Замовлення ${esc(o.orderNumber)}</b>`,
    heading ? `<code>${esc(o.orderNumber)}</code> · ${esc(day(o.createdAt))}` : esc(day(o.createdAt)),
    "",
    `👤 ${esc([u.name, u.email].filter(Boolean).join(" · "))}${u.countryCode ? ` ${flagEmoji(u.countryCode)} ${esc(u.countryCode)}` : ""}`,
    ...(u.companyName || u.vatNumber ? [`🏢 ${esc([u.companyName, u.vatNumber ? `VAT ${u.vatNumber}` : null].filter(Boolean).join(" · "))}`] : []),
    "",
    `💶 Разом: <b>${eur(b.total)}</b>`,
    `   Товари ${eur(b.subtotal)} · застава ${eur(b.deposit)} · ADR-доставка ${eur(b.shipping)} · ПДВ ${eur(b.vat)}`,
    "",
    "🧪 Позиції:",
    ...o.items.map((i) => ` • ${esc(i.product.name)} — ${GAS.has(i.product.category ?? "") ? kg(Number(i.weightKgAtPurchase)) : "шт."} × ${i.quantity} = ${eur(Number(i.priceAtPurchase) * i.quantity)}`),
    "",
    ...(o.shippingAddress ? [`📍 ${esc(o.shippingAddress.replace(/\n+/g, ", "))}`] : []),
    ...(o.customerNote ? [`📝 ${esc(o.customerNote)}`] : []),
    ...(u.preferredFulfilment ? [`🚚 Бажаний спосіб: ${esc(PREF_UK[u.preferredFulfilment] ?? u.preferredFulfilment)}`] : []),
    "",
    `Оплата: <b>${paid ? "✅ оплачено" : failed ? "❌ скасовано" : o.paymentReportedAt ? "🟡 клієнт повідомив про переказ" : "⏳ очікує оплати SEPA"}</b>${o.paymentReportedRef ? ` · референс <code>${esc(o.paymentReportedRef)}</code>` : ""}`,
    `Етап: <b>${esc(STAGE_UK[stage] ?? stage)}</b>${dispatched ? ` · ${esc(carrierLabel(o.shippingCarrier, o.carrierName))}${o.trackingNumber ? ` <code>${esc(o.trackingNumber)}</code>` : ""}` : ""}`,
    ...(o.invoice ? [`🧾 Рахунок ${esc(o.invoice.invoiceNumber)}`] : []),
  ];

  const kb: InlineKeyboard = [];
  if (!paid && !failed) kb.push([{ text: "✅ Підтвердити оплату SEPA", callback_data: `op:${o.id}` }]);
  if (paid && !dispatched && !failed) {
    kb.push([
      { text: "🚚 Відправити: DHL", callback_data: `os:${o.id}:DHL` },
      { text: "🚚 DB Schenker", callback_data: `os:${o.id}:DBS` },
    ]);
    kb.push([
      { text: "🚚 Власний ADR", callback_data: `os:${o.id}:OWN` },
      { text: "📍 Самовивіз", callback_data: `os:${o.id}:PIC` },
    ]);
  }
  if (dispatched && !delivered) kb.push([{ text: "✅ Позначити доставленим", callback_data: `od:${o.id}` }]);
  if (!paid && !failed && o.status === "PENDING") kb.push([{ text: "❌ Скасувати замовлення", callback_data: `ox:${o.id}` }]);
  const tail = [{ text: "🧾 Надіслати рахунок", callback_data: `oi:${o.id}` }, { text: "🔄 Оновити", callback_data: `ov:${o.id}` }];
  kb.push(failed ? [tail[1]!] : tail);
  const link = adminLink(`/admin/orders?q=${encodeURIComponent(o.orderNumber)}`);
  if (link) kb.push([{ text: "🌐 Відкрити в адмінці", url: link }]);
  return { text: lines.join("\n"), keyboard: kb };
}

/** Ship with this carrier: the preset's method decides the next stage. */
export function shipTarget(code: ShipCode) {
  const carrier = SHIP_CODES[code];
  const method = methodOf(carrier);
  return { carrier, method, stage: method === "PICKUP" ? ("READY_FOR_PICKUP" as const) : ("DISPATCHED" as const), needsTracking: method === "DHL" };
}

// ── F-Gas review ──

export async function fgasCard(userId: string, heading?: string): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      companyName: true,
      vatNumber: true,
      countryCode: true,
      fGasStatus: true,
      fGasExpiresAt: true,
      fGasRejectionReason: true,
      fGasPendingSubmissionId: true,
      fGasExtractedData: true,
      certificates: { where: { isActive: true }, take: 1, select: { certificateNumber: true, certId: true, expiresAt: true } },
    },
  });
  if (!u) return null;
  const x = (u.fGasExtractedData ?? null) as { certificateId?: string | null; expiresAt?: string | null; companyName?: string | null; personName?: string | null } | null;
  const cert = u.certificates[0];
  const number = cert?.certificateNumber ?? cert?.certId ?? x?.certificateId ?? null;
  const expires = u.fGasExpiresAt ?? cert?.expiresAt ?? (x?.expiresAt ? new Date(x.expiresAt) : null);
  const status: Record<string, string> = { VERIFIED: "✅ підтверджено", PENDING_REVIEW: "🟡 на перевірці", REJECTED: "❌ відхилено", EXPIRED: "⌛ прострочено", NONE: "— немає" };
  const text = [
    `<b>${esc(heading ?? "🛡 Сертифікат F-Gas")}</b>`,
    "",
    `👤 ${esc([u.name, u.email].filter(Boolean).join(" · "))}${u.countryCode ? ` ${flagEmoji(u.countryCode)}` : ""}`,
    ...(u.companyName || u.vatNumber ? [`🏢 ${esc([u.companyName, u.vatNumber ? `VAT ${u.vatNumber}` : null].filter(Boolean).join(" · "))}`] : []),
    `🔢 Сертифікат: <code>${esc(number ?? "—")}</code>${expires ? ` · дійсний до ${esc(day(expires))}` : ""}`,
    `Статус: <b>${status[u.fGasStatus] ?? u.fGasStatus}</b>${u.fGasPendingSubmissionId ? " · є заміна на перевірці" : ""}`,
    ...(u.fGasRejectionReason && u.fGasStatus !== "VERIFIED" ? [`⚠️ ${esc(u.fGasRejectionReason)}`] : []),
  ].join("\n");
  const kb: InlineKeyboard = [];
  if (u.fGasStatus !== "VERIFIED" || u.fGasPendingSubmissionId) kb.push([{ text: "✅ Підтвердити сертифікат (Verify)", callback_data: `fv:${u.id}` }]);
  if (u.fGasStatus !== "REJECTED" && u.fGasStatus !== "NONE") kb.push([{ text: "❌ Відхилити (Reject)", callback_data: `fr:${u.id}` }]);
  const link = adminLink(`/admin/users?filter=review&q=${encodeURIComponent(u.email ?? "")}`);
  if (link) kb.push([{ text: "📄 Переглянути документ в адмінці", url: link }]);
  return { text, keyboard: kb };
}

// ── Cylinder returns ──

export async function returnCard(id: string, heading?: string): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const r = await prisma.cylinderReturnRequest.findUnique({
    where: { id },
    select: { id: true, quantity: true, method: true, addressText: true, preferredDate: true, notes: true, status: true, user: { select: { id: true, name: true, email: true, companyName: true, depositIban: true } } },
  });
  if (!r) return null;
  // Deposit actually charged on this account's orders (mean per cylinder), as the cylinders view computes it.
  const charged = await prisma.orderItem.findMany({ where: { order: { userId: r.user.id, paymentStatus: { not: "FAILED" } }, depositAtPurchase: { gt: 0 } }, select: { quantity: true, depositAtPurchase: true } });
  const units = charged.reduce((n, c) => n + c.quantity, 0);
  const each = units > 0 ? charged.reduce((s, c) => s + Number(c.depositAtPurchase) * c.quantity, 0) / units : 0;
  const statusUk: Record<string, string> = { REQUESTED: "🆕 нова", SCHEDULED: "🗓 у роботі", COLLECTED: "✅ тару отримано", CANCELLED: "❌ скасована" };
  const text = [
    `<b>${esc(heading ?? "♻️ Повернення балонів")}</b>`,
    "",
    `👤 ${esc([r.user.name, r.user.companyName, r.user.email].filter(Boolean).join(" · "))}`,
    `🧯 Балонів: <b>${r.quantity}</b> · застава до повернення ≈ <b>${eur(each * r.quantity)}</b>`,
    `🚚 ${r.method === "PICKUP" ? `Забрати за адресою: ${esc(r.addressText ?? "—")}` : "Клієнт привезе на склад"}${r.preferredDate ? ` · ${esc(day(r.preferredDate))}` : ""}`,
    `🏦 IBAN для повернення: <code>${esc(r.user.depositIban ?? "не вказано")}</code>`,
    ...(r.notes ? [`📝 ${esc(r.notes)}`] : []),
    `Статус: <b>${statusUk[r.status] ?? r.status}</b>`,
  ].join("\n");
  const kb: InlineKeyboard = [];
  if (r.status === "REQUESTED") kb.push([{ text: "✅ Прийнято в роботу", callback_data: `ra:${r.id}` }]);
  if (r.status === "REQUESTED" || r.status === "SCHEDULED") kb.push([{ text: "♻️ Тару отримано на склад", callback_data: `rg:${r.id}` }]);
  return { text, keyboard: kb };
}

// ── Products ──

export async function productCard(productId: string, role: AppRole): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, sku: true, pricePerKg: true, weightKg: true, stockQuantity: true, stock: true, category: true, cylinderDeposit: true } });
  if (!p) return null;
  const gas = GAS.has(p.category ?? "");
  const text = [
    `🧪 <b>${esc(p.name)}</b> · <code>${esc(p.sku)}</code>`,
    gas ? `${kg(p.weightKg)} · ${eur(p.pricePerKg)}/кг · балон ${eur(p.pricePerKg * p.weightKg)}` : `Ціна: ${eur(p.pricePerKg)} / шт.`,
    `Залишок: <b>${p.stockQuantity}</b> (${esc(p.stock)})${Number(p.cylinderDeposit) > 0 ? ` · застава ${eur(Number(p.cylinderDeposit))}` : ""}`,
  ].join("\n");
  const kb: InlineKeyboard = [
    [
      { text: "+5", callback_data: `pa:${p.id}:5` },
      { text: "+10", callback_data: `pa:${p.id}:10` },
      { text: "−1", callback_data: `pa:${p.id}:-1` },
    ],
    [
      { text: "✏️ Встановити точний залишок", callback_data: `ps:${p.id}` },
      { text: "Немає в наявності (0)", callback_data: `pz:${p.id}` },
    ],
  ];
  if (can(role, "inventory.catalog")) kb.push([{ text: "💶 Змінити ціну EUR", callback_data: `pp:${p.id}` }]);
  kb.push([{ text: "🔄 Оновити", callback_data: `pv:${p.id}` }]);
  return { text, keyboard: kb };
}

// ── Users ──

export async function userCard(userId: string, role: AppRole): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, companyName: true, vatNumber: true, countryCode: true, fGasStatus: true, lockedAt: true, role: true, createdAt: true } });
  if (!u) return null;
  const ledger = await getCylinderLedger(u.id).catch(() => null);
  const text = [
    `👤 <b>${esc(u.name ?? u.email ?? u.id)}</b>${u.lockedAt ? " · 🔒 заблоковано" : ""}`,
    esc(u.email ?? ""),
    ...(u.companyName || u.vatNumber ? [`🏢 ${esc([u.companyName, u.vatNumber ? `VAT ${u.vatNumber}` : null].filter(Boolean).join(" · "))}`] : []),
    `${u.countryCode ? `${flagEmoji(u.countryCode)} ${esc(u.countryCode)} · ` : ""}роль ${esc(u.role)} · з ${esc(day(u.createdAt))}`,
    `F-Gas: <b>${esc(u.fGasStatus)}</b> · балонів на руках: <b>${ledger?.inPossession ?? 0}</b>`,
  ].join("\n");
  const kb: InlineKeyboard = [[{ text: "🛡 Картка F-Gas", callback_data: `fc:${u.id}` }]];
  if (can(role, "users.roles")) kb.push([u.lockedAt ? { text: "🔓 Розблокувати акаунт", callback_data: `uu:${u.id}` } : { text: "🔒 Заблокувати акаунт", callback_data: `uk:${u.id}` }]);
  return { text, keyboard: kb };
}
