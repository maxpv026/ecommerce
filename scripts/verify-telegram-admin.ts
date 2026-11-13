/**
 * End-to-end check of the Telegram admin bot — against a LOCAL MOCK of the
 * Bot API. Nothing reaches api.telegram.org, OpenAI or a real mailbox.
 *
 *   npm run build
 *   npx tsx --env-file=.env --env-file=.env.local --conditions=react-server scripts/verify-telegram-admin.ts
 *
 * What it does:
 *   • starts a mock Bot API (records every call), an SMTP sink, and the built
 *     app (`next start`) with TELEGRAM_API_BASE pointed at the mock, a test
 *     token / webhook secret, OpenAI unreachable and SMTP at the sink;
 *   • creates prefixed fixtures (an owner, an admin, a buyer, two F-Gas
 *     applicants) and drives the bot through its webhook: secret checks,
 *     strangers, pairing from /admin/telegram (deep link + code), every alert
 *     and the buttons on it, menus, stock & price, users, announcements;
 *   • checks the database, the e-mails and the /admin pages after each step;
 *   • then a second server WITHOUT a token: the webhook is 503 and /admin
 *     explains which variables to add.
 * Everything it creates is removed in `finally`; stock and prices it touched
 * are written back. The database is the shared one, so the price step only
 * runs when no customer's price alert could fire, and only ever raises the
 * price of a size that isn't its gas's cheapest (the /hub index doesn't move).
 *
 * Env: VERIFY_PORT (default 3110), PLAYWRIGHT_CHROMIUM_PATH (optional).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import net from "node:net";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { encode } from "@auth/core/jwt";

type Json = Record<string, unknown>;
/** `id`: the message_id the mock gave a sent message. */
type Call = { method: string; body: Json; token: string; id?: number };
type Mail = { to: string[]; raw: string };

const PORT = Number(process.env.VERIFY_PORT ?? 3110);
const B = `http://localhost:${PORT}`;
const TOKEN = "verify-token";
const SECRET = randomBytes(24).toString("hex");
const TAG = `tg-e2e-${Date.now().toString(36)}`;
const OWNER_EMAIL = `${TAG}-owner@example.test`;
const LOCKED = "🔒 Доступ закрито";
const CHAT = { owner: 7_100_001, admin: 7_100_002, other: 7_100_003, stranger: 7_100_099 };

let pass = 0;
let fail = 0;
const check = (name: string, ok: unknown, info: unknown = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || info === "" ? "" : `  (${typeof info === "string" ? info : JSON.stringify(info)})`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T | Promise<T>, ms = 20_000): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(150);
  }
}
const s = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v));

// ── Mock Bot API ──

const calls: Call[] = [];
const hook = { url: "", secret: "" };
let nextMessageId = 5000;

function startMock(): Promise<Server> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const reply = (status: number, json: Json) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const m = req.url?.match(/^\/bot([^/]+)\/(\w+)$/);
    if (!m) return reply(404, { ok: false, description: "Not Found" });
    const [, token, method] = m as unknown as [string, string, string];
    const type = req.headers["content-type"] ?? "";
    let body: Json = {};
    if (type.includes("application/json")) body = JSON.parse(raw.toString("utf8") || "{}") as Json;
    else if (type.includes("multipart/form-data")) {
      const text = raw.toString("latin1");
      const field = (name: string) => Buffer.from(text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? "", "latin1").toString("utf8");
      body = { chat_id: field("chat_id"), caption: field("caption"), filename: text.match(/filename="([^"]+)"/)?.[1] ?? null, pdf: text.includes("%PDF-"), bytes: raw.length };
    }
    const call: Call = { method, body, token };
    calls.push(call);
    if (token !== TOKEN) return reply(401, { ok: false, description: "Unauthorized" });
    const chat = { id: Number(body.chat_id), type: "private" };
    switch (method) {
      case "getMe":
        return reply(200, { ok: true, result: { id: 4242, is_bot: true, first_name: "Verify", username: "verify_admin_bot" } });
      case "getWebhookInfo":
        return reply(200, { ok: true, result: { url: hook.url, pending_update_count: 0 } });
      case "setWebhook":
        hook.url = s(body.url);
        hook.secret = s(body.secret_token);
        return reply(200, { ok: true, result: true });
      case "sendMessage":
      case "sendDocument":
        call.id = ++nextMessageId;
        return reply(200, { ok: true, result: { message_id: call.id, chat, date: Math.floor(Date.now() / 1000) } });
      case "editMessageText":
        return reply(200, { ok: true, result: { message_id: body.message_id, chat } });
      default:
        return reply(200, { ok: true, result: true });
    }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const sent = (chat: number, from = 0, method = "sendMessage") => calls.slice(from).filter((c) => c.method === method && String(c.body.chat_id) === String(chat));
const textOf = (c: Call | undefined) => s(c?.body.text ?? c?.body.caption);
const buttons = (c: Call | undefined): Array<{ text: string; callback_data?: string; url?: string }> => {
  const markup = c?.body.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>> } | undefined;
  return markup?.inline_keyboard?.flat() ?? [];
};
const answers = (from: number) => calls.slice(from).filter((c) => c.method === "answerCallbackQuery").map((c) => s(c.body.text));
const edits = (chat: number, from: number) => calls.slice(from).filter((c) => c.method === "editMessageText" && String(c.body.chat_id) === String(chat));

// ── SMTP sink ──

const mails: Mail[] = [];
function startSink(): Promise<net.Server> {
  const server = net.createServer((sock) => {
    sock.on("error", () => {});
    sock.write("220 sink\r\n");
    let data = false;
    let to: string[] = [];
    let body: string[] = [];
    let buf = "";
    sock.on("data", (b) => {
      buf += b.toString("latin1");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === ".") {
            data = false;
            mails.push({ to, raw: Buffer.from(body.join("\r\n"), "latin1").toString("utf8") });
            to = [];
            body = [];
            sock.write("250 ok\r\n");
          } else body.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }
        const c = line.slice(0, 4).toUpperCase();
        if (c === "EHLO") sock.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (c === "RCPT") {
          to.push((line.match(/<([^>]+)>/)?.[1] ?? "").toLowerCase());
          sock.write("250 ok\r\n");
        } else if (c === "DATA") {
          data = true;
          sock.write("354 go\r\n");
        } else if (c === "QUIT") {
          sock.write("221 bye\r\n");
          sock.end();
        } else if (c === "AUTH") sock.write("235 ok\r\n");
        else if (line) sock.write("250 ok\r\n");
      }
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}
/** The decoded Subject header (RFC 2047 words joined). */
function subjectOf(raw: string): string {
  const m = raw.match(/^Subject: (.*(?:\r\n[ \t].*)*)/m);
  if (!m?.[1]) return "";
  return m[1]
    .replace(/\r\n[ \t]/g, " ")
    .replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=\s*/gi, (_, enc: string, d: string) =>
      enc.toUpperCase() === "B"
        ? Buffer.from(d, "base64").toString("utf8")
        : Buffer.from(d.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8")
    );
}
const mailTo = (email: string, subjectPart: string) => mails.find((m) => m.to.includes(email.toLowerCase()) && subjectOf(m.raw).replace(/\s+/g, "").includes(subjectPart.replace(/\s+/g, "")));

// ── The app ──

function startApp(port: number, env: Record<string, string>, log: string[]): ChildProcess {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: { ...process.env, ...env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d: Buffer) => log.push(d.toString()));
  child.stderr?.on("data", (d: Buffer) => log.push(d.toString()));
  return child;
}
async function waitUp(base: string) {
  const up = await until(async () => (await fetch(`${base}/api/telegram/webhook`, { method: "POST" }).catch(() => null))?.status, 60_000);
  if (!up) throw new Error(`${base} did not start`);
}

async function main() {
  // The test process calls one alert directly (F-Gas: a real upload needs the
  // vision model). Same mock, same token, same owner as the server.
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_ADMIN_CHAT_ID: "", TELEGRAM_ADMIN_CHAT_IDS: "", ADMIN_EMAIL: OWNER_EMAIL, AUTH_URL: B, NEXT_PUBLIC_SITE_URL: B });
  const mock = await startMock();
  const sink = await startSink();
  const mockBase = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  process.env.TELEGRAM_API_BASE = mockBase;

  const prismaModule = await import("@/lib/prisma");
  const prisma = ((prismaModule as unknown as { default: { default?: typeof prismaModule.default } }).default.default ?? prismaModule.default) as typeof prismaModule.default;

  const serverLog: string[] = [];
  const env = {
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_API_BASE: mockBase,
    TELEGRAM_ADMIN_CHAT_ID: "",
    TELEGRAM_ADMIN_CHAT_IDS: "",
    TELEGRAM_CHAT_ID: "",
    ADMIN_EMAIL: OWNER_EMAIL,
    OPENAI_API_KEY: "",
    OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
    AUTH_TRUST_HOST: "true",
    AUTH_URL: B,
    NEXT_PUBLIC_SITE_URL: B,
    DHL_API_KEY: "",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String((sink.address() as AddressInfo).port),
    SMTP_SECURE: "false",
    SMTP_USER: "sink",
    SMTP_PASS: "sink",
    SMTP_PASSWORD: "sink",
  };
  let app: ChildProcess | null = null;
  let bare: ChildProcess | null = null;
  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const created = { users: [] as string[] };
  const updateBase = 900_000_000 + Math.floor(Math.random() * 1_000_000);
  let updateId = updateBase;
  let incomingId = 1;
  const announcementBefore = await prisma.siteAnnouncement.findFirst({ orderBy: { updatedAt: "desc" } });
  const announcementIds = new Set((await prisma.siteAnnouncement.findMany({ select: { id: true } })).map((a) => a.id));
  const startedAt = new Date();
  let restore: Array<{ id: string; stockQuantity: number; inStock: boolean; stock: string; pricePerKg: number }> = [];

  try {
    // ── Fixtures ──
    const mk = (data: Parameters<typeof prisma.user.create>[0]["data"]) => prisma.user.create({ data }).then((u) => (created.users.push(u.id), u));
    const owner = await mk({ email: OWNER_EMAIL, name: "Verify Owner", emailVerified: new Date(), role: "USER", isTwoFactorEnabled: true, twoFactorSecret: "verify", locale: "uk" });
    const admin = await mk({ email: `${TAG}-admin@example.test`, name: "Verify Admin", emailVerified: new Date(), role: "ADMIN", isTwoFactorEnabled: true, twoFactorSecret: "verify", locale: "uk" });
    const buyer = await mk({
      email: `${TAG}-buyer@example.test`,
      name: "Олена Покупець",
      companyName: "Freon & <Co> GmbH",
      emailVerified: new Date(),
      locale: "uk",
      fGasStatus: "VERIFIED",
      epaVerified: true,
      fGasExpiresAt: new Date("2031-01-01T00:00:00Z"),
    });
    await prisma.certificate.create({ data: { userId: buyer.id, certType: "Category I", certId: `FGAS-${TAG}`, certificateNumber: `FGAS-${TAG}`, issuedAt: new Date(), isActive: true, expiresAt: new Date("2031-01-01T00:00:00Z") } });
    const address = await prisma.address.create({ data: { userId: buyer.id, title: "Склад", recipientName: "Олена", fullAddress: "вул. Промислова 1, 02000 Київ", street: "вул. Промислова 1", city: "Київ", postalCode: "02000", country: "Ukraine", phone: "+380 44 000 00 00", isDefault: true, kind: "SHIPPING" } });
    const applicant = (n: number) =>
      mk({
        email: `${TAG}-fgas${n}@example.test`,
        name: `Заявник ${n}`,
        emailVerified: new Date(),
        locale: "uk",
        fGasStatus: "PENDING_REVIEW",
        fGasDocumentUrl: `private:verify/${TAG}-${n}.pdf`,
        fGasExtractedData: { certificateId: `UA-FG-${n}-${TAG}`, expiresAt: "2030-06-30", companyName: `Holod ${n}`, category: "Category I", issuingBody: "Test body" },
      });
    const fgas1 = await applicant(1);
    const fgas2 = await applicant(2);

    // Stock for two orders, and a priced-per-kg size to edit that isn't its gas's cheapest.
    const { getGasIndex } = await import("@/lib/priceHistory");
    const index = await getGasIndex();
    const cheapest = new Set(index.map((g) => g.productId));
    const listed = await prisma.product.findMany({ where: { archivedAt: null, category: "cylinders", inStock: true, stockQuantity: { gte: 3 } }, orderBy: { pricePerKg: "desc" }, select: { id: true, sku: true, stockQuantity: true, inStock: true, stock: true, pricePerKg: true } });
    const orderProduct = listed.find((p) => p.stockQuantity >= 4) ?? listed[0];
    const editProduct = listed.find((p) => p.id !== orderProduct?.id && !cheapest.has(p.id));
    if (!orderProduct || !editProduct) throw new Error("No in-stock products to test with");
    restore = await prisma.product.findMany({ where: { id: { in: [orderProduct.id, editProduct.id] } }, select: { id: true, stockQuantity: true, inStock: true, stock: true, pricePerKg: true } });

    const cookie = (u: { id: string; email: string | null; name: string | null }, role: string, twoFactor: boolean) =>
      encode({ token: { sub: u.id, email: u.email, name: u.name, role, isTwoFactorEnabled: twoFactor, authTime: Date.now(), epaVerified: true, fGasStatus: "VERIFIED" }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" });
    const ownerTok = await cookie(owner, "SUPER_ADMIN", true);
    const adminTok = await cookie(admin, "ADMIN", true);
    const buyerTok = await cookie(buyer, "USER", false);

    app = startApp(PORT, env, serverLog);
    await waitUp(B);
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
    browser = await chromium.launch({ executablePath });

    const post = (update: Json, secret: string | null = SECRET, raw?: string) =>
      fetch(`${B}/api/telegram/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(secret !== null ? { "x-telegram-bot-api-secret-token": secret } : {}) },
        body: raw ?? JSON.stringify(update),
      }).then((r) => r.status);
    const say = (from: number, text: string, extra: Json = {}, username = `user${from}`) =>
      post({ update_id: ++updateId, message: { message_id: ++incomingId, from: { id: from, is_bot: false, first_name: "T", username }, chat: { id: from, type: "private" }, date: 0, text, ...extra } });
    const press = (from: number, data: string, messageId = 1) =>
      post({ update_id: ++updateId, callback_query: { id: `cb-${updateId}`, from: { id: from, is_bot: false, first_name: "T" }, chat_instance: "x", message: { message_id: messageId, chat: { id: from, type: "private" }, date: 0 }, data } });
    const api = (path: string, tok: string, body: unknown, extra: Record<string, string> = {}) =>
      fetch(`${B}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: `authjs.session-token=${tok}`, "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}`, ...extra }, body: JSON.stringify(body) });
    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { exportedName?: string; workers: Record<string, unknown> }> };
    const action = (name: string, page: string, tok: string, arg: unknown) => {
      const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === name)?.[0];
      if (!id) throw new Error(`action ${name} not in the manifest`);
      return fetch(`${B}${page}`, { method: "POST", headers: { "Next-Action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: B, cookie: `authjs.session-token=${tok}` }, body: JSON.stringify([arg]) });
    };
    const context = async (tok: string): Promise<BrowserContext> => {
      const ctx = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
      await ctx.addCookies([{ name: "authjs.session-token", value: tok, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
      await ctx.addInitScript(() => {
        (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
      });
      return ctx;
    };
    // Desktop light and phone dark: no sideways scroll; full-page PNGs when VERIFY_SHOTS=<dir>.
    const layout = async (base: string, tok: string, path: string, name: string) => {
      for (const [scheme, width] of [["light", 1440], ["dark", 390]] as const) {
        const ctx = await browser!.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
        await ctx.addCookies([{ name: "authjs.session-token", value: tok, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
        await ctx.addInitScript((theme) => {
          try {
            localStorage.setItem("halocore-theme", theme);
          } catch {}
        }, scheme);
        const p = watch(await ctx.newPage());
        await p.goto(`${base}${path}`, { waitUntil: "load" });
        await p.locator("[data-admin-telegram], [data-admin-overview]").first().waitFor({ timeout: 30_000 });
        await sleep(600);
        const fit = await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
        check(`${name} ${width} ${scheme}: no horizontal overflow`, fit);
        if (process.env.VERIFY_SHOTS) await p.screenshot({ path: `${process.env.VERIFY_SHOTS}/${name}-${width}-${scheme}.png`, fullPage: true });
        await ctx.close();
      }
    };
    const watch = (p: Page) => {
      p.on("console", (m) => {
        // ERR_SSL_PROTOCOL_ERROR: the CSP's upgrade-insecure-requests on plain-http `next start`, not the page.
        if (m.type() === "error" && !/ERR_SSL_PROTOCOL_ERROR/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 240)}`);
      });
      p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: ${String(e).slice(0, 240)}`));
      return p;
    };

    // ── 1. The webhook only accepts Telegram ──
    check("webhook: no secret header → 401", (await post({ update_id: ++updateId }, null)) === 401);
    check("webhook: wrong secret → 401", (await post({ update_id: ++updateId }, "x".repeat(48))) === 401);
    check("webhook: right secret, broken JSON → 400", (await post({}, SECRET, "{not json")) === 400);
    check("webhook: right secret, not an update → 400", (await post({ hello: 1 })) === 400);

    // ── 2. Strangers get a locked message and nothing else ──
    let mark = calls.length;
    await say(CHAT.stranger, "/orders");
    await say(CHAT.stranger, "📊 Огляд та Каса");
    await press(CHAT.stranger, `op:${buyer.id}`);
    const toStranger = calls.slice(mark).filter((c) => String(c.body.chat_id) === String(CHAT.stranger));
    check(
      "stranger: /orders and the menu text → only the locked message, no data; a forged button → locked alert",
      toStranger.length === 2 && toStranger.every((c) => textOf(c).startsWith(LOCKED) && !buttons(c).length) && answers(mark).some((a) => a.startsWith(LOCKED)),
      toStranger.map(textOf)
    );
    for (let i = 0; i < 5; i++) await say(CHAT.stranger, "/link 000000");
    mark = calls.length;
    await say(CHAT.stranger, "/link 000001");
    check("stranger: guessing /link codes → 'too many attempts' after 5", /Забагато спроб/.test(textOf(sent(CHAT.stranger, mark)[0])), textOf(sent(CHAT.stranger, mark)[0]));

    // ── 3. Pairing from /admin/telegram ──
    const ownerCtx = await context(ownerTok);
    const op = watch(await ownerCtx.newPage());
    await op.goto(`${B}/uk/admin/telegram`, { waitUntil: "load" });
    await op.locator("[data-admin-telegram]").waitFor({ timeout: 40_000 });
    check(
      "/admin/telegram: bot @verify_admin_bot, 'Не підключено', webhook not registered",
      (await op.locator("[data-tg-bot]").innerText()) === "@verify_admin_bot" && (await op.locator("[data-tg-linked]").innerText()) === "Не підключено" && (await op.locator('[data-tg-webhook="no"]').count()) === 1
    );
    await op.locator("[data-tg-generate]").click();
    await op.locator("[data-tg-deeplink]").waitFor({ timeout: 15_000 });
    const deepLink = (await op.locator("[data-tg-deeplink]").getAttribute("href")) ?? "";
    const startToken = deepLink.match(/^https:\/\/t\.me\/verify_admin_bot\?start=([A-Za-z0-9_-]{32})$/)?.[1];
    const ownerCode = await op.locator("[data-tg-code]").getAttribute("data-tg-code");
    check("generate: deep link https://t.me/verify_admin_bot?start=<32 chars> and a 6-digit code", !!startToken && /^\d{6}$/.test(ownerCode ?? ""), deepLink);
    const stored = await prisma.user.findUnique({ where: { id: owner.id }, select: { telegramLinkTokenHash: true, telegramLinkCodeHash: true } });
    check("only hashes of the token and code are stored", !!stored?.telegramLinkTokenHash && stored.telegramLinkTokenHash !== startToken && stored.telegramLinkCodeHash !== ownerCode);
    mark = calls.length;
    await say(CHAT.owner, `/start ${startToken}`, {}, "owner_tg");
    const paired = await prisma.user.findUnique({ where: { id: owner.id }, select: { telegramChatId: true, telegramUsername: true, telegramLinkTokenHash: true } });
    const welcome = sent(CHAT.owner, mark)[0];
    check(
      "/start <token> → owner linked (chat id, @username), token spent, welcome + menu keyboard",
      paired?.telegramChatId === String(CHAT.owner) && paired.telegramUsername === "owner_tg" && !paired.telegramLinkTokenHash && /Підключено/.test(textOf(welcome)) && JSON.stringify(welcome?.body.reply_markup).includes("📦 Замовлення")
    );
    mark = calls.length;
    await say(CHAT.other, `/start ${startToken}`);
    check("the same link again (another chat) → invalid, not linked", /недійсні/.test(textOf(sent(CHAT.other, mark)[0])) && !(await prisma.user.findFirst({ where: { telegramChatId: String(CHAT.other) } })));
    await op.reload({ waitUntil: "load" });
    await op.locator("[data-tg-linked]").waitFor();
    check("/admin/telegram after pairing: '● Підключено (@owner_tg)'", (await op.locator("[data-tg-linked]").innerText()) === "● Підключено (@owner_tg)");

    const adminCtx = await context(adminTok);
    const ap = watch(await adminCtx.newPage());
    await ap.goto(`${B}/uk/admin/telegram`, { waitUntil: "load" });
    await ap.locator("[data-tg-generate]").click();
    await ap.locator("[data-tg-code]").waitFor({ timeout: 15_000 });
    const adminCode = (await ap.locator("[data-tg-code]").getAttribute("data-tg-code")) ?? "";
    mark = calls.length;
    await say(CHAT.admin, `/link ${adminCode}`, {}, "admin_tg");
    check(
      "ADMIN pairs with the 6-digit code; no webhook card for ADMIN",
      (await prisma.user.findUnique({ where: { id: admin.id }, select: { telegramChatId: true } }))?.telegramChatId === String(CHAT.admin) && /Підключено/.test(textOf(sent(CHAT.admin, mark)[0])) && (await ap.locator("[data-tg-webhook-card]").count()) === 0
    );
    // ADMIN turns support alerts off.
    await ap.reload({ waitUntil: "load" });
    await ap.locator('[data-tg-event="support"]').uncheck();
    await ap.locator("[data-tg-save]").click();
    const prefs = await until(async () => {
      const u = await prisma.user.findUnique({ where: { id: admin.id }, select: { telegramNotifyEvents: true } });
      return u && !u.telegramNotifyEvents.includes("support") ? u : null;
    });
    check("ADMIN unticks 'Повідомлення підтримки' and saves → stored", prefs?.telegramNotifyEvents.join() === "order,payment,fgas,returns", prefs?.telegramNotifyEvents);

    mark = calls.length;
    await op.locator("[data-tg-test]").click();
    const test = await until(() => sent(CHAT.owner, mark)[0]);
    check("'Тестове повідомлення' → delivered to the owner's chat", /Тестове повідомлення/.test(textOf(test ?? undefined)));
    await op.locator("[data-tg-register]").click();
    await until(() => hook.url);
    check("'Зареєструвати вебхук' → setWebhook(<site>/api/telegram/webhook, secret_token = TELEGRAM_WEBHOOK_SECRET)", hook.url === `${B}/api/telegram/webhook` && hook.secret === SECRET, hook.url);
    await op.reload({ waitUntil: "load" });
    check("/admin/telegram: webhook 'Зареєстровано'", (await op.locator('[data-tg-webhook="ok"]').innerText()).includes("Зареєстровано"));
    await layout(B, ownerTok, "/uk/admin/telegram", "telegram-linked");
    await layout(B, ownerTok, "/en/admin", "overview-linked");
    await op.goto(`${B}/uk/admin`, { waitUntil: "load" });
    check("/admin overview: 'Telegram бот керування' card → linked (@owner_tg)", (await op.locator('[data-overview-telegram="linked"]').innerText()).includes("● Підключено (@owner_tg)"));

    // ── 4. Menus ──
    mark = calls.length;
    await say(CHAT.owner, "/menu");
    await say(CHAT.owner, "/stats");
    await say(CHAT.owner, "📦 Замовлення");
    await say(CHAT.owner, "/users");
    await say(CHAT.owner, "/inventory");
    await say(CHAT.owner, "/broadcast");
    const menus = sent(CHAT.owner, mark).map(textOf);
    check(
      "/menu, /stats, 📦 Замовлення, /users, /inventory, /broadcast → their screens",
      /керування/.test(menus[0] ?? "") && /Огляд та Каса/.test(menus[1] ?? "") && /Надійшло сьогодні/.test(menus[1] ?? "") && /Замовлення ·/.test(menus[2] ?? "") && /Користувачі ·/.test(menus[3] ?? "") && /Склад та Ціни/.test(menus[4] ?? "") && /Оголошення на сайті/.test(menus[5] ?? ""),
      menus.map((m) => m.slice(0, 40))
    );

    // ── 5. New order alert → confirm SEPA → ship DHL → delivered ──
    mark = calls.length;
    const placed = await api("/api/checkout", buyerTok, { addressId: address.id, items: [{ sku: orderProduct.sku, qty: 1 }] });
    const orderA = (await placed.json()) as { ok: boolean; orderId: string; orderNumber: string };
    const alertA = await until(() => sent(CHAT.owner, mark).find((c) => textOf(c).includes(orderA.orderNumber)));
    const alertAdmin = sent(CHAT.admin, mark).find((c) => textOf(c).includes(orderA.orderNumber));
    const kbA = buttons(alertA ?? undefined).map((b) => b.callback_data ?? b.url);
    check(
      `new order ${orderA.orderNumber} → '📦 Нове замовлення' to owner and admin, buyer escaped, buttons: confirm SEPA, cancel, invoice`,
      orderA.ok && /Нове замовлення/.test(textOf(alertA ?? undefined)) && !!alertAdmin && textOf(alertA ?? undefined).includes("Freon &amp; &lt;Co&gt; GmbH") && kbA.includes(`op:${orderA.orderId}`) && kbA.includes(`ox:${orderA.orderId}`) && kbA.includes(`oi:${orderA.orderId}`),
      kbA
    );
    mark = calls.length;
    await press(CHAT.owner, `op:${orderA.orderId}`, alertA?.id ?? 1);
    const paidA = await prisma.order.findUnique({ where: { id: orderA.orderId }, select: { paymentStatus: true, paidAt: true, invoice: { select: { status: true } } } });
    const paidMail = await until(() => mailTo(buyer.email!, `Оплату за замовлення ${orderA.orderNumber} отримано`));
    const editedA = edits(CHAT.owner, mark)[0];
    check(
      "✅ Підтвердити оплату SEPA → order PAID (+ invoice PAID), toast, card re-rendered with ship buttons, 'payment received' e-mail with the PDF",
      paidA?.paymentStatus === "PAID" && !!paidA.paidAt && paidA.invoice?.status === "PAID" && /Оплату підтверджено/.test(answers(mark).join()) && buttons(editedA).some((b) => b.callback_data === `os:${orderA.orderId}:DHL`) && !!paidMail && /application\/pdf/.test(paidMail.raw),
      { paidA, toast: answers(mark), mail: !!paidMail }
    );
    mark = calls.length;
    await press(CHAT.owner, `os:${orderA.orderId}:DHL`);
    check("🚚 Відправити: DHL → asks for the tracking number", /номер відстеження DHL/.test(textOf(sent(CHAT.owner, mark)[0])));
    mark = calls.length;
    await say(CHAT.owner, "12");
    check("a malformed tracking number → asked again", /неправильно/.test(textOf(sent(CHAT.owner, mark)[0])), textOf(sent(CHAT.owner, mark)[0]));
    mark = calls.length;
    await say(CHAT.owner, "jd0146 0000 1234 5678");
    const shippedA = await prisma.order.findUnique({ where: { id: orderA.orderId }, select: { shippingCarrier: true, trackingNumber: true, shipmentStage: true } });
    const shipMail = await until(() => mails.find((m) => m.to.includes(buyer.email!.toLowerCase()) && /JD01460000123456/.test(m.raw.replace(/=\r\n/g, ""))));
    check(
      "tracking 'jd0146 0000 1234 5678' → DHL, JD0146000012345678, DISPATCHED, buyer e-mailed",
      shippedA?.shippingCarrier === "DHL" && shippedA.trackingNumber === "JD0146000012345678" && shippedA.shipmentStage === "DISPATCHED" && /Відправлено/.test(textOf(sent(CHAT.owner, mark)[0])) && !!shipMail,
      shippedA
    );
    mark = calls.length;
    await press(CHAT.owner, `od:${orderA.orderId}`);
    const deliveredA = await prisma.order.findUnique({ where: { id: orderA.orderId }, select: { shipmentStage: true } });
    check("✅ Позначити доставленим → DELIVERED", deliveredA?.shipmentStage === "DELIVERED" && /доставленим/.test(answers(mark).join()), deliveredA);

    // ── 6. "Payment sent" alert → cancel ──
    const placedB = await api("/api/checkout", buyerTok, { addressId: address.id, items: [{ sku: orderProduct.sku, qty: 1 }] });
    const orderB = (await placedB.json()) as { ok: boolean; orderId: string; orderNumber: string };
    await until(() => sent(CHAT.owner).find((c) => textOf(c).includes(orderB.orderNumber)));
    mark = calls.length;
    await action("reportPaymentSent", `/uk/checkout/success?orderId=${orderB.orderId}`, buyerTok, { orderId: orderB.orderId, reference: "E2E-TX-77" });
    const reported = await until(() => sent(CHAT.owner, mark).find((c) => /повідомив про оплату SEPA/.test(textOf(c))));
    check(
      "buyer presses 'payment sent' → '💶 Клієнт повідомив про оплату SEPA' with the reference and the confirm button",
      textOf(reported ?? undefined).includes("E2E-TX-77") && textOf(reported ?? undefined).includes(orderB.orderNumber) && buttons(reported ?? undefined).some((b) => b.callback_data === `op:${orderB.orderId}`)
    );
    const stockBeforeCancel = (await prisma.product.findUnique({ where: { id: orderProduct.id }, select: { stockQuantity: true } }))!.stockQuantity;
    mark = calls.length;
    await press(CHAT.owner, `ox:${orderB.orderId}`);
    check("❌ Скасувати замовлення → asks to confirm", buttons(edits(CHAT.owner, mark)[0]).some((b) => b.callback_data === `oX:${orderB.orderId}`));
    await press(CHAT.owner, `oX:${orderB.orderId}`);
    const cancelled = await prisma.order.findUnique({ where: { id: orderB.orderId }, select: { status: true, paymentStatus: true } });
    const stockAfterCancel = (await prisma.product.findUnique({ where: { id: orderProduct.id }, select: { stockQuantity: true } }))!.stockQuantity;
    check("confirm → order cancelled (payment FAILED), its cylinder back in stock", cancelled?.paymentStatus === "FAILED" && stockAfterCancel === stockBeforeCancel + 1, { cancelled, stockBeforeCancel, stockAfterCancel });

    // ── 7. Cylinder return ──
    mark = calls.length;
    await action("requestCylinderReturn", "/uk/profile", buyerTok, { quantity: 1, method: "DROP_OFF" });
    const ret = await until(() => prisma.cylinderReturnRequest.findFirst({ where: { userId: buyer.id } }));
    const retAlert = await until(() => sent(CHAT.owner, mark).find((c) => /повернення порожніх балонів/.test(textOf(c))));
    check("return request → '♻️ Заявка на повернення' with both buttons", !!ret && buttons(retAlert ?? undefined).map((b) => b.callback_data).join() === `ra:${ret.id},rg:${ret.id}`);
    await press(CHAT.owner, `ra:${ret!.id}`);
    const scheduled = await prisma.cylinderReturnRequest.findUnique({ where: { id: ret!.id }, select: { status: true } });
    // (The cancelled order already wrote one RETURNED row when it released its cylinder.)
    const returnedBefore = await prisma.cylinderTransaction.count({ where: { userId: buyer.id, type: "RETURNED" } });
    await press(CHAT.owner, `rg:${ret!.id}`);
    const collected = await prisma.cylinderReturnRequest.findUnique({ where: { id: ret!.id }, select: { status: true } });
    const returnedTx = (await prisma.cylinderTransaction.count({ where: { userId: buyer.id, type: "RETURNED" } })) - returnedBefore;
    check("✅ Прийнято в роботу → SCHEDULED; ♻️ Тару отримано → COLLECTED + a RETURNED cylinder transaction", scheduled?.status === "SCHEDULED" && collected?.status === "COLLECTED" && returnedTx === 1, { scheduled, collected, returnedTx });

    // ── 8. Support ──
    mark = calls.length;
    const esc1 = await api("/api/chat/escalate", buyerTok, { pathname: "/uk/profile" });
    const chatCookie = (esc1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const handoff = await until(() => sent(CHAT.owner, mark).find((c) => /підтримку/.test(textOf(c))));
    check("'Talk to a person' → '💬 Нове повідомлення у підтримку' to the owner only (admin opted out)", !!handoff && sent(CHAT.admin, mark).length === 0);
    mark = calls.length;
    await fetch(`${B}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `authjs.session-token=${buyerTok}; ${chatCookie}` },
      body: JSON.stringify({ message: { role: "user", parts: [{ type: "text", text: "Коли буде доставка <R-32>?" }] } }),
    }).then((r) => r.text());
    const fwd = await until(() => sent(CHAT.owner, mark).find((c) => textOf(c).includes("Коли буде доставка &lt;R-32&gt;?")));
    const session = await prisma.chatSession.findFirst({ where: { userId: buyer.id }, select: { id: true } });
    check("the buyer's next message is forwarded (escaped) with '✍️ Відповісти клієнту'", !!fwd && buttons(fwd ?? undefined).some((b) => b.callback_data === `sr:${session?.id}`));
    mark = calls.length;
    await say(CHAT.owner, "Завтра до 12:00 😊", { reply_to_message: { message_id: fwd?.id } });
    const agentMsg = await prisma.chatMessage.findFirst({ where: { sessionId: session!.id, role: "human_agent" }, orderBy: { createdAt: "desc" } });
    check("a Telegram reply to the forwarded message → saved in the website chat as the team", agentMsg?.content === "Завтра до 12:00 😊" && /Відповідь надіслано/.test(textOf(sent(CHAT.owner, mark)[0])), agentMsg?.content);
    await press(CHAT.owner, `sr:${session!.id}`);
    await say(CHAT.owner, "І ще: рахунок вже у пошті.");
    const agentCount = await prisma.chatMessage.count({ where: { sessionId: session!.id, role: "human_agent" } });
    check("✍️ Відповісти клієнту → the next text is saved too", agentCount === 2, agentCount);

    // ── 9. F-Gas review ──
    const { alertFgasReview } = await import("@/lib/telegram/alerts");
    mark = calls.length;
    const pdf = new TextEncoder().encode("%PDF-1.4\n% verify\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    await alertFgasReview(fgas1.id, { verdict: "PENDING_REVIEW", reason: "Номер не збігається з реєстром", document: { bytes: pdf, contentType: "application/pdf" } });
    await alertFgasReview(fgas2.id, { verdict: "PENDING_REVIEW" });
    const doc = sent(CHAT.admin, mark, "sendDocument")[0];
    const fcard = sent(CHAT.admin, mark).find((c) => textOf(c).includes(fgas1.email!));
    check(
      "F-Gas upload → the document (PDF) then the card with Verify / Reject, to owner and admin",
      !!doc && doc.body.pdf === true && sent(CHAT.owner, mark, "sendDocument").length === 1 && /на перевірку/.test(textOf(fcard)) && /Номер не збігається/.test(textOf(fcard)) && buttons(fcard).some((b) => b.callback_data === `fv:${fgas1.id}`) && buttons(fcard).some((b) => b.callback_data === `fr:${fgas1.id}`)
    );
    mark = calls.length;
    await press(CHAT.admin, `fv:${fgas1.id}`);
    const v1 = await prisma.user.findUnique({ where: { id: fgas1.id }, select: { fGasStatus: true, certificates: { where: { isActive: true }, select: { certificateNumber: true } } } });
    check("ADMIN ✅ Verify → VERIFIED with an active certificate; toast", v1?.fGasStatus === "VERIFIED" && v1.certificates.length === 1 && /підтверджено/.test(answers(mark).join()), v1);
    await press(CHAT.owner, `fr:${fgas2.id}`);
    await say(CHAT.owner, "Документ нечитабельний");
    const r2 = await prisma.user.findUnique({ where: { id: fgas2.id }, select: { fGasStatus: true, fGasRejectionReason: true } });
    const verdictMails = await until(() => (mailTo(fgas1.email!, "") && mailTo(fgas2.email!, "") ? true : null));
    check("❌ Reject with a reason → REJECTED, reason stored; both applicants e-mailed", r2?.fGasStatus === "REJECTED" && r2.fGasRejectionReason === "Документ нечитабельний" && !!verdictMails, r2);

    // ── 10. Stock & price ──
    const p0 = (await prisma.product.findUnique({ where: { id: editProduct.id }, select: { stockQuantity: true, pricePerKg: true } }))!;
    mark = calls.length;
    await press(CHAT.owner, `pv:${editProduct.id}`);
    const pcard = edits(CHAT.owner, mark)[0];
    check("product card: +5 / +10 / −1, exact, 0, price (owner)", ["pa:" + editProduct.id + ":5", "pa:" + editProduct.id + ":10", "pa:" + editProduct.id + ":-1", "ps:" + editProduct.id, "pz:" + editProduct.id, "pp:" + editProduct.id].every((d) => buttons(pcard).some((b) => b.callback_data === d)));
    await press(CHAT.owner, `pa:${editProduct.id}:5`);
    await press(CHAT.owner, `pa:${editProduct.id}:-1`);
    const pAfterDelta = (await prisma.product.findUnique({ where: { id: editProduct.id }, select: { stockQuantity: true } }))!.stockQuantity;
    await press(CHAT.owner, `ps:${editProduct.id}`);
    await say(CHAT.owner, "42");
    const pExact = (await prisma.product.findUnique({ where: { id: editProduct.id }, select: { stockQuantity: true } }))!.stockQuantity;
    check(`stock: +5, −1 → ${p0.stockQuantity + 4}; exact 42 → 42`, pAfterDelta === p0.stockQuantity + 4 && pExact === 42, { from: p0.stockQuantity, pAfterDelta, pExact });
    mark = calls.length;
    await press(CHAT.admin, `pp:${editProduct.id}`);
    check("ADMIN can't change prices (inventory.catalog) → ⛔ toast, no prompt", /Недостатньо прав/.test(answers(mark).join()) && sent(CHAT.admin, mark).length === 0, answers(mark));

    const live = new Map((await getGasIndex()).filter((g) => g.available).map((g) => [g.mark, g.perKg]));
    const alerts = await prisma.priceAlert.findMany({ where: { triggeredAt: null, mark: { in: [...live.keys()] } }, select: { mark: true, targetPerKg: true } });
    const due = alerts.filter((a) => Number(a.targetPerKg) >= (live.get(a.mark) ?? Infinity)).length;
    if (due > 0) {
      console.log(`SKIP  price change: ${due} customer price alert(s) are already due and would be e-mailed to the sink`);
    } else {
      const newPrice = Math.round((p0.pricePerKg + 1) * 100) / 100;
      await press(CHAT.owner, `pp:${editProduct.id}`);
      mark = calls.length;
      await say(CHAT.owner, "abc");
      check("price: 'abc' → refused, asked again", /більшою за 0/.test(textOf(sent(CHAT.owner, mark)[0])));
      mark = calls.length;
      await say(CHAT.owner, newPrice.toFixed(2).replace(".", ","));
      const priced = (await prisma.product.findUnique({ where: { id: editProduct.id }, select: { pricePerKg: true } }))!.pricePerKg;
      const snap = await until(() => prisma.priceSnapshot.findFirst({ where: { productId: editProduct.id, source: "change", recordedAt: { gte: startedAt } } }));
      check(`price ${p0.pricePerKg} → ${newPrice} EUR/kg (typed with a comma) → stored + a /hub price-history point`, priced === newPrice && Number(snap?.pricePerKg) === newPrice && /Ціну .* змінено/.test(textOf(sent(CHAT.owner, mark)[0])), { priced, snap: snap?.pricePerKg });
    }
    await press(CHAT.owner, `pz:${editProduct.id}`);
    const pZero = await prisma.product.findUnique({ where: { id: editProduct.id }, select: { stockQuantity: true } });
    check("Немає в наявності (0) → 0", pZero?.stockQuantity === 0);

    // ── 11. Users: lock / unlock (owner only) ──
    mark = calls.length;
    await press(CHAT.admin, `uk:${buyer.id}`);
    check("ADMIN can't lock accounts → ⛔", /Недостатньо прав/.test(answers(mark).join()) && !(await prisma.user.findUnique({ where: { id: buyer.id }, select: { lockedAt: true } }))?.lockedAt);
    await press(CHAT.owner, `uv:${buyer.id}`);
    await press(CHAT.owner, `uk:${buyer.id}`);
    const locked = await prisma.user.findUnique({ where: { id: buyer.id }, select: { lockedAt: true } });
    const sessionWhileLocked = (await (await fetch(`${B}/api/auth/session`, { headers: { cookie: `authjs.session-token=${buyerTok}` } })).json()) as { user?: unknown } | null;
    await press(CHAT.owner, `uu:${buyer.id}`);
    const unlocked = await prisma.user.findUnique({ where: { id: buyer.id }, select: { lockedAt: true } });
    check("owner 🔒 locks the buyer → their session stops working; 🔓 unlocks", !!locked?.lockedAt && !sessionWhileLocked?.user && !unlocked?.lockedAt);

    // ── 12. Announcement banner ──
    await press(CHAT.owner, "an:new");
    const bannerText = `Склад зачинено 1 січня · ${TAG}`;
    await say(CHAT.owner, bannerText);
    const on = await prisma.siteAnnouncement.findFirst({ orderBy: { updatedAt: "desc" } });
    const home = await (await fetch(`${B}/uk/hub`)).text();
    check("📢 new text → active announcement, shown on the site", on?.active === true && on.text === bannerText && home.includes("data-site-announcement") && home.includes(TAG));
    await press(CHAT.owner, "an:off");
    const homeOff = await (await fetch(`${B}/uk/hub`)).text();
    check("🔕 Приховати → banner gone", !homeOff.includes(TAG) && (await prisma.siteAnnouncement.findFirst({ orderBy: { updatedAt: "desc" } }))?.active === false);

    // ── 13. 2FA is still required; retries are ignored ──
    await prisma.user.update({ where: { id: admin.id }, data: { isTwoFactorEnabled: false } });
    mark = calls.length;
    await say(CHAT.admin, "/orders");
    check("ADMIN without 2FA → told to enable it, no data", /двофакторну/.test(textOf(sent(CHAT.admin, mark)[0])) && !buttons(sent(CHAT.admin, mark)[0]).length);
    await prisma.user.update({ where: { id: admin.id }, data: { isTwoFactorEnabled: true } });
    const replay = { update_id: updateId, message: { message_id: 1, from: { id: CHAT.owner, is_bot: false, first_name: "T" }, chat: { id: CHAT.owner, type: "private" }, date: 0, text: "/stats" } };
    mark = calls.length;
    await post(replay);
    check("a redelivered update_id → ignored", calls.length === mark);

    // ── 14. /admin reflects the bot's changes ──
    await op.goto(`${B}/uk/admin/orders?q=${orderA.orderNumber}`, { waitUntil: "load" });
    const row = await op.locator(`[data-order-row="${orderA.orderNumber}"]`).first().innerText({ timeout: 30_000 });
    check("/admin/orders: the order shows paid, delivered, DHL JD0146000012345678", /JD0146000012345678/.test(row) && /(Доставлено|Delivered)/i.test(row), row.replace(/\n/g, " | ").slice(0, 200));
    await op.goto(`${B}/uk/admin/users?q=${encodeURIComponent(fgas1.email!)}`, { waitUntil: "load" });
    const usersText = await op.locator("body").innerText();
    check("/admin/users: the applicant approved in Telegram shows as verified", usersText.includes(fgas1.email!) && /(Підтверджено|Verified|VERIFIED)/.test(usersText));

    // ── 15. Every message is well-formed ──
    const outgoing = calls.filter((c) => c.method === "sendMessage" || c.method === "editMessageText");
    const badData = outgoing.flatMap(buttons).filter((b) => b.callback_data && Buffer.byteLength(b.callback_data) > 64);
    check(
      `all ${outgoing.length} messages: HTML parse mode, ≤ 4096 chars, every callback_data ≤ 64 bytes, only the test token used`,
      outgoing.every((c) => c.body.parse_mode === "HTML" && textOf(c).length <= 4096) && badData.length === 0 && calls.every((c) => c.token === TOKEN),
      badData.slice(0, 3)
    );
    await ownerCtx.close();
    await adminCtx.close();

    // ── 16. Without a token: no bot, no crash, clear setup instructions ──
    const barePort = PORT + 1;
    const bareLog: string[] = [];
    bare = startApp(barePort, { ...env, TELEGRAM_BOT_TOKEN: "", TELEGRAM_WEBHOOK_SECRET: "", TELEGRAM_API_BASE: "", AUTH_URL: `http://localhost:${barePort}`, NEXT_PUBLIC_SITE_URL: `http://localhost:${barePort}` }, bareLog);
    await waitUp(`http://localhost:${barePort}`);
    const bareHook = await fetch(`http://localhost:${barePort}/api/telegram/webhook`, { method: "POST", headers: { "x-telegram-bot-api-secret-token": SECRET }, body: "{}" });
    const bareCtx = await context(ownerTok);
    const bp = watch(await bareCtx.newPage());
    await bp.goto(`http://localhost:${barePort}/uk/admin/telegram`, { waitUntil: "load" });
    const setup = await bp.locator("[data-tg-setup]").innerText({ timeout: 30_000 });
    const status = await bp.locator("[data-tg-bot]").innerText();
    await bp.goto(`http://localhost:${barePort}/uk/admin`, { waitUntil: "load" });
    const card = await bp.locator('[data-overview-telegram="unconfigured"]').innerText();
    check(
      "no TELEGRAM_BOT_TOKEN: webhook 503; /admin/telegram 'Не налаштовано' + how to add TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET; overview card says so",
      bareHook.status === 503 && status === "Не налаштовано" && /TELEGRAM_BOT_TOKEN=/.test(setup) && /TELEGRAM_WEBHOOK_SECRET=/.test(setup) && /TELEGRAM_BOT_TOKEN/.test(card),
      { status: bareHook.status, card }
    );
    await bareCtx.close();
    await layout(`http://localhost:${barePort}`, ownerTok, "/uk/admin/telegram", "telegram-unconfigured");
    serverLog.push(...bareLog);

    // ── 17. Clean run ──
    await sleep(1500);
    const log = serverLog.join("");
    // "destination stream closed early": the browser left /admin/orders (a page that keeps streaming) — an aborted response, not a failure.
    const errs = log.split("\n").filter((l) => /Error|⨯|Unhandled|DEP0/.test(l) && !/\[rbac\]|destination stream closed early/.test(l));
    check("server log: no errors", errs.length === 0, errs.slice(0, 6));
    check("0 model calls (OpenAI unreachable and never tried)", !/openai|ai-usage|127\.0\.0\.1:9/i.test(log));
    check("0 browser console errors", consoleErrors.length === 0, consoleErrors.slice(0, 5));
  } catch (error) {
    console.error(error);
    fail++;
  } finally {
    // Children first, so nothing writes while the fixtures go.
    app?.kill("SIGTERM");
    bare?.kill("SIGTERM");
    await browser?.close().catch(() => {});
    await sleep(500);
    const ids = created.users;
    if (ids.length) {
      const orders = await prisma.order.findMany({ where: { userId: { in: ids } }, select: { id: true } });
      await prisma.cylinderTransaction.deleteMany({ where: { userId: { in: ids } } });
      await prisma.cylinderReturnRequest.deleteMany({ where: { userId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
      await prisma.chatSession.deleteMany({ where: { userId: { in: ids } } });
      await prisma.fgasAuditLog.deleteMany({ where: { userId: { in: ids } } });
      await prisma.certificate.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    for (const p of restore) await prisma.product.update({ where: { id: p.id }, data: { stockQuantity: p.stockQuantity, inStock: p.inStock, stock: p.stock, pricePerKg: p.pricePerKg } });
    if (restore.length) await prisma.priceSnapshot.deleteMany({ where: { productId: { in: restore.map((p) => p.id) }, recordedAt: { gte: startedAt } } });
    await prisma.siteAnnouncement.deleteMany({ where: { id: { notIn: [...announcementIds] } } });
    if (announcementBefore) await prisma.siteAnnouncement.update({ where: { id: announcementBefore.id }, data: { text: announcementBefore.text, active: announcementBefore.active, updatedById: announcementBefore.updatedById } });
    const chats = Object.values(CHAT).map(String);
    await prisma.telegramChatState.deleteMany({ where: { chatId: { in: chats } } });
    await prisma.telegramMessageRef.deleteMany({ where: { chatId: { in: chats } } });
    await prisma.telegramUpdate.deleteMany({ where: { updateId: { gte: BigInt(updateBase), lte: BigInt(updateId) } } });
    const left = await prisma.user.count({ where: { email: { startsWith: TAG } } });
    const back = await prisma.product.findMany({ where: { id: { in: restore.map((p) => p.id) } }, select: { sku: true, stockQuantity: true, pricePerKg: true } });
    console.log(`cleanup: ${left} test users left; restored ${JSON.stringify(back)}; ${mails.length} e-mails caught by the sink; ${calls.length} Bot API calls, all to the mock`);
    await prisma.$disconnect();
    mock.close();
    sink.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
}

main();
