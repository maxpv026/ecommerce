import { auth } from "@/auth";
import { getProfileDashboardData, getRecommendedProducts, getUserOrders, getUserProfile } from "@/lib/data";

/**
 * GET /api/home/account — the signed-in parts of the home page.
 *
 * The home page itself is static (ISR): it renders the same shell for
 * everyone and never blocks on auth(). A signed-in buyer's browser fetches
 * this once the session is known and swaps in their recommendations,
 * dashboard figures, orders and certificate. Per-user, so never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const [recommendedProducts, dashboard, orders, profile] = await Promise.all([
    getRecommendedProducts(userId, 4),
    getProfileDashboardData(userId),
    getUserOrders(userId),
    getUserProfile(userId),
  ]);
  return Response.json(
    {
      ok: true,
      recommendedProducts,
      dashboard,
      latestOrder: orders[0] ?? null,
      orders: orders.slice(0, 4),
      certificate: profile?.certificate ?? null,
      jobTitle: profile?.jobTitle ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
