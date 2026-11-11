import "server-only";

import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { FGasStatus } from "@/lib/generated/prisma/enums";
import { getEffectiveFgasStatus, isAiActor, type FgasCheck, type FgasExtraction } from "@/lib/fgas";
import { certificateHref, documentHref, isLocalOnlyDocument } from "@/lib/fgasStorage";

/**
 * The admin user directory — read side only. Decisions go through
 * lib/fgasReview (approve/reject), which owns the state machine; nothing
 * here writes.
 *
 * Callers must have checked admin rights first: this returns names, emails,
 * VAT numbers and certificate details for every account.
 */

export const ADMIN_USERS_PAGE_SIZE = 25;

/** The filter chips. "review" = what an admin should look at: in review, refused, or a parked replacement. */
export const ADMIN_USER_FILTERS = ["all", "review", "VERIFIED", "EXPIRED", "REJECTED", "NONE"] as const;
export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number];

export interface AdminAuditEntry {
  id: string;
  action: string;
  /** "AI", "System", or the admin's email. */
  actor: string;
  previousStatus: FGasStatus | null;
  newStatus: FGasStatus | null;
  certificateId: string | null;
  reason: string | null;
  checks: FgasCheck[] | null;
  /** Authenticated link to that submission's document, when one exists. */
  documentHref: string | null;
  createdAt: string;
}

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string | null;
  companyName: string | null;
  vatNumber: string | null;
  role: "USER" | "ADMIN";
  status: FGasStatus;
  /** What every gate sees: VERIFIED past its expiry is EXPIRED here. */
  effectiveStatus: FGasStatus;
  expiresAt: string | null;
  /** The current document: always the authenticated route, never the storage URL. */
  documentHref: string | null;
  extracted: FgasExtraction | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedByAi: boolean;
  rejectionReason: string | null;
  orderCount: number;
  createdAt: string;
  flags: {
    /** Granted (VERIFIED/EXPIRED) with no document behind it at all. */
    missingDocument: boolean;
    /** The document only exists on a developer's disk — unreadable in production. */
    localOnlyDocument: boolean;
    /** VERIFIED with no expiry on file: nothing will ever expire it. */
    noExpiry: boolean;
    /** A VERIFIED buyer's replacement certificate is waiting for a decision. */
    replacementPending: boolean;
  };
  /** Holder ↔ account check of the latest automatic verdict, when it wasn't a match. */
  holderWarning: FgasCheck | null;
  audit: AdminAuditEntry[];
}

export interface AdminUsersPage {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: Record<AdminUserFilter, number>;
}

const reviewWhere = (): Prisma.UserWhereInput => ({ OR: [{ fGasStatus: { in: ["PENDING_REVIEW", "REJECTED"] } }, { fGasPendingSubmissionId: { not: null } }] });
const expiredWhere = (now: Date): Prisma.UserWhereInput => ({ OR: [{ fGasStatus: "EXPIRED" }, { fGasStatus: "VERIFIED", fGasExpiresAt: { lt: now } }] });

function filterWhere(filter: AdminUserFilter, now: Date): Prisma.UserWhereInput {
  if (filter === "all") return {};
  if (filter === "review") return reviewWhere();
  if (filter === "EXPIRED") return expiredWhere(now);
  if (filter === "VERIFIED") return { fGasStatus: "VERIFIED", OR: [{ fGasExpiresAt: null }, { fGasExpiresAt: { gte: now } }] };
  return { fGasStatus: filter };
}

function searchWhere(query: string): Prisma.UserWhereInput {
  const q = query.trim();
  if (q.length < 2) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { vatNumber: { contains: q.replace(/[\s.-]/g, ""), mode: "insensitive" } },
    ],
  };
}

export async function listAdminUsers(options: { filter?: AdminUserFilter; query?: string; page?: number }): Promise<AdminUsersPage> {
  const now = new Date();
  const filter = options.filter ?? "all";
  const search = searchWhere(options.query ?? "");
  const where: Prisma.UserWhereInput = { AND: [filterWhere(filter, now), search] };
  const countOf = (f: AdminUserFilter) => prisma.user.count({ where: { AND: [filterWhere(f, now), search] } });

  const [total, ...chipCounts] = await Promise.all([prisma.user.count({ where }), ...ADMIN_USER_FILTERS.map(countOf)]);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ fGasSubmittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
    take: ADMIN_USERS_PAGE_SIZE,
    select: {
      id: true, name: true, email: true, companyName: true, vatNumber: true, role: true,
      fGasStatus: true, fGasExpiresAt: true, fGasPendingSubmissionId: true, fGasDocumentUrl: true, fGasExtractedData: true,
      fGasSubmittedAt: true, fGasReviewedAt: true, fGasReviewedBy: true, fGasRejectionReason: true, createdAt: true,
      _count: { select: { orders: true } },
      fgasAuditLog: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  const actorIds = [...new Set(users.flatMap((u) => u.fgasAuditLog.map((l) => l.actorId)).filter((a) => !isAiActor(a) && a !== "system"))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })).map((a) => [a.id, a.email ?? a.id]));

  return {
    rows: users.map((u) => {
      const effective = getEffectiveFgasStatus(u, now);
      const granted = u.fGasStatus === "VERIFIED" || u.fGasStatus === "EXPIRED";
      const latestAuto = u.fgasAuditLog.find((l) => isAiActor(l.actorId) && Array.isArray(l.checks));
      const holder = (latestAuto?.checks as FgasCheck[] | null)?.find((c) => c.id === "holder" && c.outcome !== "pass") ?? null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        companyName: u.companyName,
        vatNumber: u.vatNumber,
        role: u.role,
        status: u.fGasStatus,
        effectiveStatus: effective,
        expiresAt: u.fGasExpiresAt?.toISOString() ?? null,
        documentHref: u.fGasDocumentUrl ? certificateHref(u.id) : null,
        extracted: (u.fGasExtractedData as FgasExtraction | null) ?? null,
        submittedAt: u.fGasSubmittedAt?.toISOString() ?? null,
        reviewedAt: u.fGasReviewedAt?.toISOString() ?? null,
        decidedByAi: isAiActor(u.fGasReviewedBy),
        rejectionReason: u.fGasRejectionReason,
        orderCount: u._count.orders,
        createdAt: u.createdAt.toISOString(),
        flags: {
          missingDocument: granted && !u.fGasDocumentUrl,
          localOnlyDocument: isLocalOnlyDocument(u.fGasDocumentUrl),
          noExpiry: u.fGasStatus === "VERIFIED" && !u.fGasExpiresAt,
          replacementPending: Boolean(u.fGasPendingSubmissionId),
        },
        holderWarning: holder,
        audit: u.fgasAuditLog.map((l) => ({
          id: l.id,
          action: l.action,
          actor: isAiActor(l.actorId) ? "AI" : l.actorId === "system" ? "System" : (actors.get(l.actorId) ?? l.actorId),
          previousStatus: l.previousStatus,
          newStatus: l.newStatus,
          certificateId: l.certificateId,
          reason: l.reason,
          checks: (l.checks as FgasCheck[] | null) ?? null,
          documentHref: documentHref(l.documentUrl),
          createdAt: l.createdAt.toISOString(),
        })),
      };
    }),
    total,
    page,
    pageCount,
    counts: Object.fromEntries(ADMIN_USER_FILTERS.map((f, i) => [f, chipCounts[i]!])) as Record<AdminUserFilter, number>,
  };
}
