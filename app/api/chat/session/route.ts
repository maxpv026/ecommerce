import { auth } from "@/auth";
import { currentSession, transcript } from "@/lib/chatSession";

/**
 * GET /api/chat/session[?after=<ISO time>]
 *
 * The browser's own support conversation (found by its signed cookie, never
 * by an id in the URL). Without `after`: the whole transcript, so the widget
 * restores the conversation after a page change. With `after`: only newer
 * messages — the widget's poll for team replies while a session is with a
 * person. A conversation the team closed reports RESOLVED once, so the
 * widget can say so; the next message then starts a new one.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = (await auth())?.user?.id ?? null;
  const session = await currentSession(userId, { includeResolved: true });
  if (!session) return Response.json({ status: null, messages: [] });

  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : undefined;
  const messages = await transcript(session.id, after && !Number.isNaN(after.getTime()) ? { after } : {});
  return Response.json({ status: session.status, messages }, { headers: { "Cache-Control": "no-store" } });
}
