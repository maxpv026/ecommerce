import { NextResponse } from "next/server";
import { getMarketAlerts } from "@/lib/data";

// The interesting caching happens in lib/data.ts's unstable_cache wrapper
// (shared with the Home page's direct server-side call); this export just
// mirrors that revalidation window for anything hitting the route directly.
export const revalidate = 43200; // 12 hours (route segment config only accepts literal values)

export async function GET() {
  const alerts = await getMarketAlerts();
  return NextResponse.json({ alerts });
}
