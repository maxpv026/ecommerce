/**
 * Mobile + desktop verification of the secondary and transactional routes —
 * against the built app, with OpenAI unreachable and mail caught locally.
 *
 *   npm run build
 *   npx tsx --env-file=.env --env-file=.env.local --conditions=react-server scripts/verify-mobile-complete.ts
 *   VERIFY_SHOTS=/tmp/shots …   (full-page PNGs of every screen)
 *
 * Starts `next start` (port VERIFY_PORT, default 3120) with no OpenAI key, a
 * blank Telegram config, SMTP pointed at an in-process sink and a test
 * SDS_EMERGENCY_PHONES; creates a prefixed buyer with a verified F-Gas
 * certificate and real orders through /api/checkout; then checks, at 390×844
 * and 1440×900, light and dark, uk and en:
 *
 *   /products/[id], /categories, /profile (all nine tabs), /profile/compliance,
 *   /compliance/sds, /checkout, /checkout/success, /search, /notifications —
 *   no horizontal overflow, no "lb", no ✨, the app bar on phones, the dock
 *   never covering the last control, 0 console errors, 0 model calls;
 *   plus: the product page's purchase controls near the first fold, the
 *   profile tabs all on screen, SDS emergency numbers switching by country
 *   (tel: links, ADR drawer), the phone copy buttons and folded QR on the
 *   payment screen, the billing email copied on the order confirmation, real
 *   search results and a real notification feed (no samples).
 *
 * Everything it creates is removed in `finally`; stock it reserves is put back.
 */

import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { mkdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { encode } from "@auth/core/jwt";

const PORT = Number(process.env.VERIFY_PORT ?? 3120);
const B = `http://localhost:${PORT}`;
const SHOTS = process.env.VERIFY_SHOTS || null;
const TAG = `vmc-${Date.now().toString(36)}`;

let pass = 0;
let fail = 0;
const check = (name: string, ok: unknown, info: unknown = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || info === "" ? "" : `  (${typeof info === "string" ? info : JSON.stringify(info).slice(0, 600)})`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── SMTP sink: recipients of every message ──
const mails: Array<{ to: string[]; raw: string }> = [];
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
            mails.push({ to, raw: body.join("\r\n") });
            to = [];
            body = [];
            sock.write("250 ok\r\n");
          } else body.push(line);
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

// ── In-page probes (plain JS strings: evaluated as-is) ──
const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth, bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || (r.right <= vw + 0.5 && r.left >= -0.5)) continue;
    let a = el.parentElement, clipped = false;
    while (a && a !== document.body) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) || s.position === "fixed") { clipped = true; break; } a = a.parentElement; }
    if (!clipped) bad.push(el.tagName + "." + String(el.className).slice(0, 50) + " → " + Math.round(r.right));
  }
  return { doc: document.documentElement.scrollWidth <= vw, bad: bad.slice(0, 3) };
})()`;
const TEXT_FACTS = `(() => {
  const t = document.body.innerText;
  return { lb: (t.match(/\\b\\d+(?:[.,]\\d+)?\\s?lb\\b/g) || []).slice(0, 3), sparkle: t.includes("✨"), visa: /4242|Visa ending/i.test(t) };
})()`;
// The dock (64 px + safe area) must not cover the page's last control once scrolled to the end.
const DOCK_CLEAR = `(() => {
  const dock = document.querySelector("[data-mobile-nav]");
  if (!dock || !dock.offsetParent) return { dock: false, ok: true };
  window.scrollTo(0, document.documentElement.scrollHeight);
  const top = dock.getBoundingClientRect().top;
  const controls = [...document.querySelectorAll("main a, main button, main input")].filter((e) => e.offsetParent && !e.closest("[data-mobile-nav]") && getComputedStyle(e).position !== "fixed");
  const last = controls.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  const bottom = last ? last.getBoundingClientRect().bottom : 0;
  return { dock: true, ok: bottom <= top + 0.5, bottom: Math.round(bottom), top: Math.round(top) };
})()`;

async function main() {
  const sink = await startSink();
  const prismaModule = await import("@/lib/prisma");
  const prisma = ((prismaModule as unknown as { default: { default?: typeof prismaModule.default } }).default.default ?? prismaModule.default) as typeof prismaModule.default;

  const log: string[] = [];
  const app: ChildProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_ADMIN_CHAT_ID: "",
      TELEGRAM_ADMIN_CHAT_IDS: "",
      TELEGRAM_CHAT_ID: "",
      TELEGRAM_WEBHOOK_SECRET: "",
      DHL_API_KEY: "",
      AUTH_TRUST_HOST: "true",
      AUTH_URL: B,
      NEXT_PUBLIC_SITE_URL: B,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String((sink.address() as AddressInfo).port),
      SMTP_SECURE: "false",
      SMTP_USER: "sink",
      SMTP_PASS: "sink",
      SMTP_PASSWORD: "sink",
      SDS_EMERGENCY_PHONES: JSON.stringify({ UA: "+380 44 000 00 00" }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout?.on("data", (d: Buffer) => log.push(d.toString()));
  app.stderr?.on("data", (d: Buffer) => log.push(d.toString()));

  const userIds: string[] = [];
  let restore: Array<{ id: string; stockQuantity: number; inStock: boolean; stock: string }> = [];
  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const modelRequests: string[] = [];

  try {
    for (let i = 0; i < 120; i++) {
      if ((await fetch(`${B}/uk/categories`).catch(() => null))?.status === 200) break;
      await sleep(500);
    }

    // ── Fixtures ──
    const buyer = await prisma.user.create({ data: { email: `${TAG}@example.test`, name: "Maksym Tester", emailVerified: new Date(), locale: "uk", fGasStatus: "VERIFIED", epaVerified: true, fGasExpiresAt: new Date("2031-01-01T00:00:00Z") } });
    userIds.push(buyer.id);
    await prisma.certificate.create({ data: { userId: buyer.id, certType: "Category I", certId: `FG-${TAG}`, certificateNumber: `FG-${TAG}`, issuedAt: new Date(), isActive: true, expiresAt: new Date("2031-01-01T00:00:00Z") } });
    const address = await prisma.address.create({ data: { userId: buyer.id, title: "Склад", recipientName: "Maksym", fullAddress: "вул. Промислова 1, 02000 Київ", street: "вул. Промислова 1", city: "Київ", postalCode: "02000", country: "Ukraine", phone: "+380 44 000 00 00", isDefault: true, kind: "SHIPPING" } });
    restore = await prisma.product.findMany({ where: { sku: { in: ["R32", "HC-R134A-30"] } }, select: { id: true, stockQuantity: true, inStock: true, stock: true } });
    const tok = await encode({ token: { sub: buyer.id, email: buyer.email, name: buyer.name, role: "USER", isTwoFactorEnabled: false, authTime: Date.now(), epaVerified: true }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" });
    const cookie = `authjs.session-token=${tok}`;

    // The billing email edited at checkout (stored on the user row, as /checkout's payer form does) gets the confirmation too.
    const billing = `${TAG}-accounts@example.test`;
    await prisma.user.update({ where: { id: buyer.id }, data: { billingEmail: billing, companyName: "Verify GmbH" } });
    const placed = (await (await fetch(`${B}/api/checkout`, { method: "POST", headers: { "content-type": "application/json", cookie, "x-forwarded-for": "198.51.100.120" }, body: JSON.stringify({ addressId: address.id, items: [{ sku: "R32", qty: 1 }] }) })).json()) as { ok: boolean; orderId: string; orderNumber: string };
    check("fixture order placed through /api/checkout", placed.ok, placed);
    let confirmation: { to: string[] } | undefined;
    for (let i = 0; i < 40 && !confirmation; i++) {
      confirmation = mails.find((m) => m.to.includes(buyer.email!.toLowerCase()) && m.raw.includes(placed.orderNumber));
      if (!confirmation) await sleep(250);
    }
    check("order confirmation goes to the buyer AND the billing email entered at checkout (cc)", !!confirmation && confirmation.to.includes(billing.toLowerCase()), confirmation?.to);

    const pdp = await prisma.product.findFirst({ where: { sku: "HC-R134A-30" }, select: { id: true } });
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });

    const variants = [
      { w: 390, loc: "uk", scheme: "light", signed: true },
      { w: 390, loc: "en", scheme: "dark", signed: true },
      { w: 390, loc: "uk", scheme: "dark", signed: false },
      { w: 1440, loc: "uk", scheme: "light", signed: true },
      { w: 1440, loc: "en", scheme: "dark", signed: false },
    ] as const;

    for (const v of variants) {
      const V = `${v.loc} ${v.w} ${v.scheme} ${v.signed ? "user" : "guest"}`;
      const phone = v.w < 768;
      const ctx: BrowserContext = await browser.newContext({ viewport: { width: v.w, height: phone ? 844 : 900 }, colorScheme: v.scheme, isMobile: phone, hasTouch: phone });
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
      if (v.signed) await ctx.addCookies([{ name: "authjs.session-token", value: tok, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
      await ctx.addInitScript(
        ([scheme]) => {
          (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
          try {
            localStorage.setItem("halocore-theme", scheme);
            if (!sessionStorage.getItem("seeded")) {
              localStorage.setItem("halocore-cart", JSON.stringify({ state: { items: [{ sku: "HC-R134A-30", name: "R-134a Standard", variant: "", pricePerKg: 12.05, weightKg: 13.61, deposit: 15, qty: 1 }] }, version: 3 }));
              sessionStorage.setItem("seeded", "1");
            }
          } catch {}
        },
        [v.scheme]
      );
      const p: Page = await ctx.newPage();
      p.on("console", (m) => {
        if (m.type() === "error" && !/ERR_SSL_PROTOCOL_ERROR/.test(m.text())) consoleErrors.push(`${V} ${p.url()} :: ${m.text().slice(0, 200)}`);
      });
      p.on("pageerror", (e) => consoleErrors.push(`${V} ${p.url()} :: ${String(e).slice(0, 200)}`));
      p.on("request", (r) => {
        if (/api\.openai\.com/.test(r.url())) modelRequests.push(r.url());
      });

      const visit = async (path: string, ready: string, name: string) => {
        await p.goto(`${B}/${v.loc}${path}`, { waitUntil: "load" });
        await p.locator(ready).first().waitFor({ timeout: 45_000 });
        await sleep(900);
        const of = (await p.evaluate(OVERFLOW)) as { doc: boolean; bad: string[] };
        const tf = (await p.evaluate(TEXT_FACTS)) as { lb: string[]; sparkle: boolean; visa: boolean };
        const bar = phone ? await p.evaluate(() => !!(document.querySelector("[data-mobile-topbar]") as HTMLElement | null)?.offsetParent) : true;
        const dock = phone ? ((await p.evaluate(DOCK_CLEAR)) as { dock: boolean; ok: boolean }) : { dock: false, ok: true };
        check(`${V} ${path}: no overflow, no lb, no ✨, no sample data${phone && path !== "/checkout" && !path.startsWith("/checkout/") ? ", app bar" : ""}, dock clears the last control`, of.doc && of.bad.length === 0 && tf.lb.length === 0 && !tf.sparkle && !tf.visa && (bar || path.startsWith("/checkout")) && dock.ok, { of, tf, bar, dock });
        if (SHOTS) {
          await p.evaluate(() => window.scrollTo(0, 0));
          await p.screenshot({ path: `${SHOTS}/${name}-${v.loc}-${v.w}-${v.scheme}-${v.signed ? "user" : "guest"}.png`, fullPage: true }).catch(() => {});
        }
      };

      // Product page
      await visit(`/products/${pdp!.id}`, "[data-add-to-cart], [data-cylinder-price]", "pdp");
      const pdpFacts = await p.evaluate(() => {
        window.scrollTo(0, 0);
        const cta = document.querySelector("[data-add-to-cart]") as HTMLElement | null;
        const sizes = [...document.querySelectorAll("[data-size]")].map((e) => (e as HTMLElement).innerText);
        return { ctaTop: cta ? Math.round(cta.getBoundingClientRect().top + window.scrollY) : null, back: !!(document.querySelector("[data-pdp-back]") as HTMLElement | null)?.offsetParent, sizes, pack: document.querySelector("[data-pack-label]")?.textContent ?? "" };
      });
      check(
        `${V} product page: ${phone ? "back pill, 'add to cart' within ~1.3 screens" : "'add to cart' in the first screen"}; sizes in the page language (no 'kg cylinder')`,
        pdpFacts.ctaTop !== null && pdpFacts.ctaTop < (phone ? 1100 : 900) && (!phone || pdpFacts.back) && pdpFacts.sizes.length > 0 && !pdpFacts.sizes.join(" ").includes("kg cylinder") && (v.loc !== "uk" || /кг/.test(pdpFacts.pack)),
        pdpFacts
      );

      await visit("/categories", "main", "categories");

      // Profile — every tab
      if (v.signed) {
        await visit("/profile", "[data-profile-tabs]", "profile");
        const tabs = await p.evaluate(() => [...document.querySelectorAll("[data-profile-tab]")].map((b) => { const r = b.getBoundingClientRect(); return { id: b.getAttribute("data-profile-tab"), in: r.left >= 0 && r.right <= document.documentElement.clientWidth && r.width > 0 }; }));
        check(`${V} /profile: all ${tabs.length} tabs on screen`, tabs.length === 9 && tabs.every((t) => t.in), tabs);
        for (const id of tabs.map((t) => t.id!)) {
          await p.locator(`[data-profile-tab="${id}"]`).click();
          await sleep(500);
          const of = (await p.evaluate(OVERFLOW)) as { doc: boolean; bad: string[] };
          const view = await p.locator("[data-profile-view]").getAttribute("data-profile-view");
          check(`${V} /profile ${id}: opens, no overflow`, view === id && of.doc && of.bad.length === 0, { view, of });
          if (id === "orders") {
            const row = await p.locator(`[data-order-row="${placed.orderNumber}"]`).evaluate((r) => {
              const acts = [...r.querySelectorAll("[data-order-actions] a, [data-order-actions] button")].map((b) => b.getBoundingClientRect());
              return { right: Math.max(...acts.map((a) => a.right)), pdf: !!r.querySelector("[data-order-invoice]"), repeat: !!r.querySelector("[data-order-repeat]") };
            });
            check(`${V} /profile orders: the order card's PDF and Repeat buttons on screen`, row.pdf && row.repeat && row.right <= v.w, row);
          }
          if (SHOTS && phone) await p.screenshot({ path: `${SHOTS}/profile-${id}-${v.loc}-${v.scheme}.png`, fullPage: true }).catch(() => {});
        }

        await visit("/profile/compliance", "[data-compliance-page]", "compliance");
        const comp = await p.evaluate(() => {
          const head = document.querySelector("[data-compliance-header]")!;
          const kpis = [...document.querySelectorAll("[data-kpi]")].map((k) => Math.round(k.getBoundingClientRect().top));
          return { csv: !!head.querySelector("[data-compliance-action='csv']"), pdf: /PDF/.test((head as HTMLElement).innerText), period: !!head.querySelector("[data-compliance-period]"), back: /профіл|profile/i.test((head as HTMLElement).innerText), firstRow: kpis[0] === kpis[1] };
        });
        check(`${V} /profile/compliance: back · period · CSV · audit PDF in the header; KPI cards two per row`, comp.csv && comp.pdf && comp.period && comp.back && comp.firstRow, comp);
      }

      // SDS + emergency card
      await visit("/compliance/sds", "[data-sds-page]", "sds");
      if (v.loc === "uk") {
        const en = await p.evaluate(() => (document.querySelector("[data-sds-page]") as HTMLElement).innerText.match(/\b(?:Safety Data Sheets?|Emergency Response|Ask AI|Download PDF|Consultant)\b/g) ?? []);
        const bad = await p.evaluate(() => /R-?454B|\+44 1865/.test(document.body.innerText));
        check(`${V} /uk/compliance/sds: no English strings, no R-454B, no static UK number`, en.length === 0 && !bad, en);
      }
      const card = p.locator("[data-sds-aside]");
      const order = await p.evaluate(() => { const a = document.querySelector("[data-sds-aside]")!.getBoundingClientRect().top; const rows = document.querySelector("[data-sds-page] [data-sds-row], [data-sds-page] li")?.getBoundingClientRect().top ?? 0; return { asideFirst: a < rows }; });
      const switcher = card.locator("select").first();
      const read = () => card.evaluate((c) => ({ text: (c as HTMLElement).innerText.replace(/\s+/g, " "), tels: [...c.querySelectorAll("a[href^='tel:']")].map((a) => a.getAttribute("href")) }));
      await switcher.selectOption("PL");
      await sleep(250);
      const pl = await read();
      await switcher.selectOption("DE");
      await sleep(250);
      const de = await read();
      await switcher.selectOption("UA");
      await sleep(250);
      const ua = await read();
      check(
        `${V} /compliance/sds emergency card${phone ? " first on the phone" : ""}: PL → 112 / 998 / 999, DE → +49 30 19240 poison line, UA → the configured +380 line — all tel: links`,
        (!phone || order.asideFirst) && /998/.test(pl.text) && /999/.test(pl.text) && pl.tels.includes("tel:112") && de.tels.some((t) => t?.startsWith("tel:+4930")) && ua.tels.some((t) => t?.startsWith("tel:+380")),
        { pl: pl.tels, de: de.tels, ua: ua.tels, order }
      );
      const adr = p.locator("[data-sds-expand]").first();
      if (await adr.count()) {
        await adr.click();
        await sleep(400);
        const opened = await p.evaluate(() => /UN\s?\d{4}/.test(document.body.innerText) && !!document.querySelector("[aria-expanded='true']"));
        check(`${V} /compliance/sds: an ADR drawer opens with the UN number`, opened);
      }

      // Checkout + payment screen
      if (v.signed) {
        await visit("/checkout", "main[data-checkout]", "checkout");
        await visit(`/checkout/success?orderId=${placed.orderId}`, "[data-bank-terminal]", "success");
        const h1Lines = await p.locator("main[data-checkout-success] h1").evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
        if (phone) {
          const quick = await p.evaluate(() => {
            const q = document.querySelector("[data-quick-copy]") as HTMLElement | null;
            const ref = document.querySelector("[data-payment-reference]")!.getBoundingClientRect().top;
            const qr = document.querySelector("[data-epc-qr]") as HTMLElement;
            return { shown: !!q?.offsetParent, before: q ? q.getBoundingClientRect().top < ref : false, tall: [...(q?.querySelectorAll("button") ?? [])].every((b) => b.getBoundingClientRect().height >= 48), qrHidden: !qr.offsetParent };
          });
          await p.locator('[data-quick="q-iban"]').click();
          const iban = await p.evaluate(() => navigator.clipboard.readText());
          await p.locator('[data-quick="q-ref"]').click();
          const ref = await p.evaluate(() => navigator.clipboard.readText());
          await p.locator('[data-quick="q-amount"]').click();
          const amount = await p.evaluate(() => navigator.clipboard.readText());
          await p.locator("[data-qr-toggle]").click();
          const qrShown = await p.evaluate(() => !!(document.querySelector("[data-epc-qr]") as HTMLElement).offsetParent);
          check(
            `${V} payment screen: big copy rows above the details (IBAN without spaces, reference, exact amount), QR folded until asked; title ≤ 2 lines`,
            quick.shown && quick.before && quick.tall && quick.qrHidden && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) && ref === placed.orderNumber && /^\d+\.\d{2}$/.test(amount) && qrShown && h1Lines <= 2,
            { quick, iban, ref, amount, qrShown, h1Lines }
          );
        } else {
          const desk = await p.evaluate(() => ({ quick: !!(document.querySelector("[data-quick-copy]") as HTMLElement | null)?.offsetParent, qr: !!(document.querySelector("[data-epc-qr]") as HTMLElement).offsetParent }));
          check(`${V} payment screen: QR shown, no phone copy panel; title on one line`, !desk.quick && desk.qr && h1Lines === 1, { desk, h1Lines });
        }
      }

      // Search
      await visit("/search", "[data-search-input]", "search");
      await p.locator("[data-search-input]").fill("R-32");
      await p.locator('[data-search-group="products"]').waitFor({ timeout: 15_000 });
      await sleep(600);
      const sr = await p.evaluate(() => ({
        groups: [...document.querySelectorAll("[data-search-group]")].map((g) => g.getAttribute("data-search-group")),
        text: (document.querySelector("[data-search-page]") as HTMLElement).innerText,
        signin: !!document.querySelector("[data-search-orders-signin]"),
      }));
      const sOf = (await p.evaluate(OVERFLOW)) as { doc: boolean };
      check(
        `${V} /search 'R-32': catalog + SDS results${v.signed ? " + this buyer's own order" : ", sign-in hint for orders"}; metric sizes; no overflow`,
        sr.groups.includes("products") && sr.groups.includes("docs") && (v.signed ? sr.groups.includes("orders") : sr.signin) && /кг|kg/.test(sr.text) && !/\blb\b/.test(sr.text) && sOf.doc,
        sr.groups
      );
      if (v.signed && v.loc === "uk") {
        await p.locator("[data-search-input]").fill(placed.orderNumber.slice(-6));
        await p.locator('[data-search-group="orders"]').waitFor({ timeout: 15_000 });
        check(`${V} /search: the order found by its number`, (await p.locator('[data-search-group="orders"]').innerText()).includes(placed.orderNumber));
      }

      // Notifications (phones: the feed)
      if (v.signed && phone) {
        await visit("/notifications", "[data-notifications-feed]", "notifications");
        const feed = await p.evaluate(() => ({ items: [...document.querySelectorAll("[data-feed-item]")].map((i) => i.getAttribute("data-feed-item")), text: (document.querySelector("[data-notifications-feed]") as HTMLElement).innerText }));
        check(`${V} /notifications: this account's real events (order ${placed.orderNumber}), no sample feed`, feed.items.includes("orderPlaced") && feed.text.includes(placed.orderNumber) && !/4242|ORD-8341|ORD-8472/.test(feed.text), feed.items);
      }

      await ctx.close();
    }

    await sleep(800);
    const out = log.join("");
    const spent = out.split("\n").filter((l) => /openai/i.test(l) || (/\[ai-usage\]/.test(l) && !/"in":0,"out":0/.test(l)));
    check("0 model calls", modelRequests.length === 0 && spent.length === 0, spent.slice(0, 3));
    const errs = out.split("\n").filter((l) => /Error|⨯|Unhandled/.test(l) && !/destination stream closed early/.test(l));
    check("server log: no errors", errs.length === 0, errs.slice(0, 5));
    check("0 browser console errors", consoleErrors.length === 0, consoleErrors.slice(0, 5));
  } catch (error) {
    console.error(error);
    fail++;
  } finally {
    await browser?.close().catch(() => {});
    app.kill("SIGTERM");
    await sleep(400);
    if (userIds.length) {
      await prisma.cylinderTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    for (const r of restore) await prisma.product.update({ where: { id: r.id }, data: { stockQuantity: r.stockQuantity, inStock: r.inStock, stock: r.stock } });
    console.log(`cleanup: ${await prisma.user.count({ where: { email: { startsWith: TAG } } })} test users left; ${mails.length} e-mails caught by the sink`);
    await prisma.$disconnect();
    sink.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
}

main();
