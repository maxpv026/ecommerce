-- Per-user colour scheme (Light / Dark / System), synced across devices.
--
-- Generated from the live schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--
-- One enum and one column with a default. Nothing is dropped or rewritten:
-- every existing user gets SYSTEM, which is what the site already did for
-- anyone without a stored choice.
--
-- Apply with:
--   npx prisma db execute --file prisma/sql/2026-10-14_add_theme_preference.sql
--
-- NOT with `npx prisma db push`. The diff above also contains
--   DROP INDEX "KnowledgeChunk_embedding_hnsw_idx";
-- because that pgvector index is created by hand (2026-09-16_pgvector.sql)
-- and is not in schema.prisma — db push would silently delete it and the
-- assistant's similarity search would fall back to a sequential scan.
--
-- Safe to re-run.

DO $$
BEGIN
  CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "themePreference" "ThemePreference" NOT NULL DEFAULT 'SYSTEM';
