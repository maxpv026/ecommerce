import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import prisma from "@/lib/prisma";
import { can, effectiveRole } from "@/lib/rbac";
import { siteOrigin } from "@/lib/siteUrl";
import { botToken, getMe, getWebhookInfo, webhookSecret } from "@/lib/telegram/api";
import TelegramAdminPanel, { type TelegramPanelData } from "@/components/admin/TelegramAdminPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminTelegram" });
  return { title: `${t("title")} — My Energy Admin`, robots: { index: false, follow: false } };
}

/**
 * /admin/telegram — the admin bot: whether it's configured, this admin's
 * pairing and alert preferences, a test message, and (owner) the webhook.
 * Bot calls are best-effort: an unreachable Telegram shows as "unknown",
 * never as an error page.
 */
export default async function AdminTelegramPage({ params }: { params: Promise<{ locale: string }> }) {
  await guardAdmin(params, "telegram.link");
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id! },
    select: { email: true, role: true, telegramChatId: true, telegramUsername: true, telegramNotificationsEnabled: true, telegramNotifyEvents: true },
  });
  const tokenSet = Boolean(botToken());
  const [bot, hook] = tokenSet ? await Promise.all([getMe(), getWebhookInfo()]) : [null, null];
  const role = effectiveRole(user?.email, user?.role);

  const data: TelegramPanelData = {
    tokenSet,
    secretSet: Boolean(webhookSecret()),
    botUsername: bot?.ok ? (bot.result.username ?? null) : null,
    botReachable: bot ? bot.ok : null,
    webhook: hook?.ok ? { url: hook.result.url || null, pending: hook.result.pending_update_count, lastError: hook.result.last_error_message ?? null } : null,
    expectedWebhookUrl: `${siteOrigin()}/api/telegram/webhook`,
    canManageWebhook: can(role, "diagnostics"),
    linked: Boolean(user?.telegramChatId),
    telegramUsername: user?.telegramUsername ?? null,
    enabled: user?.telegramNotificationsEnabled ?? true,
    events: user?.telegramNotifyEvents ?? [],
  };

  return <TelegramAdminPanel data={data} />;
}
