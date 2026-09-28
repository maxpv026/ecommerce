-- Anyone already carrying the legacy epaVerified flag was verified under the
-- previous fully-automated flow. Without this they would land on NONE and be
-- silently blocked from checkout by the new gate.
--
-- Idempotent: re-running only touches rows still at NONE.
UPDATE "User"
SET "fGasStatus" = 'VERIFIED',
    "fGasReviewedAt" = COALESCE("fGasReviewedAt", "updatedAt")
WHERE "epaVerified" = true
  AND "fGasStatus" = 'NONE';
