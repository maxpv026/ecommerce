import { auth } from "@/auth";
import { getRecommendedProducts } from "@/lib/data";

/**
 * GET /api/home/recommendations — this buyer's picks, shown first in the
 * home's Popular grid. Separate from /api/home/account because it may wait on
 * a model call (cached per user, capped at 2.5 s in lib/data); the page shows
 * the plain catalog order until it arrives. Per-user, never cached here.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const products = await getRecommendedProducts(userId, 4);
  return Response.json({ ok: true, products }, { headers: { "Cache-Control": "private, no-store" } });
}
