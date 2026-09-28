import { auth } from "@/auth";
import {
  ComplianceReportEmptyError,
  generateComplianceReportPdf,
  type ReportPeriod,
} from "@/lib/complianceReport";

/**
 * GET /api/compliance/report?period=ytd|all
 *
 * Streams the signed-in buyer's F-Gas supply / CO2e record as a PDF.
 *
 * There is deliberately no `userId` parameter. The invoice route takes an id
 * because an invoice has one and an admin may need to fetch a specific
 * document; this report is always "mine", derived from the session, so there
 * is no id to guess and no authorisation branch to get wrong. An admin who
 * needs a customer's record should get it through the admin surface, where
 * the access is logged.
 */

// @react-pdf/renderer is Node-only (Buffer, streams, fontkit).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Not found", { status: 404 });

  const raw = new URL(request.url).searchParams.get("period");
  const period: ReportPeriod = raw === "all" ? "all" : "ytd";

  try {
    const { buffer, data } = await generateComplianceReportPdf(userId, period);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="${data.reference}.pdf"`,
        // A compliance record reflects the account at the moment it was
        // pulled; a cached copy handed to an auditor would be worse than a
        // slow one.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ComplianceReportEmptyError) {
      // Nothing bought yet is not an error condition — the UI keeps the
      // button disabled — but a direct hit should say so rather than 500.
      return new Response("No refrigerant supplied on this account yet", { status: 404 });
    }
    console.error("[compliance] report generation failed:", error);
    return new Response("Report generation failed", { status: 500 });
  }
}
