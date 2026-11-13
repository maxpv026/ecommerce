import "server-only";

import prisma from "@/lib/prisma";
import { requirePermission, type GuardResult } from "@/lib/admin/permissionCore";
import { effectiveRole, isFounderEmail, type AppRole, type Permission } from "@/lib/rbac";

/**
 * Who a Telegram chat acts as.
 *
 *   1. A linked admin: the User whose telegramChatId is the sender's id, if
 *      their role (re-read now) is still SUPER_ADMIN or ADMIN and the account
 *      isn't locked. Pairing goes through /admin/telegram (lib/telegram/linking).
 *   2. An allowlisted chat: TELEGRAM_ADMIN_CHAT_IDS (comma-separated) or the
 *      legacy TELEGRAM_ADMIN_CHAT_ID. Configuration only the deployment owner
 *      can change, so it acts as the owner account (ADMIN_EMAIL) — and every
 *      action still passes requirePermission on that account, 2FA included.
 *
 * Anyone else gets a locked message and no data (lib/telegram/bot).
 * Identity comes from the update Telegram signed for us (the webhook secret
 * proves it is Telegram) — never from text the user typed.
 */

export interface BotActor {
  userId: string;
  role: AppRole;
  chatId: string;
  via: "linked" | "allowlist";
  name: string;
}

export function allowlistedChats(): Set<string> {
  const raw = [process.env.TELEGRAM_ADMIN_CHAT_IDS, process.env.TELEGRAM_ADMIN_CHAT_ID].filter(Boolean).join(",");
  return new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^-?\d{3,20}$/.test(s)));
}

const BOT_ROLES: readonly AppRole[] = ["SUPER_ADMIN", "ADMIN"];

export async function actorFor(fromId: string | number | undefined, chatId: string | number): Promise<BotActor | null> {
  const sender = fromId === undefined ? null : String(fromId);
  if (sender) {
    const user = await prisma.user.findUnique({ where: { telegramChatId: sender }, select: { id: true, email: true, role: true, name: true, lockedAt: true } });
    if (user && !user.lockedAt) {
      const role = effectiveRole(user.email, user.role);
      if (BOT_ROLES.includes(role)) return { userId: user.id, role, chatId: String(chatId), via: "linked", name: user.name ?? user.email ?? "admin" };
    }
  }
  if (allowlistedChats().has(String(chatId))) {
    const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!ownerEmail) return null;
    const owner = await prisma.user.findFirst({ where: { email: { equals: ownerEmail, mode: "insensitive" } }, select: { id: true, email: true, name: true, lockedAt: true } });
    if (owner && !owner.lockedAt && isFounderEmail(owner.email)) return { userId: owner.id, role: "SUPER_ADMIN", chatId: String(chatId), via: "allowlist", name: owner.name ?? owner.email ?? "owner" };
  }
  return null;
}

/** The same check every /admin action runs (role from the row, 2FA required). */
export const allowed = (actor: BotActor, permission: Permission): Promise<GuardResult> => requirePermission(actor.userId, permission);
