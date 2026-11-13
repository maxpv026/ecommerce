import { auth } from "@/auth";
import { getCustomerComplianceSummary } from "@/lib/compliance";

/**
 * GET /api/compliance/ledger — the signed-in buyer's F-Gas supply ledger as
 * CSV: the same lines /profile/compliance and the PDF report show (lib/compliance
 * ledgerLines), for a spreadsheet or the buyer's own F-Gas register.
 * Semicolon-separated with a UTF-8 BOM, so Excel opens it correctly in every
 * EU locale (where the comma is the decimal separator).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return new Response("Not found", { status: 404 });

  // Same period switch as the page and the PDF, so the three exports agree.
  const period = new URL(request.url).searchParams.get("period") === "all" ? "all" : "ytd";
  const summary = await getCustomerComplianceSummary(userId, { period });
  const header = ["date", "order", "sku", "product", "refrigerant", "cylinders", "unit_kg", "mass_kg", "gwp", "co2e_kg", "co2e_t"];
  const rows = summary.ledger.map((l) => [l.date.slice(0, 10), l.orderNumber, l.sku, l.name, l.refrigerant, l.quantity, l.unitMassKg, l.massKg, l.gwp, l.co2eKg, l.co2eTonnes]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
  const stamp = summary.generatedAt.toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fgas-ledger-${period}-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
