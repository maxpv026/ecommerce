import "server-only";

import { after } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { FGasStatus } from "@/lib/generated/prisma/enums";
import { isFounderEmail } from "@/lib/rbac";
import { certificateHref } from "@/lib/fgasStorage";
import { getEffectiveFgasStatus, isAiActor, type FgasExtraction } from "@/lib/fgas";
import { activateCertificate, revalidateFgasViews } from "@/lib/fgasLifecycle";
import { sendFgasStatusEmail, telegramOverride } from "@/lib/fgasNotify";

/**
 * Admin decisions on F-Gas certificates: approve, reject, revoke.
 *
 * Every entry point re-checks the caller against the database row AND the
 * ADMIN_EMAIL rule (never a session claim alone), claims the transition with
 * a conditional update (two admins, or a double click, move a row once),
 * writes an FgasAuditLog row in the same transaction, then — after the
 * response — emails the buyer and posts the override to the admin chat.
 */

export type ReviewErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "TWO_FACTOR_REQUIRED"
  | "USER_NOT_FOUND"
  | "NOT_PENDING"
  /** Approving needs a document on file to approve. */
  | "NO_DOCUMENT"
  /** The document's own expiry date has passed: approving it would grant nothing. */
  | "DOCUMENT_EXPIRED"
  | "FAILED";

export type ReviewResult<T = { status: FGasStatus }> = { ok: true; value: T } | { ok: false; code: ReviewErrorCode };

export async function requireAdmin(userId: string | null | undefined): Promise<ReviewResult<{ id: string; email: string | null }>> {
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const caller = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, isTwoFactorEnabled: true } });
  if (!caller) return { ok: false, code: "UNAUTHENTICATED" };
  if (caller.role !== "ADMIN" || !isFounderEmail(caller.email)) {
    console.warn(`[fgas] refused review action for non-admin ${caller.id}`);
    return { ok: false, code: "FORBIDDEN" };
  }
  if (!caller.isTwoFactorEnabled) {
    console.warn(`[admin] refused: ${caller.email ?? caller.id} has no authenticator enrolled`);
    return { ok: false, code: "TWO_FACTOR_REQUIRED" };
  }
  return { ok: true, value: { id: caller.id, email: caller.email } };
}

/** The same rule as requireAdmin minus 2FA — for READING a document only. */
export async function isAdminViewer(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const viewer = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  return viewer?.role === "ADMIN" && isFounderEmail(viewer.email);
}

export interface PendingReview {
  userId: string;
  name: string | null;
  email: string | null;
  companyName: string | null;
  status: FGasStatus;
  submittedAt: string | null;
  documentUrl: string | null;
  extracted: FgasExtraction | null;
  rejectionReason: string | null;
  decidedByAi: boolean;
  /** A VERIFIED buyer's replacement waiting for a decision. */
  replacementPending: boolean;
}

/** What an admin should look at: anything in review, refused, or a parked replacement. */
export async function listPendingReviews(): Promise<PendingReview[]> {
  const rows = await prisma.user.findMany({
    where: { OR: [{ fGasStatus: { in: ["PENDING_REVIEW", "REJECTED"] } }, { fGasPendingSubmissionId: { not: null } }] },
    orderBy: { fGasSubmittedAt: "desc" },
    select: {
      id: true, name: true, email: true, companyName: true, fGasStatus: true, fGasSubmittedAt: true, fGasDocumentUrl: true,
      fGasExtractedData: true, fGasRejectionReason: true, fGasReviewedBy: true, fGasPendingSubmissionId: true,
    },
  });
  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    companyName: row.companyName,
    status: row.fGasStatus,
    submittedAt: row.fGasSubmittedAt?.toISOString() ?? null,
    documentUrl: row.fGasDocumentUrl ? certificateHref(row.id) : null,
    extracted: (row.fGasExtractedData as FgasExtraction | null) ?? null,
    rejectionReason: row.fGasRejectionReason,
    decidedByAi: isAiActor(row.fGasReviewedBy),
    replacementPending: Boolean(row.fGasPendingSubmissionId),
  }));
}

const AT = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T23:59:59.999Z`) : null);

function notifyAfter(fn: () => Promise<unknown>) {
  try {
    after(fn);
  } catch {
    // Outside a request scope (scripts): run it now.
    void fn();
  }
}

/**
 * Accepts the certificate awaiting a decision: a VERIFIED buyer's parked
 * replacement if there is one, else the submission on the account
 * (PENDING_REVIEW or REJECTED — the latter so a person can overturn the AI).
 */
export async function approveFGasCertificate(adminUserId: string | null | undefined, targetUserId: string): Promise<ReviewResult> {
  const admin = await requireAdmin(adminUserId);
  if (!admin.ok) return admin;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, fGasStatus: true, fGasPendingSubmissionId: true, fGasExtractedData: true, fGasDocumentUrl: true, fGasExpiresAt: true },
  });
  if (!user) return { ok: false, code: "USER_NOT_FOUND" };

  let extraction: FgasExtraction | null;
  let documentUrl: string | null;
  if (user.fGasPendingSubmissionId) {
    const log = await prisma.fgasAuditLog.findUnique({ where: { id: user.fGasPendingSubmissionId } });
    extraction = (log?.extractedData as FgasExtraction | null) ?? null;
    documentUrl = log?.documentUrl ?? null;
  } else if (user.fGasStatus === "PENDING_REVIEW" || user.fGasStatus === "REJECTED") {
    extraction = (user.fGasExtractedData as FgasExtraction | null) ?? null;
    documentUrl = user.fGasDocumentUrl;
  } else {
    return { ok: false, code: "NOT_PENDING" };
  }
  if (!documentUrl) return { ok: false, code: "NO_DOCUMENT" };
  const expiresAt = AT(extraction?.expiresAt);
  if (expiresAt && expiresAt.getTime() < Date.now()) return { ok: false, code: "DOCUMENT_EXPIRED" };

  const x: FgasExtraction = extraction ?? { companyName: null, certificateId: null, category: "Certificate", expiresAt: null, issuingBody: null };
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: user.id, fGasStatus: user.fGasStatus, fGasPendingSubmissionId: user.fGasPendingSubmissionId },
        data: {
          fGasStatus: "VERIFIED",
          epaVerified: true,
          fGasDocumentUrl: documentUrl,
          fGasExtractedData: x as unknown as Prisma.InputJsonValue,
          fGasReviewedAt: new Date(),
          fGasReviewedBy: admin.value.id,
          fGasRejectionReason: null,
          fGasExpiresAt: expiresAt,
          fGasPendingSubmissionId: null,
        },
      });
      if (count === 0) throw new ClaimLost();
      await activateCertificate(tx, user.id, x, documentUrl, admin.value.id);
      await tx.fgasAuditLog.create({
        data: {
          userId: user.id,
          action: "ADMIN_APPROVED",
          actorId: admin.value.id,
          previousStatus: user.fGasStatus,
          newStatus: "VERIFIED",
          certificateId: x.certificateId,
          extractedData: x as unknown as Prisma.InputJsonValue,
          reason: user.fGasPendingSubmissionId ? "Replacement certificate approved." : "Certificate approved.",
          documentUrl,
        },
      });
    });
  } catch (error) {
    if (error instanceof ClaimLost) return { ok: false, code: "NOT_PENDING" };
    console.error("approveFGasCertificate failed:", error);
    return { ok: false, code: "FAILED" };
  }

  revalidateFgasViews();
  notifyAfter(() =>
    Promise.all([
      sendFgasStatusEmail({ userId: user.id, kind: "VERIFIED", certificate: { number: x.certificateId, holder: x.companyName ?? x.personName ?? null, expiresAt: x.expiresAt, issuingBody: x.issuingBody } }),
      telegramOverride({ action: "APPROVED", adminEmail: admin.value.email, user }),
    ])
  );
  return { ok: true, value: { status: "VERIFIED" } };
}

class ClaimLost extends Error {}

/**
 * Refuses, with a reason the buyer is shown.
 *
 *   mode "auto"         a parked replacement → reject the replacement (the
 *                       certificate in force stays); PENDING_REVIEW →
 *                       REJECTED; VERIFIED / EXPIRED → revoke.
 *   mode "revoke"       end the certificate in force, whatever is parked.
 *   mode "replacement"  only the parked replacement.
 */
export async function rejectFGasCertificate(
  adminUserId: string | null | undefined,
  targetUserId: string,
  reason: string,
  mode: "auto" | "revoke" | "replacement" = "auto"
): Promise<ReviewResult> {
  const admin = await requireAdmin(adminUserId);
  if (!admin.ok) return admin;
  const trimmed = (typeof reason === "string" ? reason.trim().slice(0, 500) : "") || "The certificate could not be accepted.";

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, fGasStatus: true, fGasPendingSubmissionId: true, fGasExpiresAt: true, fGasExtractedData: true },
  });
  if (!user) return { ok: false, code: "USER_NOT_FOUND" };

  const effective = getEffectiveFgasStatus(user);
  const kind: "REPLACEMENT" | "REJECT" | "REVOKE" | null =
    mode === "replacement"
      ? user.fGasPendingSubmissionId ? "REPLACEMENT" : null
      : mode === "revoke"
        ? ["VERIFIED", "EXPIRED", "PENDING_REVIEW"].includes(user.fGasStatus) ? "REVOKE" : null
        : user.fGasPendingSubmissionId && effective === "VERIFIED"
          ? "REPLACEMENT"
          : user.fGasStatus === "PENDING_REVIEW"
            ? "REJECT"
            : user.fGasStatus === "VERIFIED" || user.fGasStatus === "EXPIRED"
              ? "REVOKE"
              : null;
  if (!kind) return { ok: false, code: "NOT_PENDING" };

  const extraction = (user.fGasExtractedData as FgasExtraction | null) ?? null;
  try {
    await prisma.$transaction(async (tx) => {
      const where = { id: user.id, fGasStatus: user.fGasStatus, fGasPendingSubmissionId: user.fGasPendingSubmissionId };
      const data =
        kind === "REPLACEMENT"
          ? { fGasPendingSubmissionId: null }
          : {
              fGasStatus: "REJECTED" as const,
              epaVerified: false,
              fGasReviewedAt: new Date(),
              fGasReviewedBy: admin.value.id,
              fGasRejectionReason: trimmed,
              fGasExpiresAt: null,
              fGasPendingSubmissionId: null,
            };
      const { count } = await tx.user.updateMany({ where, data });
      if (count === 0) throw new ClaimLost();
      if (kind !== "REPLACEMENT") await tx.certificate.updateMany({ where: { userId: user.id, isActive: true }, data: { isActive: false } });
      await tx.fgasAuditLog.create({
        data: {
          userId: user.id,
          action: kind === "REPLACEMENT" ? "ADMIN_REJECTED" : kind === "REVOKE" ? "ADMIN_REVOKED" : "ADMIN_REJECTED",
          actorId: admin.value.id,
          previousStatus: user.fGasStatus,
          newStatus: kind === "REPLACEMENT" ? user.fGasStatus : "REJECTED",
          certificateId: extraction?.certificateId ?? null,
          reason: trimmed,
        },
      });
    });
  } catch (error) {
    if (error instanceof ClaimLost) return { ok: false, code: "NOT_PENDING" };
    console.error("rejectFGasCertificate failed:", error);
    return { ok: false, code: "FAILED" };
  }

  revalidateFgasViews();
  const emailKind = kind === "REPLACEMENT" ? "REPLACEMENT_REJECTED" : kind === "REVOKE" ? "REVOKED" : "REJECTED";
  notifyAfter(() =>
    Promise.all([
      sendFgasStatusEmail({ userId: user.id, kind: emailKind, reason: trimmed }),
      telegramOverride({ action: kind === "REVOKE" ? "REVOKED" : kind === "REPLACEMENT" ? "REJECTED REPLACEMENT" : "REJECTED", adminEmail: admin.value.email, user, reason: trimmed }),
    ])
  );
  return { ok: true, value: { status: kind === "REPLACEMENT" ? user.fGasStatus : "REJECTED" } };
}
