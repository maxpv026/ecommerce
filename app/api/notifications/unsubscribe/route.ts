import prisma from "@/lib/prisma";
import { NOTIFICATION_COLUMNS, type NotificationTopic } from "@/lib/notifications";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

/**
 * /api/notifications/unsubscribe?t=<signed token>
 *
 *  GET  — a confirmation page with one button. Deliberately not the
 *         unsubscribe itself: corporate mail scanners open every link in a
 *         message, and a GET that unsubscribed would silently opt people out.
 *  POST — does it. Used by that button and by mail clients' one-click
 *         unsubscribe (RFC 8058, the List-Unsubscribe-Post header), which
 *         Gmail and Yahoo require from bulk senders.
 *
 * The signed token is the authorisation; no session is needed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABELS: Record<NotificationTopic, string> = {
  backInStock: "back-in-stock alerts",
  priceDrops: "price drop alerts",
  regulatory: "regulatory updates",
  restockReminders: "restock reminders",
  abandonedCart: "cart reminders",
  fgasExpiry: "F-Gas certificate expiry warnings",
};

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — My Energy</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:440px;margin:72px auto;padding:0 16px">
<div style="background:#0f172a;border-radius:14px 14px 0 0;padding:18px 24px;color:#93c5fd;font-weight:700;font-size:12px;letter-spacing:2.4px">MY ENERGY</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;padding:28px 24px">
<h1 style="margin:0 0 10px;font-size:20px;letter-spacing:-.3px">${title}</h1>${body}</div></div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const invalid = () =>
  page("This link isn't valid", `<p style="color:#64748b;font-size:14px;line-height:1.6">Manage your email preferences in your account under Settings → Notifications.</p>`, 400);

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return invalid();
  return page(
    `Unsubscribe from ${LABELS[parsed.topic]}?`,
    `<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 20px">You'll stop receiving ${LABELS[parsed.topic]} from My Energy. Order and account emails are not affected.</p>
<form method="post"><button type="submit" style="background:#1d4ed8;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`
  );
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return invalid();

  try {
    // updateMany: a deleted account is a no-op, not a 500.
    await prisma.user.updateMany({ where: { id: parsed.userId }, data: { [NOTIFICATION_COLUMNS[parsed.topic]]: false } });
  } catch (error) {
    console.error("[unsubscribe] failed:", error);
    return page("Something went wrong", `<p style="color:#64748b;font-size:14px">Please try again, or turn it off in Settings → Notifications.</p>`, 500);
  }
  return page(
    "You're unsubscribed",
    `<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0">You won't receive ${LABELS[parsed.topic]} any more. You can turn them back on any time in Settings → Notifications.</p>`
  );
}
