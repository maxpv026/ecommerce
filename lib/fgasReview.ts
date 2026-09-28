import "server-only";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { isFounderEmail } from "@/lib/rbac";
import { escapeMarkdown } from "@/lib/telegram";
import type { FgasExtraction } from "@/lib/fgas";
import type { FGasStatus } from "@/lib/generated/prisma/enums";

/**
 * The admin override on F-Gas verification.
 *
 * The vision model now decides on its own (app/api/verify-fgas), so this
 * module is no longer the only way a buyer becomes VERIFIED — it is the way
 * a wrong automatic decision gets corrected. Every entry point checks the
 * caller is an admin against the database row *and* the ADMIN_EMAIL rule —
 * never against a session claim alone, because a JWT is only as fresh as
 * the last sign-in.
 */

export type ReviewErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  /** Admin, but without an authenticator enrolled. */
  | "TWO_FACTOR_REQUIRED"
  | "USER_NOT_FOUND"
  | "NOT_PENDING"
  | "FAILED";

/**
 * Stamped into `fGasReviewedBy` when the model decided rather than a person.
 *
 * Deliberately not a user id and not null: null would read as "never
 * reviewed", and any real id would credit a human with a call they never
 * made. An admin looking at an account can tell at a glance which decisions
 * nobody actually saw.
 */
export const AI_REVIEWER_ID = "ai-auto-verification";

export type ReviewResult<T = { status: FGasStatus }> =
  | { ok: true; value: T }
  | { ok: false; code: ReviewErrorCode };

/**
 * Confirms the caller may approve certificates.
 *
 * Two independent conditions, both required: the row says ADMIN, and the
 * email still matches ADMIN_EMAIL. The role column is derived state
 * (lib/rbac.ts re-enforces it at sign-in), so checking both means a
 * hand-edited row cannot mint an approver.
 */
export async function requireAdmin(userId: string | null | undefined): Promise<ReviewResult<{ id: string; email: string | null }>> {
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const caller = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isTwoFactorEnabled: true },
  });

  if (!caller) return { ok: false, code: "UNAUTHENTICATED" };
  if (caller.role !== "ADMIN" || !isFounderEmail(caller.email)) {
    console.warn(`[fgas] refused review action for non-admin ${caller.id}`);
    return { ok: false, code: "FORBIDDEN" };
  }

  // Admin powers here move stock, email customers and approve regulated
  // sales. A password plus an emailed code is not enough for that, and this
  // is read from the row rather than the session claim — a JWT minted before
  // 2FA was turned off would otherwise still carry `true`.
  if (!caller.isTwoFactorEnabled) {
    console.warn(`[admin] refused: ${caller.email ?? caller.id} has no authenticator enrolled`);
    return { ok: false, code: "TWO_FACTOR_REQUIRED" };
  }

  return { ok: true, value: { id: caller.id, email: caller.email } };
}

/** Everything the reviewer needs to decide, for one buyer. */
export interface PendingReview {
  userId: string;
  name: string | null;
  email: string | null;
  companyName: string | null;
  status: FGasStatus;
  submittedAt: string | null;
  documentUrl: string | null;
  extracted: FgasExtraction | null;
  /** Why it was refused, when it was. */
  rejectionReason: string | null;
  /** true when the model decided this without a human ever seeing it. */
  decidedByAi: boolean;
}

/**
 * The accounts an admin may want to look at: anything refused, plus anything
 * still sitting in the legacy PENDING_REVIEW state.
 *
 * REJECTED belongs in this list now that the model decides alone. Nothing
 * new ever reaches PENDING_REVIEW, so a queue filtered to it would always be
 * empty — and the refusals are exactly the decisions a buyer will call up
 * about. Approvals are not listed: those go to the admin chat as they
 * happen, with the document attached.
 */
export async function listPendingReviews(): Promise<PendingReview[]> {
  const rows = await prisma.user.findMany({
    where: { fGasStatus: { in: ["PENDING_REVIEW", "REJECTED"] } },
    // Most recent first: this is a feed of fresh decisions, not a FIFO queue.
    orderBy: { fGasSubmittedAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      companyName: true,
      fGasStatus: true,
      fGasSubmittedAt: true,
      fGasDocumentUrl: true,
      fGasExtractedData: true,
      fGasRejectionReason: true,
      fGasReviewedBy: true,
    },
  });

  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    companyName: row.companyName,
    status: row.fGasStatus,
    submittedAt: row.fGasSubmittedAt?.toISOString() ?? null,
    documentUrl: row.fGasDocumentUrl,
    extracted: (row.fGasExtractedData as FgasExtraction | null) ?? null,
    rejectionReason: row.fGasRejectionReason,
    decidedByAi: row.fGasReviewedBy === AI_REVIEWER_ID,
  }));
}

/**
 * Creates the Certificate row the profile and order history display, unless
 * this buyer already has one with the same number.
 *
 * Shared with the auto-verification route so an AI approval and an admin
 * approval leave the account in the same shape.
 */
export async function ensureCertificateRow(userId: string, extracted: FgasExtraction): Promise<void> {
  if (!extracted.certificateId) return;

  const existing = await prisma.certificate.findFirst({
    where: { userId, certId: extracted.certificateId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.certificate.create({
    data: {
      userId,
      certType: extracted.category?.toLowerCase().startsWith("category")
        ? `F-Gas ${extracted.category}`
        : "F-Gas certificate",
      certId: extracted.certificateId,
      issuedAt: new Date(),
    },
  });
}

/** States an admin may approve from — anything with a document behind it. */
const APPROVABLE: FGasStatus[] = ["PENDING_REVIEW", "REJECTED"];
/** States an admin may revoke from — anything currently granting access. */
const REVOCABLE: FGasStatus[] = ["PENDING_REVIEW", "VERIFIED"];

/**
 * Grants the buyer permission to purchase refrigerant.
 *
 * Accepts REJECTED as well as PENDING_REVIEW, because the model refuses
 * alone now: a genuine certificate that cites only a national decree, or
 * whose scan the model could not read, lands on REJECTED with nobody having
 * looked at it. Without this path that buyer would be stuck re-uploading the
 * same document forever. NONE is still refused — approving an account that
 * never submitted anything would leave a VERIFIED status with no document
 * behind it.
 */
export async function approveFGasCertificate(
  adminUserId: string | null | undefined,
  targetUserId: string
): Promise<ReviewResult> {
  const admin = await requireAdmin(adminUserId);
  if (!admin.ok) return admin;

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, fGasStatus: true, fGasExtractedData: true },
  });
  if (!target) return { ok: false, code: "USER_NOT_FOUND" };
  if (!APPROVABLE.includes(target.fGasStatus)) return { ok: false, code: "NOT_PENDING" };

  const extracted = (target.fGasExtractedData as FgasExtraction | null) ?? null;

  try {
    // The conditional update is the claim: two admins approving at once, or
    // a double-submitted form, can only move the row once.
    const { count } = await prisma.user.updateMany({
      where: { id: targetUserId, fGasStatus: { in: APPROVABLE } },
      data: {
        fGasStatus: "VERIFIED",
        // Legacy mirror, kept in lockstep for any reader not yet migrated.
        epaVerified: true,
        fGasReviewedAt: new Date(),
        fGasReviewedBy: admin.value.id,
        fGasRejectionReason: null,
      },
    });
    if (count === 0) return { ok: false, code: "NOT_PENDING" };

    if (extracted) await ensureCertificateRow(targetUserId, extracted);

    revalidatePath("/[locale]/profile", "page");
    revalidatePath("/[locale]/cart", "page");
    return { ok: true, value: { status: "VERIFIED" } };
  } catch (error) {
    console.error("approveFGasCertificate failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/**
 * Refuses the certificate, with a reason the buyer is shown.
 *
 * Accepts VERIFIED as well as PENDING_REVIEW: this is the only way to pull
 * back an account the model auto-approved on a forgery, and the admin chat
 * copy of every approval exists precisely so that call can be made.
 */
export async function rejectFGasCertificate(
  adminUserId: string | null | undefined,
  targetUserId: string,
  reason: string
): Promise<ReviewResult> {
  const admin = await requireAdmin(adminUserId);
  if (!admin.ok) return admin;

  // Coerced rather than assumed: this ran before the try block below, so a
  // non-string `reason` threw a TypeError that no caller caught — a 500 for
  // what should be a validation refusal. The action layer now parses too;
  // this is the belt to that braces.
  const trimmed =
    (typeof reason === "string" ? reason.trim().slice(0, 500) : "") || "The certificate could not be accepted.";

  try {
    const { count } = await prisma.user.updateMany({
      where: { id: targetUserId, fGasStatus: { in: REVOCABLE } },
      data: {
        fGasStatus: "REJECTED",
        // Rejection must also clear the legacy flag: this is the field an
        // un-migrated reader would gate on.
        epaVerified: false,
        fGasReviewedAt: new Date(),
        fGasReviewedBy: admin.value.id,
        fGasRejectionReason: trimmed,
      },
    });
    if (count === 0) {
      const exists = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
      return { ok: false, code: exists ? "NOT_PENDING" : "USER_NOT_FOUND" };
    }

    revalidatePath("/[locale]/profile", "page");
    revalidatePath("/[locale]/cart", "page");
    return { ok: true, value: { status: "REJECTED" } };
  } catch (error) {
    console.error("rejectFGasCertificate failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

/**
 * The caption that goes with every certificate sent to the admin chat.
 *
 * Sent on approvals as well as refusals. An approval is the one nobody else
 * will ever review, so this line in the chat is the only record a human sees
 * of a sale being unlocked — it carries the user id so the decision can be
 * overturned from a phone with one POST to /api/admin/fgas.
 *
 * Single asterisks: Telegram's classic Markdown parser, which
 * sendTelegramDocument asks for, marks bold with `*text*`.
 */
export function buildAuditCaption(input: {
  approved: boolean;
  name: string | null;
  email: string | null;
  userId: string;
  companyName: string | null;
  certificateNumber: string | null;
  expiryDate: string | null;
  reason: string | null;
}): string {
  const field = (value: string | null) => escapeMarkdown(value?.trim() || "—");
  const who = [input.name, input.email].filter((part): part is string => Boolean(part?.trim()));

  return [
    input.approved ? "🟢 *STATUS: AI APPROVED*" : "🔴 *STATUS: AI REJECTED*",
    "",
    `👤 *User:* ${field(who.join(" · ") || input.userId)}`,
    `🏢 *Company:* ${field(input.companyName)}`,
    `🔢 *Cert Number:* ${field(input.certificateNumber)}`,
    `📅 *Expiry:* ${field(input.expiryDate)}`,
    `⚠️ *AI Notes/Reason:* ${field(input.reason ?? (input.approved ? "Looks authentic" : null))}`,
    "",
    input.approved
      ? "_Checkout is now unlocked for this buyer. Reject to revoke._"
      : "_Checkout stays locked. Approve to override._",
    `_User id:_ ${escapeMarkdown(input.userId)}`,
  ].join("\n");
}
