import "server-only";

import prisma from "@/lib/prisma";
import { daysUntil, getEffectiveFgasStatus, type FgasCheck, type FgasExtraction, type FgasSummary } from "@/lib/fgas";
import { certificateHref } from "@/lib/fgasStorage";

/**
 * A buyer's F-Gas standing for the cart, checkout and profile — read from
 * the row, with expiry applied (getEffectiveFgasStatus). Null for no user;
 * a failed read degrades to null (the UI then shows the upload prompt) —
 * nothing is GRANTED by a read failing: prepareOrder re-reads on every order.
 */
export async function getFgasSummary(userId: string | null | undefined): Promise<FgasSummary | null> {
  if (!userId) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fGasStatus: true,
        fGasExpiresAt: true,
        fGasExtractedData: true,
        fGasRejectionReason: true,
        fGasDocumentUrl: true,
        fGasPendingSubmissionId: true,
        certificates: { where: { isActive: true }, take: 1 },
        fgasAuditLog: { where: { actorId: { in: ["ai-vision", "ai-auto-verification"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { checks: true, reason: true, action: true } },
      },
    });
    if (!u) return null;
    const status = getEffectiveFgasStatus(u);
    const cert = u.certificates[0] ?? null;
    const x = (u.fGasExtractedData as FgasExtraction | null) ?? null;
    const latest = u.fgasAuditLog[0] ?? null;
    const showChecks = status === "REJECTED" || status === "PENDING_REVIEW" || u.fGasPendingSubmissionId !== null || latest?.action === "REPLACEMENT_REJECTED";
    const expiresAt = u.fGasExpiresAt ?? cert?.expiresAt ?? null;
    return {
      status,
      certificateNumber: cert?.certificateNumber ?? cert?.certId ?? x?.certificateId ?? null,
      holder: cert?.companyName ?? cert?.holderName ?? x?.companyName ?? x?.personName ?? null,
      issuingBody: cert?.issuingBody ?? x?.issuingBody ?? null,
      countryCode: cert?.countryCode ?? x?.countryCode ?? null,
      category: cert?.category ?? x?.category ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      daysLeft: daysUntil(expiresAt),
      reason: status === "REJECTED" || status === "PENDING_REVIEW" ? u.fGasRejectionReason ?? latest?.reason ?? null : showChecks ? latest?.reason ?? null : null,
      checks: showChecks ? ((latest?.checks as FgasCheck[] | null) ?? null) : null,
      replacementPending: u.fGasPendingSubmissionId !== null,
      documentHref: u.fGasDocumentUrl ? certificateHref(userId) : null,
    };
  } catch (error) {
    console.error("[fgas] could not read the buyer's F-Gas summary:", error);
    return null;
  }
}
