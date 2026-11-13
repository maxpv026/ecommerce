"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Bell, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, Loader2, Send, Unlink, Webhook } from "lucide-react";
import { createTelegramLink, registerTelegramWebhook, saveTelegramPrefs, sendTelegramTest, unlinkTelegram } from "@/lib/actions/telegramAdmin";

/**
 * /admin/telegram — "Telegram бот керування": connection status, a one-click
 * deep link (or a 6-digit code) to pair this admin's Telegram, which alerts
 * to receive, a test message, and the webhook (owner). Without a token the
 * page explains which environment variables to add instead of failing.
 */

export interface TelegramPanelData {
  tokenSet: boolean;
  secretSet: boolean;
  botUsername: string | null;
  botReachable: boolean | null;
  webhook: { url: string | null; pending: number; lastError: string | null } | null;
  expectedWebhookUrl: string;
  canManageWebhook: boolean;
  linked: boolean;
  telegramUsername: string | null;
  enabled: boolean;
  events: string[];
}

const EVENTS = ["order", "payment", "fgas", "returns", "support"] as const;
const CARD = "min-w-0 rounded-[22px] border border-slate-900/[.08] bg-white/80 p-5 dark:border-white/[.08] dark:bg-white/[.03]";
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50";
const PRIMARY = `${BTN} bg-blue-700 text-white hover:bg-blue-800`;
const GHOST = `${BTN} border border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]`;

export default function TelegramAdminPanel({ data }: { data: TelegramPanelData }) {
  const t = useTranslations("AdminTelegram");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ deepLink: string | null; code: string; expiresAt: string } | null>(null);
  const [enabled, setEnabled] = useState(data.enabled);
  const [events, setEvents] = useState<string[]>(data.events);
  const configured = data.tokenSet && data.secretSet;
  const hookOk = Boolean(data.webhook?.url && data.webhook.url === data.expectedWebhookUrl);

  const run = (fn: () => Promise<void>) => start(fn);
  const fail = (code: string, detail?: string) => toast.error(t(`err_${code}`, { detail: detail ?? "" }));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10 md:px-8 md:py-14" data-admin-telegram>
      <header className="mb-6">
        <p className="m-0 text-[11px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">{t("eyebrow")}</p>
        <h1 className="m-0 mt-1.5 text-[28px] leading-[1.1] font-semibold tracking-[-.04em] text-slate-900 md:text-[32px] dark:text-white">{t("title")}</h1>
        <p className="m-0 mt-2 max-w-[680px] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">{t("lead")}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Status */}
        <section className={CARD} data-tg-status>
          <h2 className="m-0 text-[15px] font-semibold">{t("statusTitle")}</h2>
          <dl className="m-0 mt-3 flex flex-col gap-2 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("statusBot")}</dt>
              <dd className="m-0 font-semibold" data-tg-bot>{!data.tokenSet ? t("notConfigured") : data.botUsername ? `@${data.botUsername}` : data.botReachable === false ? t("botUnreachable") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("statusWebhook")}</dt>
              <dd className="m-0 text-right font-semibold" data-tg-webhook={hookOk ? "ok" : "no"}>
                {!data.webhook ? "—" : hookOk ? t("webhookOk") : data.webhook.url ? t("webhookOther") : t("webhookNone")}
                {data.webhook?.lastError && <span className="block text-[12px] font-normal text-amber-700 dark:text-amber-400">{data.webhook.lastError}</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("statusMe")}</dt>
              <dd className={`m-0 font-semibold ${data.linked ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}`} data-tg-linked={data.linked ? "1" : "0"}>
                {data.linked ? (data.telegramUsername ? t("connectedAs", { username: `@${data.telegramUsername}` }) : t("connected")) : t("notConnected")}
              </dd>
            </div>
          </dl>
        </section>

        {/* Setup / env */}
        {!configured ? (
          <section className={`${CARD} border-amber-500/30 bg-amber-500/[.06]`} data-tg-setup>
            <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
              <KeyRound size={16} strokeWidth={2.2} />
              {t("setupTitle")}
            </h2>
            <p className="m-0 mt-2 text-[13px] leading-[1.6] text-slate-600 dark:text-slate-300">{t("setupBody")}</p>
            <pre className="m-0 mt-3 overflow-x-auto rounded-[12px] bg-[#0B1020] p-3 text-[12px] leading-[1.6] text-slate-100">{`TELEGRAM_BOT_TOKEN=123456:ABC…   # @BotFather
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
# optional: chats that may act as the owner
TELEGRAM_ADMIN_CHAT_IDS=123456789

npx vercel env add TELEGRAM_BOT_TOKEN production
npx vercel env add TELEGRAM_WEBHOOK_SECRET production`}</pre>
            <p className="m-0 mt-2 text-[12px] text-slate-500">{t("setupLocal")}</p>
          </section>
        ) : (
          <section className={CARD} data-tg-connect>
            <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
              <Link2 size={16} strokeWidth={2.2} />
              {t("connectTitle")}
            </h2>
            <p className="m-0 mt-2 text-[13px] leading-[1.6] text-slate-600 dark:text-slate-300">{t("connectBody")}</p>
            {link ? (
              <div className="mt-3 rounded-[14px] border border-slate-900/[.08] p-3 dark:border-white/[.1]" data-tg-link>
                {link.deepLink && (
                  <a href={link.deepLink} target="_blank" rel="noopener noreferrer" className={PRIMARY} data-tg-deeplink={link.deepLink}>
                    <ExternalLink size={14} strokeWidth={2.2} />
                    {t("openTelegram")}
                  </a>
                )}
                <p className="m-0 mt-3 text-[12.5px] text-slate-600 dark:text-slate-300">
                  {data.botUsername ? t("codeHintBot", { bot: `@${data.botUsername}` }) : t("codeHint")}{" "}
                  <button type="button" onClick={() => navigator.clipboard.writeText(`/link ${link.code}`).then(() => toast.success(t("copied")))} className="inline-flex items-center gap-1 rounded-[8px] bg-slate-900/[.06] px-2 py-0.5 font-mono text-[14px] font-semibold dark:bg-white/[.08]" data-tg-code={link.code}>
                    /link {link.code}
                    <Copy size={12} />
                  </button>
                </p>
                <p className="m-0 mt-1.5 text-[11.5px] text-slate-500">{t("expires", { time: format.dateTime(new Date(link.expiresAt), { timeStyle: "short" }) })}</p>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className={link ? GHOST : PRIMARY}
                data-tg-generate
                onClick={() =>
                  run(async () => {
                    const r = await createTelegramLink();
                    if (r.ok) setLink(r);
                    else fail(r.code);
                  })
                }
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} strokeWidth={2.2} />}
                {link ? t("regenerate") : t("generate")}
              </button>
              {data.linked && (
                <button
                  type="button"
                  disabled={pending}
                  className={GHOST}
                  data-tg-unlink
                  onClick={() =>
                    run(async () => {
                      const r = await unlinkTelegram();
                      if (r.ok) {
                        toast.success(t("unlinked"));
                        router.refresh();
                      } else fail(r.code);
                    })
                  }
                >
                  <Unlink size={14} strokeWidth={2.2} />
                  {t("unlink")}
                </button>
              )}
              <button type="button" disabled={pending} className={GHOST} data-tg-refresh onClick={() => router.refresh()}>
                <CheckCircle2 size={14} strokeWidth={2.2} />
                {t("checkStatus")}
              </button>
            </div>
          </section>
        )}

        {/* Notifications */}
        <section className={CARD} data-tg-prefs>
          <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
            <Bell size={16} strokeWidth={2.2} />
            {t("prefsTitle")}
          </h2>
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-blue-700" data-tg-enabled />
            {t("prefsEnabled")}
          </label>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {EVENTS.map((e) => (
              <label key={e} className={`flex cursor-pointer items-center gap-2.5 text-[13px] ${enabled ? "" : "opacity-50"}`}>
                <input
                  type="checkbox"
                  disabled={!enabled}
                  checked={events.includes(e)}
                  onChange={(ev) => setEvents((cur) => (ev.target.checked ? [...cur, e] : cur.filter((x) => x !== e)))}
                  className="h-4 w-4 accent-blue-700"
                  data-tg-event={e}
                />
                {t(`event_${e}`)}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={PRIMARY}
              data-tg-save
              onClick={() =>
                run(async () => {
                  const r = await saveTelegramPrefs({ enabled, events });
                  if (r.ok) toast.success(t("saved"));
                  else fail(r.code);
                })
              }
            >
              {t("save")}
            </button>
            <button
              type="button"
              disabled={pending || !data.linked || !data.tokenSet}
              className={GHOST}
              data-tg-test
              onClick={() =>
                run(async () => {
                  const r = await sendTelegramTest();
                  if (r.ok) toast.success(t("testSent"));
                  else fail(r.code, r.detail);
                })
              }
            >
              <Send size={14} strokeWidth={2.2} />
              {t("test")}
            </button>
          </div>
        </section>

        {/* Webhook (owner) */}
        {data.canManageWebhook && (
          <section className={CARD} data-tg-webhook-card>
            <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
              <Webhook size={16} strokeWidth={2.2} />
              {t("webhookTitle")}
            </h2>
            <p className="m-0 mt-2 text-[13px] leading-[1.6] text-slate-600 dark:text-slate-300">{t("webhookBody")}</p>
            <code className="mt-2 block break-all rounded-[10px] bg-slate-900/[.05] px-2.5 py-1.5 text-[12px] dark:bg-white/[.06]">{data.expectedWebhookUrl}</code>
            {data.webhook && <p className="m-0 mt-2 text-[12px] text-slate-500">{t("webhookPending", { count: data.webhook.pending })}</p>}
            <button
              type="button"
              disabled={pending || !configured}
              className={`${PRIMARY} mt-3`}
              data-tg-register
              onClick={() =>
                run(async () => {
                  const r = await registerTelegramWebhook();
                  if (r.ok) {
                    toast.success(t("webhookRegistered"));
                    router.refresh();
                  } else fail(r.code, r.detail);
                })
              }
            >
              <Webhook size={14} strokeWidth={2.2} />
              {t("webhookRegister")}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
