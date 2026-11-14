import { auth } from "@/auth";
import { getProfileDashboardData, getUserOrders } from "@/lib/data";

/**
 * GET /api/home/account — the signed-in figures on the home page: the KPI
 * cards and the latest order (quick reorder, tracking).
 *
 * The home page itself is static (ISR): it renders the same shell for
 * everyone and never blocks on auth(). A signed-in buyer's browser fetches
 * this once the session is known. Database reads only (~0.3 s) — the
 * recommendations, which may wait on a model, are /api/home/recommendations,
 * so they can't hold the KPI cards on their skeletons. Per-user, never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const [dashboard, orders] = await Promise.all([getProfileDashboardData(userId), getUserOrders(userId)]);
  return Response.json({ ok: true, dashboard, latestOrder: orders[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
