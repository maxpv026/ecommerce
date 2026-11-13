import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import prisma from "@/lib/prisma";
import { effectiveRole } from "@/lib/rbac";

/**
 * Pairing an admin account with a Telegram chat.
 *
 * /admin/telegram issues a one-time deep-link token (t.me/<bot>?start=<token>,
 * 32 url-safe chars, ~192 bits) and a 6-digit code for typing ("/link 123456").
 * Only SHA-256 hashes are stored, both expire after 10 minutes, and either one
 * is spent on first use. The low-entropy code is limited to 5 wrong attempts
 * per chat per hour (TelegramChatState.failedLinkAttempts), so it can't be
 * guessed in the window it is valid.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export async function issueLink(userId: string): Promise<{ token: string; code: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.user.update({ where: { id: userId }, data: { telegramLinkTokenHash: hash(token), telegramLinkCodeHash: hash(code), telegramLinkExpiresAt: expiresAt } });
  return { token, code, expiresAt };
}

export type LinkOutcome = { ok: true; name: string } | { ok: false; code: "INVALID" | "EXPIRED" | "NOT_ADMIN" | "TOO_MANY" | "LOCKED" };

async function bind(userId: string, chatId: string, username: string | null): Promise<LinkOutcome> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true, name: true, lockedAt: true, telegramLinkExpiresAt: true } });
  if (!user) return { ok: false, code: "INVALID" };
  if (!user.telegramLinkExpiresAt || user.telegramLinkExpiresAt < new Date()) return { ok: false, code: "EXPIRED" };
  if (user.lockedAt) return { ok: false, code: "LOCKED" };
  const role = effectiveRole(user.email, user.role);
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") return { ok: false, code: "NOT_ADMIN" };
  await prisma.$transaction([
    // A chat belongs to one account: whoever had it before is unlinked.
    prisma.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: userId } }, data: { telegramChatId: null, telegramUsername: null } }),
    prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chatId, telegramUsername: username, telegramLinkTokenHash: null, telegramLinkCodeHash: null, telegramLinkExpiresAt: null },
    }),
    prisma.telegramChatState.upsert({ where: { chatId }, create: { chatId, failedLinkAttempts: 0 }, update: { failedLinkAttempts: 0, state: null, payload: undefined, expiresAt: null } }),
  ]);
  return { ok: true, name: user.name ?? user.email ?? "admin" };
}

export async function linkByToken(token: string, chatId: string, username: string | null): Promise<LinkOutcome> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, code: "INVALID" };
  const user = await prisma.user.findUnique({ where: { telegramLinkTokenHash: hash(token) }, select: { id: true } });
  if (!user) return { ok: false, code: "INVALID" };
  return bind(user.id, chatId, username);
}

export async function linkByCode(code: string, chatId: string, username: string | null): Promise<LinkOutcome> {
  const state = await prisma.telegramChatState.findUnique({ where: { chatId }, select: { failedLinkAttempts: true, updatedAt: true } });
  const recent = state && Date.now() - state.updatedAt.getTime() < 60 * 60 * 1000;
  if (recent && state.failedLinkAttempts >= MAX_CODE_ATTEMPTS) return { ok: false, code: "TOO_MANY" };
  const clean = code.replace(/\s+/g, "");
  const user = /^\d{6}$/.test(clean)
    ? await prisma.user.findFirst({ where: { telegramLinkCodeHash: hash(clean), telegramLinkExpiresAt: { gt: new Date() } }, select: { id: true } })
    : null;
  if (!user) {
    await prisma.telegramChatState.upsert({
      where: { chatId },
      create: { chatId, failedLinkAttempts: 1 },
      update: { failedLinkAttempts: recent ? { increment: 1 } : 1 },
    });
    return { ok: false, code: "INVALID" };
  }
  return bind(user.id, chatId, username);
}

export async function unlink(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: null, telegramUsername: null, telegramLinkTokenHash: null, telegramLinkCodeHash: null, telegramLinkExpiresAt: null } });
}

export const NOTIFY_EVENTS = ["order", "payment", "fgas", "returns", "support"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
