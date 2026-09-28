import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { PDF_FONT_FAMILY, registerFonts, sellerDetails } from "@/lib/pdf";
import { HIGH_GWP_THRESHOLD, calculateOrderCo2e, kgToTonnes } from "@/lib/compliance";
import ComplianceReportPdf, {
  type ComplianceReportData,
  type ComplianceReportLine,
} from "@/components/pdf/ComplianceReportPdf";

/**
 * Builds and renders the F-Gas supply / CO2e report.
 *
 * Split from lib/compliance.ts the same way lib/pdf.ts is split from the
 * invoice maths: the calculation module stays free of @react-pdf, which is a
 * few hundred kilobytes of Node-only code that the dashboard page has no
 * reason to pull in just to show three numbers.
 */

export class ComplianceReportEmptyError extends Error {
  constructor(userId: string) {
    super(`No supplied refrigerant to report for user ${userId}`);
    this.name = "ComplianceReportEmptyError";
  }
}

/** Fixed locale: an archival record, not a localized view — matches the invoice. */
const DATE_FMT = new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short", year: "numeric" });

export type ReportPeriod = "ytd" | "all";

function periodStart(period: ReportPeriod, now: Date): Date | null {
  return period === "ytd" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : null;
}

/** "R-410A Premium" → "R-410A" — the mark, which is what a regulator reads. */
function refrigerantOf(name: string): string {
  return name.split(" ")[0] || name;
}

export async function buildComplianceReportData(
  userId: string,
  period: ReportPeriod = "ytd",
  now: Date = new Date()
): Promise<ComplianceReportData> {
  const since = periodStart(period, now);

  const [user, orders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        companyName: true,
        vatNumber: true,
        certificates: {
          select: { certId: true, issuedAt: true },
          orderBy: { issuedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.order.findMany({
      where: {
        userId,
        paymentStatus: { not: "FAILED" },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        orderNumber: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            weightKgAtPurchase: true,
            gwpAtPurchase: true,
            product: { select: { name: true, sku: true, gwp: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!user) throw new ComplianceReportEmptyError(userId);

  // Cost each order separately so every line keeps its order number and date,
  // then flatten. calculateOrderCo2e is the single place the arithmetic lives.
  const lines: ComplianceReportLine[] = [];
  let unknownGwpLines = 0;
  let estimatedLines = 0;

  for (const order of orders) {
    const costed = calculateOrderCo2e(order.items);
    unknownGwpLines += costed.unknownGwpLines;
    estimatedLines += costed.estimatedLines;
    for (const line of costed.lines) {
      // Equipment carries no refrigerant; it belongs on the invoice, not in a
      // gas supply ledger.
      if (!line.isGas) continue;
      lines.push({
        date: DATE_FMT.format(order.createdAt),
        orderNumber: order.orderNumber,
        sku: line.sku,
        refrigerant: refrigerantOf(line.name),
        quantity: line.quantity,
        massKg: line.massKg,
        gwp: line.gwp,
        co2eKg: line.co2eKg,
        estimated: line.gwpSource === "catalogue",
      });
    }
  }

  if (lines.length === 0) throw new ComplianceReportEmptyError(userId);

  // Roll up by mark for the summary table.
  const byMark = new Map<string, { gwp: number | null; massKg: number; co2eKg: number }>();
  for (const l of lines) {
    const e = byMark.get(l.refrigerant) ?? { gwp: l.gwp, massKg: 0, co2eKg: 0 };
    e.massKg += l.massKg;
    e.co2eKg += l.co2eKg;
    if (e.gwp === null) e.gwp = l.gwp;
    byMark.set(l.refrigerant, e);
  }

  const totalCo2eKg = lines.reduce((s, l) => s + l.co2eKg, 0);
  const totalMassKg = lines.reduce((s, l) => s + l.massKg, 0);

  const totals = [...byMark.entries()]
    .map(([refrigerant, v]) => ({
      refrigerant,
      gwp: v.gwp,
      massKg: Math.round(v.massKg * 100) / 100,
      co2eTonnes: kgToTonnes(v.co2eKg),
      share: totalCo2eKg > 0 ? v.co2eKg / totalCo2eKg : 0,
    }))
    .sort((a, b) => b.co2eTonnes - a.co2eTonnes);

  const highGwpKg = [...byMark.values()]
    .filter((v) => v.gwp !== null && v.gwp >= HIGH_GWP_THRESHOLD)
    .reduce((s, v) => s + v.co2eKg, 0);

  const first = orders[0]?.createdAt;
  const last = orders[orders.length - 1]?.createdAt;
  const periodLabel =
    period === "ytd"
      ? `1 Jan ${now.getUTCFullYear()} – ${DATE_FMT.format(now)}`
      : first && last
        ? `${DATE_FMT.format(first)} – ${DATE_FMT.format(last)}`
        : DATE_FMT.format(now);

  return {
    // Deterministic and account-scoped: two reports pulled the same day for
    // the same account carry the same reference, which is what an auditor
    // cross-referencing a bundle needs.
    reference: `FGAS-${period.toUpperCase()}-${now.toISOString().slice(0, 10)}-${userId.slice(-6).toUpperCase()}`,
    generatedAt: DATE_FMT.format(now),
    periodLabel,
    seller: sellerDetails(),
    buyer: {
      name: user.name,
      company: user.companyName,
      email: user.email,
      vatId: user.vatNumber,
      certificateId: user.certificates[0]?.certId ?? null,
    },
    lines,
    totals,
    totalMassKg: Math.round(totalMassKg * 100) / 100,
    totalCo2eTonnes: kgToTonnes(totalCo2eKg),
    highGwpTonnes: kgToTonnes(highGwpKg),
    highGwpShare: totalCo2eKg > 0 ? highGwpKg / totalCo2eKg : 0,
    unknownGwpLines,
    estimatedLines,
  };
}

/**
 * Renders the report to a PDF buffer.
 *
 * Same call convention as generateInvoicePdfBuffer: the component is invoked
 * as a plain function, because renderToBuffer wants the <Document> element
 * itself rather than a component wrapping one.
 */
export async function generateComplianceReportPdf(
  userId: string,
  period: ReportPeriod = "ytd"
): Promise<{ buffer: Buffer; data: ComplianceReportData }> {
  const unicodeFonts = registerFonts();
  const data = await buildComplianceReportData(userId, period);
  const buffer = await renderToBuffer(
    ComplianceReportPdf({ data, fontFamily: unicodeFonts ? PDF_FONT_FAMILY : undefined })
  );
  return { buffer, data };
}
