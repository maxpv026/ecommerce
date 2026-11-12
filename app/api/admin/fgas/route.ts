import { z } from "zod";
import { auth } from "@/auth";
import {
  approveFGasCertificate,
  listPendingReviews,
  rejectFGasCertificate,
  type ReviewErrorCode,
} from "@/lib/fgasReview";
import { requirePermission } from "@/lib/admin/permissions";

/**
 * Admin review endpoint.
 *
 *   GET  /api/admin/fgas                       → the pending queue
 *   POST /api/admin/fgas  { userId, action: "approve" }
 *   POST /api/admin/fgas  { userId, action: "reject", reason }
 *
 * Exists so a certificate can be approved from a terminal or a phone
 * without a back-office UI:
 *
 *   curl -X POST https://…/api/admin/fgas \
 *     -H 'Content-Type: application/json' \
 *     -b "authjs.session-token=<your session cookie>" \
 *     -d '{"userId":"…","action":"approve"}'
 *
 * Authorisation is the session's, checked against the database row and
 * ADMIN_EMAIL — there is no bearer-token bypass, because a leaked static
 * token would be enough to self-certify for refrigerant purchases.
 */

export const dynamic = "force-dynamic";

const ReviewRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), userId: z.string().min(1) }),
  z.object({
    action: z.literal("reject"),
    userId: z.string().min(1),
    reason: z.string().trim().min(3).max(500),
    // auto: replacement if one is parked, else reject / revoke by state.
    mode: z.enum(["auto", "revoke", "replacement"]).default("auto"),
  }),
]);

const STATUS: Record<ReviewErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  // Authenticated and an admin, but without an authenticator enrolled.
  TWO_FACTOR_REQUIRED: 403,
  USER_NOT_FOUND: 404,
  NOT_PENDING: 409,
  NO_DOCUMENT: 409,
  DOCUMENT_EXPIRED: 409,
  FAILED: 500,
};

export async function GET() {
  const session = await auth();
  const admin = await requirePermission(session?.user?.id, "users.fgas");
  if (!admin.ok) return Response.json({ ok: false, code: admin.code }, { status: STATUS[admin.code] });

  const pending = await listPendingReviews();
  return Response.json({ ok: true, count: pending.length, pending });
}

export async function POST(request: Request) {
  const session = await auth();
  const callerId = session?.user?.id;

  // Check admin before parsing: an anonymous caller learns nothing about the
  // request shape.
  const admin = await requirePermission(callerId, "users.fgas");
  if (!admin.ok) return Response.json({ ok: false, code: admin.code }, { status: STATUS[admin.code] });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = ReviewRequest.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });

  const result =
    parsed.data.action === "approve"
      ? await approveFGasCertificate(callerId, parsed.data.userId)
      : await rejectFGasCertificate(callerId, parsed.data.userId, parsed.data.reason, parsed.data.mode);

  if (!result.ok) return Response.json({ ok: false, code: result.code }, { status: STATUS[result.code] });
  return Response.json({ ok: true, userId: parsed.data.userId, status: result.value.status });
}
