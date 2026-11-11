-- F-Gas compliance upgrade: EXPIRED status, audit log, encrypted document
-- storage in PostgreSQL, richer Certificate, order compliance snapshot.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-11-11_fgas_compliance.sql`,
-- then `npx prisma generate` and a restart of `next dev`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand and is deliberately left out. Safe to re-run.
-- Additive: a deployment built before this file keeps working (it never reads
-- the new columns, and nothing writes EXPIRED until the new code runs).

ALTER TYPE "FGasStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fGasExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fGasPendingSubmissionId" TEXT;

ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "certificateNumber" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "numberKey" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "holderName" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "issuingBody" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "regulationCited" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "documentIssuedAt" TIMESTAMP(3);
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "documentUrl" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
CREATE INDEX IF NOT EXISTS "Certificate_numberKey_isActive_idx" ON "Certificate"("numberKey", "isActive");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "authorizingCertificateId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "authorizingCertificateNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "authorizingCertificateExpiresAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "FgasAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousStatus" "FGasStatus",
    "newStatus" "FGasStatus",
    "certificateId" TEXT,
    "extractedData" JSONB,
    "checks" JSONB,
    "reason" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FgasAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FgasAuditLog_userId_createdAt_idx" ON "FgasAuditLog"("userId", "createdAt" DESC);
DO $$ BEGIN
  ALTER TABLE "FgasAuditLog" ADD CONSTRAINT "FgasAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FgasDocumentFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "keyRef" TEXT NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FgasDocumentFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FgasDocumentFile_userId_idx" ON "FgasDocumentFile"("userId");
DO $$ BEGIN
  ALTER TABLE "FgasDocumentFile" ADD CONSTRAINT "FgasDocumentFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Backfill (idempotent) ──

-- The active certificate's expiry, from what the vision model read at the time.
UPDATE "User"
SET "fGasExpiresAt" = (("fGasExtractedData"->>'expiresAt') || 'T23:59:59.999Z')::timestamptz
WHERE "fGasExpiresAt" IS NULL
  AND "fGasExtractedData"->>'expiresAt' ~ '^\d{4}-\d{2}-\d{2}$';

-- Every existing certificate row gets the new number columns.
UPDATE "Certificate"
SET "certificateNumber" = "certId",
    "numberKey" = upper(regexp_replace("certId", '[^A-Za-z0-9]', '', 'g'))
WHERE "certificateNumber" IS NULL;

-- The newest certificate of each VERIFIED buyer becomes their active one,
-- carrying what the account's last reading said about it.
UPDATE "Certificate" c
SET "isActive" = true,
    "companyName" = COALESCE(c."companyName", u."fGasExtractedData"->>'companyName'),
    "issuingBody" = COALESCE(c."issuingBody", u."fGasExtractedData"->>'issuingBody'),
    "category"    = COALESCE(c."category", u."fGasExtractedData"->>'category'),
    "expiresAt"   = COALESCE(c."expiresAt", u."fGasExpiresAt"),
    "documentUrl" = COALESCE(c."documentUrl", u."fGasDocumentUrl")
FROM "User" u
WHERE c."userId" = u."id"
  AND u."fGasStatus" = 'VERIFIED'
  AND c."id" = (SELECT c2."id" FROM "Certificate" c2 WHERE c2."userId" = u."id" ORDER BY c2."issuedAt" DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "Certificate" c3 WHERE c3."userId" = u."id" AND c3."isActive");

-- One history entry per account that was VERIFIED before the audit log
-- existed, so its history doesn't start mid-story.
INSERT INTO "FgasAuditLog" ("id", "userId", "action", "actorId", "previousStatus", "newStatus", "certificateId", "extractedData", "reason", "documentUrl", "createdAt")
SELECT 'legacy-' || u."id", u."id", 'LEGACY_MIGRATED', 'system', NULL, u."fGasStatus",
       u."fGasExtractedData"->>'certificateId', u."fGasExtractedData",
       CASE WHEN u."fGasDocumentUrl" IS NULL THEN 'Verified before the audit log existed; no document on file.'
            ELSE 'Verified before the audit log existed.' END,
       u."fGasDocumentUrl", COALESCE(u."fGasReviewedAt", u."updatedAt")
FROM "User" u
WHERE u."fGasStatus" <> 'NONE'
ON CONFLICT ("id") DO NOTHING;
