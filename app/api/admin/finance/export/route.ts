import { requirePermission } from "@/lib/admin/permissions";
import { auth } from "@/auth";
import { accountingCsv, parseRange } from "@/lib/admin/accounting";

/**
 * GET /api/admin/finance/export?days=30|90|365|0 — the order ledger as CSV,
 * for the accountant (and the owner). finance.export, re-read from the row;
 * proxy.ts has already refused anyone without it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const guard = await requirePermission(session?.user?.id, "finance.export");
  if (!guard.ok) return Response.json({ ok: false, code: guard.code }, { status: guard.code === "UNAUTHENTICATED" ? 401 : 403 });

  const range = parseRange(new URL(request.url).searchParams.get("days"));
  const csv = await accountingCsv(range);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-energy-ledger-${range || "all"}d-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
