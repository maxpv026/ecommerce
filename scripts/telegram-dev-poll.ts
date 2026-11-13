/**
 * Local development without a public tunnel: long-poll Telegram for the bot's
 * updates and forward each one to your local webhook, with the secret header.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/telegram-dev-poll.ts
 *   npx tsx … scripts/telegram-dev-poll.ts --url http://localhost:3000 --delete-webhook
 *
 * Telegram delivers updates EITHER to a webhook OR to getUpdates. If the bot
 * has a webhook (production), polling fails with 409 — this script refuses to
 * remove it unless you pass --delete-webhook. Use a separate dev bot
 * (@BotFather) rather than the production one: deleting its webhook stops
 * production alerts' buttons from working until it is registered again from
 * /admin/telegram.
 *
 * Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (same values as the
 * running app). TELEGRAM_API_BASE is honoured, like the app.
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const api = (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/+$/, "");
const args = process.argv.slice(2);
const urlArg = args[args.indexOf("--url") + 1];
const target = `${(args.includes("--url") && urlArg ? urlArg : "http://localhost:3000").replace(/\/+$/, "")}/api/telegram/webhook`;

if (!token || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (in .env / .env.local) first.");
  process.exit(1);
}

async function tg<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${api}/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

async function main() {
  const me = await tg<{ username: string }>("getMe");
  const hook = await tg<{ url: string }>("getWebhookInfo");
  if (hook.url) {
    if (!args.includes("--delete-webhook")) {
      console.error(`@${me.username} has a webhook (${hook.url}). Polling can't run alongside it.\nRe-run with --delete-webhook (and re-register it from /admin/telegram afterwards), or use a separate dev bot.`);
      process.exit(1);
    }
    await tg("deleteWebhook", { drop_pending_updates: false });
    console.log(`Removed the webhook ${hook.url}.`);
  }
  console.log(`Polling @${me.username} → ${target}  (Ctrl+C to stop)`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg<Array<{ update_id: number }>>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        const res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret! }, body: JSON.stringify(u) });
        console.log(`update ${u.update_id} → ${res.status}`);
      }
    } catch (error) {
      console.error(String(error));
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
