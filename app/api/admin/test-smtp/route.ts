import { auth } from "@/auth";
import { requireAdmin } from "@/lib/fgasReview";
import { sendSmtpSelfTest, smtpDiagnostics } from "@/lib/mail";

/**
 * GET /api/admin/test-smtp — does email work at all?
 *
 * One job: send a plain message to ADMIN_EMAIL through the same transporter
 * the back-in-stock mail uses, and hand back whatever the SMTP server said.
 * Nothing about products, waitlists or webhooks is involved, so a failure
 * here is the transport and a success here means the transport is fine and
 * the fault is further up.
 *
 * Open it in the browser while signed in as the admin:
 *   http://localhost:3000/api/admin/test-smtp
 *
 * The response carries the raw `accepted` / `rejected` / `response` from the
 * server. It reports the shape of the credentials — never their value.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const admin = await requireAdmin(session?.user?.id);
  if (!admin.ok) {
    return Response.json(
      { ok: false, code: admin.code, hint: "Sign in as the ADMIN_EMAIL account first." },
      { status: admin.code === "FORBIDDEN" ? 403 : 401 }
    );
  }

  const to = process.env.ADMIN_EMAIL?.trim();
  const config = smtpDiagnostics();
  console.log("[SMTP-TEST] config:", JSON.stringify(config));

  if (!to) {
    console.error("[SMTP-TEST] ADMIN_EMAIL is not set — nowhere to send the test.");
    return Response.json({ ok: false, code: "NO_ADMIN_EMAIL", config }, { status: 500 });
  }

  console.log(`[SMTP-TEST] sending to ${to} …`);
  try {
    const delivery = await sendSmtpSelfTest(to);
    console.log("[SMTP-TEST] SUCCESS. Raw SMTP response:", JSON.stringify(delivery));
    return Response.json({
      ok: true,
      sentTo: to,
      config,
      smtp: delivery,
      hint: "Transport works. If the back-in-stock mail still does not arrive, the fault is in the waitlist flow, not SMTP — check /api/admin/test-restock.",
    });
  } catch (error) {
    const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
    console.error("[SMTP-TEST] FAILED:", error);
    return Response.json(
      {
        ok: false,
        code: "SEND_FAILED",
        config,
        error: {
          code: e.code ?? null,
          responseCode: e.responseCode ?? null,
          response: e.response ?? null,
          message: e.message ?? String(error),
        },
        hint:
          e.responseCode === 535
            ? "535 = authentication refused. The App Password is wrong, still has spaces in it, or 2-Step Verification is off for this Google account."
            : "See `error.response` for what the server actually said.",
      },
      { status: 502 }
    );
  }
}
