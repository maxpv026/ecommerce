-- Telegram admin bot (lib/telegram): admin ↔ chat pairing, per-event alert
-- toggles, conversation state, reply mapping, update dedupe; plus account
-- locking and the storefront announcement banner. Additive; safe to re-run.
--
--   npx prisma db execute --file prisma/sql/2026-11-13_telegram_admin_bot.sql
--   npx prisma generate
--
-- Reversal, if ever needed:
--   DROP TABLE IF EXISTS "TelegramChatState", "TelegramMessageRef", "TelegramUpdate", "SiteAnnouncement";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramChatId", DROP COLUMN IF EXISTS "telegramUsername",
--     DROP COLUMN IF EXISTS "telegramLinkTokenHash", DROP COLUMN IF EXISTS "telegramLinkCodeHash",
--     DROP COLUMN IF EXISTS "telegramLinkExpiresAt", DROP COLUMN IF EXISTS "telegramNotificationsEnabled",
--     DROP COLUMN IF EXISTS "telegramNotifyEvents", DROP COLUMN IF EXISTS "lockedAt", DROP COLUMN IF EXISTS "lockedReason";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramNotifyEvents" TEXT[] DEFAULT ARRAY['order', 'payment', 'fgas', 'returns', 'support']::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedReason" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key" ON "User"("telegramChatId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramLinkTokenHash_key" ON "User"("telegramLinkTokenHash");

CREATE TABLE IF NOT EXISTS "TelegramChatState" (
    "chatId" TEXT NOT NULL,
    "state" TEXT,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3),
    "failedLinkAttempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramChatState_pkey" PRIMARY KEY ("chatId")
);

CREATE TABLE IF NOT EXISTS "TelegramMessageRef" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramMessageRef_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TelegramMessageRef_refId_idx" ON "TelegramMessageRef"("refId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramMessageRef_chatId_messageId_key" ON "TelegramMessageRef"("chatId", "messageId");

CREATE TABLE IF NOT EXISTS "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

CREATE TABLE IF NOT EXISTS "SiteAnnouncement" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteAnnouncement_pkey" PRIMARY KEY ("id")
);
