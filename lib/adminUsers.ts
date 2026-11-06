import "server-only";

import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { FGasStatus } from "@/lib/generated/prisma/enums";
import type { FgasExtraction } from "@/lib/fgas";
import { AI_REVIEWER_ID } from "@/lib/fgasReview";
import { certificateHref } from "@/lib/fgasStorage";

/**
 * The admin user directory — read side only. Decisions go through
 * lib/fgasReview (approve/reject), which owns the state machine; nothing
 * here writes.
 *
 * Callers must have checked admin rights first: this returns names, emails,
 * VAT numbers and certificate details for every account.
 */

export const ADMIN_USERS_PAGE_SIZE = 25;

/** The filter chips. "review" = what an admin should look at: refused or legacy-pending. */
export const ADMIN_USER_FILTERS = ["all", "review", "VERIFIED", "REJECTED", "NONE"] as const;
export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number];

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string | null;
  companyName: string | null;
  vatNumber: string | null;
  role: "USER" | "ADMIN";
  status: FGasStatus;
  /**
   * Where the admin opens the certificate — always the authenticated
   * /api/fgas/certificate route; the storage URL never leaves the server.
   */
  documentHref: string | null;
  extracted: FgasExtraction | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  /** The model made the last decision and no human has since. */
  decidedByAi: boolean;
  rejectionReason: string | null;
  orderCount: number;
  createdAt: string;
}

export interface AdminUsersPage {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: Record<AdminUserFilter, number>;
}

function filterWhere(filter: AdminUserFilter): Prisma.UserWhereInput {
  if (filter === "all") return {};
  if (filter === "review") return { fGasStatus: { in: ["PENDING_REVIEW", "REJECTED"] } };
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

export async function listAdminUsers(options: {
  filter?: AdminUserFilter;
  query?: string;
  page?: number;
}): Promise<AdminUsersPage> {
  const filter = options.filter ?? "all";
  const search = searchWhere(options.query ?? "");
  const where: Prisma.UserWhereInput = { AND: [filterWhere(filter), search] };

  const [total, grouped, allCount] = await Promise.all([
    prisma.user.count({ where }),
    // Chip counts follow the search, so "Verified 3" means 3 among these results.
    prisma.user.groupBy({ by: ["fGasStatus"], where: search, _count: { _all: true } }),
    prisma.user.count({ where: search }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);

  const users = await prisma.user.findMany({
    where,
    // Needs-attention first within any filter, then newest submissions.
    orderBy: [{ fGasSubmittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
    take: ADMIN_USERS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      companyName: true,
      vatNumber: true,
      role: true,
      fGasStatus: true,
      fGasDocumentUrl: true,
      fGasExtractedData: true,
      fGasSubmittedAt: true,
      fGasReviewedAt: true,
      fGasReviewedBy: true,
      fGasRejectionReason: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });

  const byStatus = (s: FGasStatus) => grouped.find((g) => g.fGasStatus === s)?._count._all ?? 0;

  return {
    rows: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      companyName: u.companyName,
      vatNumber: u.vatNumber,
      role: u.role,
      status: u.fGasStatus,
      documentHref: u.fGasDocumentUrl ? certificateHref(u.id) : null,
      extracted: (u.fGasExtractedData as FgasExtraction | null) ?? null,
      submittedAt: u.fGasSubmittedAt?.toISOString() ?? null,
      reviewedAt: u.fGasReviewedAt?.toISOString() ?? null,
      decidedByAi: u.fGasReviewedBy === AI_REVIEWER_ID,
      rejectionReason: u.fGasRejectionReason,
      orderCount: u._count.orders,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount,
    counts: {
      all: allCount,
      review: byStatus("PENDING_REVIEW") + byStatus("REJECTED"),
      VERIFIED: byStatus("VERIFIED"),
      REJECTED: byStatus("REJECTED"),
      NONE: byStatus("NONE"),
    },
  };
}
