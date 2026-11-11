import "server-only";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { FGasStatus } from "@/lib/generated/prisma/enums";
import { AI_ACTOR, getEffectiveFgasStatus, verdictFromChecks, type FgasCheck, type FgasExtraction, type FgasVerdict } from "@/lib/fgas";
import { matchHolder, normalizeIdentifier, sameCompany } from "@/lib/fgasMatch";
import { emailTranslator } from "@/lib/emailTranslator";

/**
 * The F-Gas state machine. Every change to a buyer's status goes through
 * here or lib/fgasReview (admin actions), and every change writes an
 * FgasAuditLog row in the same transaction — history is never overwritten.
 *
 *   upload ─▶ tier 1 (lib/fgasVision: what the document is)
 *          ─▶ tier 2 (crossCheck: holder ↔ account, duplicate numbers)
 *          ─▶ tier 3 (verdictFromChecks: any fail → REJECTED,
 *                     any review → PENDING_REVIEW, else VERIFIED)
 *          ─▶ applySubmission
 *
 * Safe re-upload: a buyer whose certificate is in force (effective VERIFIED)
 * keeps it when a replacement is refused or sent for review. Only an
 * accepted replacement, an admin revocation or expiry ends it.
 */

// ── Tier 2: cross-checks ─────────────────────────────────────────────────

export async function crossCheck(userId: string, extraction: FgasExtraction): Promise<FgasCheck[]> {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, companyName: true, vatNumber: true } });
  const identity = { name: account?.name ?? null, companyName: account?.companyName ?? null, vatNumber: account?.vatNumber ?? null };

  const holder = matchHolder(extraction, identity);
  const checks: FgasCheck[] = [{ id: "holder", outcome: holder.outcome, code: holder.code, detail: holder.detail }];

  const key = normalizeIdentifier(extraction.certificateId);
  if (key.length >= 4) {
    const others = await prisma.certificate.findMany({
      where: { numberKey: key, isActive: true, userId: { not: userId } },
      select: { companyName: true, user: { select: { name: true, companyName: true, vatNumber: true } } },
      take: 10,
    });
    const foreign = others.filter((o) => !sameCompany({ ...o.user, certificateCompany: o.companyName }, identity));
    checks.push(
      foreign.length > 0
        ? { id: "duplicate", outcome: "review", code: "OTHER_ACCOUNT" }
        : others.length > 0
          ? { id: "duplicate", outcome: "pass", code: "SAME_COMPANY" }
          : { id: "duplicate", outcome: "pass", code: "UNIQUE" }
    );
  }
  return checks;
}

// ── Wording ──────────────────────────────────────────────────────────────

/** The check that decides the verdict: the first failure, else the first item for review. */
export const primaryCheck = (checks: FgasCheck[]) => checks.find((c) => c.outcome === "fail") ?? checks.find((c) => c.outcome === "review") ?? null;

/** A check in words, in a locale (English for the audit log and admin views). */
export async function describeCheck(check: FgasCheck, locale = "en"): Promise<string> {
  const { t } = await emailTranslator(locale, "FgasChecks");
  return t(`${check.id}_${check.code}`, { detail: check.detail ?? "" });
}

// ── Certificates ─────────────────────────────────────────────────────────

const AT = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T23:59:59.999Z`) : null);

type Tx = Prisma.TransactionClient;

/** Makes this certificate the buyer's one active certificate. */
export async function activateCertificate(tx: Tx, userId: string, x: FgasExtraction, documentUrl: string | null, approvedBy: string) {
  await tx.certificate.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
  const number = x.certificateId ?? "—";
  return tx.certificate.create({
    data: {
      userId,
      certType: x.category?.toLowerCase().startsWith("category") ? `F-Gas ${x.category}` : "F-Gas certificate",
      certId: number,
      certificateNumber: x.certificateId,
      numberKey: x.certificateId ? normalizeIdentifier(x.certificateId) : null,
      issuedAt: new Date(),
      companyName: x.companyName,
      holderName: x.personName ?? null,
      countryCode: x.countryCode ?? null,
      issuingBody: x.issuingBody,
      category: x.category,
      regulationCited: x.regulationCited ?? null,
      documentIssuedAt: AT(x.issuedOn ?? null),
      expiresAt: AT(x.expiresAt),
      documentUrl,
      isActive: true,
      approvedBy,
    },
  });
}

// ── Applying an upload's verdict ─────────────────────────────────────────

export interface SubmissionOutcome {
  verdict: FgasVerdict;
  accountStatus: FGasStatus;
  keptActive: boolean;
  reason: string | null;
  primary: FgasCheck | null;
  auditId: string;
}

export async function applySubmission(input: {
  userId: string;
  extraction: FgasExtraction | null;
  checks: FgasCheck[];
  documentUrl: string;
  submittedAt: Date;
  /** The model's own sentence, used when its doubt is the deciding check. */
  modelReason?: string | null;
}): Promise<SubmissionOutcome> {
  const verdict = verdictFromChecks(input.checks);
  const primary = primaryCheck(input.checks);
  const reason = primary ? (primary.code === "MODEL_DOUBT" && input.modelReason ? input.modelReason : await describeCheck(primary)) : null;

  const outcome = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { fGasStatus: true, fGasExpiresAt: true } });
    const previous = user.fGasStatus;
    const effective = getEffectiveFgasStatus(user);
    const keptActive = effective === "VERIFIED" && verdict !== "VERIFIED";
    const accountStatus: FGasStatus = verdict === "VERIFIED" ? "VERIFIED" : keptActive ? "VERIFIED" : verdict;
    const action =
      verdict === "VERIFIED"
        ? "SUBMITTED_VERIFIED"
        : keptActive
          ? verdict === "REJECTED"
            ? "REPLACEMENT_REJECTED"
            : "REPLACEMENT_PENDING"
          : verdict === "PENDING_REVIEW"
            ? "SUBMITTED_PENDING"
            : "SUBMITTED_REJECTED";

    const log = await tx.fgasAuditLog.create({
      data: {
        userId: input.userId,
        action,
        actorId: AI_ACTOR,
        previousStatus: previous,
        newStatus: accountStatus,
        certificateId: input.extraction?.certificateId ?? null,
        extractedData: input.extraction ? (input.extraction as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        checks: input.checks as unknown as Prisma.InputJsonValue,
        reason,
        documentUrl: input.documentUrl,
      },
    });

    const now = new Date();
    if (verdict === "VERIFIED" && input.extraction) {
      await activateCertificate(tx, input.userId, input.extraction, input.documentUrl, AI_ACTOR);
      await tx.user.update({
        where: { id: input.userId },
        data: {
          fGasStatus: "VERIFIED",
          epaVerified: true,
          fGasDocumentUrl: input.documentUrl,
          fGasExtractedData: input.extraction as unknown as Prisma.InputJsonValue,
          fGasSubmittedAt: input.submittedAt,
          fGasReviewedAt: now,
          fGasReviewedBy: AI_ACTOR,
          fGasRejectionReason: null,
          fGasExpiresAt: AT(input.extraction.expiresAt),
          fGasPendingSubmissionId: null,
        },
      });
    } else if (keptActive) {
      // The certificate in force is untouched. A replacement for review is
      // parked for an admin; a refused one only lives in the audit log.
      if (verdict === "PENDING_REVIEW") await tx.user.update({ where: { id: input.userId }, data: { fGasPendingSubmissionId: log.id } });
    } else {
      await tx.certificate.updateMany({ where: { userId: input.userId, isActive: true }, data: { isActive: false } });
      await tx.user.update({
        where: { id: input.userId },
        data: {
          fGasStatus: verdict,
          epaVerified: false,
          fGasDocumentUrl: input.documentUrl,
          fGasExtractedData: input.extraction ? (input.extraction as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          fGasSubmittedAt: input.submittedAt,
          fGasReviewedAt: now,
          fGasReviewedBy: AI_ACTOR,
          fGasRejectionReason: reason,
          fGasExpiresAt: null,
          fGasPendingSubmissionId: null,
        },
      });
    }
    return { verdict, accountStatus, keptActive, reason, primary, auditId: log.id };
  });

  revalidateFgasViews();
  return outcome;
}

/**
 * Refreshes the server-rendered pages that show F-Gas status. A cache hint,
 * never part of the decision: outside a request (a script, a test) there is
 * no cache to refresh and Next throws, which must not undo a committed change.
 */
export function revalidateFgasViews() {
  for (const path of ["/[locale]/profile", "/[locale]/cart", "/[locale]/checkout", "/[locale]/admin/users"]) {
    try {
      revalidatePath(path, "page");
    } catch {
      return;
    }
  }
}

// ── Expiry ───────────────────────────────────────────────────────────────

/**
 * Writes EXPIRED onto every VERIFIED account whose certificate has lapsed.
 * The gates already treat them as expired at read time; this makes it
 * durable, logs it and returns who to email. Conditional per row, so two
 * overlapping runs can't expire (or email) anyone twice.
 */
export async function expireDueCertificates(now: Date = new Date(), limit = 200): Promise<Array<{ userId: string; expiresAt: Date; certificateNumber: string | null }>> {
  const due = await prisma.user.findMany({
    where: { fGasStatus: "VERIFIED", fGasExpiresAt: { lt: now } },
    select: { id: true, fGasExpiresAt: true, certificates: { where: { isActive: true }, select: { certificateNumber: true }, take: 1 } },
    take: limit,
  });
  const expired: Array<{ userId: string; expiresAt: Date; certificateNumber: string | null }> = [];
  for (const u of due) {
    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: u.id, fGasStatus: "VERIFIED", fGasExpiresAt: u.fGasExpiresAt },
        data: { fGasStatus: "EXPIRED", epaVerified: false },
      });
      if (count === 0) return false;
      await tx.certificate.updateMany({ where: { userId: u.id, isActive: true }, data: { isActive: false } });
      await tx.fgasAuditLog.create({
        data: {
          userId: u.id,
          action: "AUTO_EXPIRED",
          actorId: "system",
          previousStatus: "VERIFIED",
          newStatus: "EXPIRED",
          certificateId: u.certificates[0]?.certificateNumber ?? null,
          reason: `Certificate expired on ${u.fGasExpiresAt!.toISOString().slice(0, 10)}.`,
        },
      });
      return true;
    });
    if (done) expired.push({ userId: u.id, expiresAt: u.fGasExpiresAt!, certificateNumber: u.certificates[0]?.certificateNumber ?? null });
  }
  if (expired.length) revalidateFgasViews();
  return expired;
}
