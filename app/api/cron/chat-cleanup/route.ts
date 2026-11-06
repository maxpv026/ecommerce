import { cronAuthorization } from "@/lib/cronAuth";
import { purgeExpiredChats } from "@/lib/chatRetention";

/**
 * GET /api/cron/chat-cleanup — deletes support chats inactive for an hour.
 *
 *   Authorization: Bearer {CRON_SECRET}     ← Vercel Cron sends this
 *
 * Hourly (vercel.json). The hour itself is enforced on every read
 * (lib/chatRetention); this sweep removes what nobody opened.
 *
 * Responses
 *   200  { ok: true, deleted }
 *   401  { ok: false, error }      bad or missing bearer token
 *   503  { ok: false, error }      CRON_SECRET unset
 *   500  { ok: false, error }      the delete failed (see server log)
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = cronAuthorization(request);
  if (auth === "unconfigured") return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const deleted = await purgeExpiredChats();
    if (deleted > 0) console.log(`[chat-cleanup] deleted ${deleted} expired chat session(s)`);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    console.error("[chat-cleanup] failed:", error);
    return Response.json({ ok: false, error: "Cleanup failed; see the server log." }, { status: 500 });
  }
}
