import { cronAuthorization } from "@/lib/cronAuth";
import { checkPriceAlerts, getGasIndex, recordPriceSnapshots } from "@/lib/priceHistory";

/**
 * GET /api/cron/price-snapshot — daily (vercel.json).
 *
 * Records today's €/kg for every gas size (lib/priceHistory), so the market
 * hub's chart has a point per day even when nothing was repriced, then fires
 * any target alert the index has reached. Re-running the same day records
 * nothing new.
 *
 * Authorization: Bearer CRON_SECRET (Vercel Cron sends it). Fails closed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authz = cronAuthorization(request);
  if (authz === "unconfigured") return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (authz === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const recorded = await recordPriceSnapshots("daily");
  const alerts = await checkPriceAlerts(await getGasIndex());
  return Response.json({ ok: alerts.failed === 0, recorded, ...alerts });
}
