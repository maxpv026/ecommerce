import { after } from "next/server";
import { auth } from "@/auth";
import { currentSession, escalateSession, notifyAdminOfEscalation, saveMessage, startSession } from "@/lib/chatSession";

/**
 * POST /api/chat/escalate — the widget's "Talk to a person" button.
 *
 * The same handoff the model's escalateToHuman tool performs, without
 * relying on the model to decide: a visitor who wants a person gets one.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pathname?: unknown };
  const userId = (await auth())?.user?.id ?? null;
  const session =
    (await currentSession(userId)) ?? (await startSession(userId, typeof body.pathname === "string" ? body.pathname : null));

  const first = await escalateSession(session.id, "customer_requested: pressed “Talk to a person”");
  if (first) {
    await saveMessage(session.id, "assistant", "", { escalated: true });
    after(() => notifyAdminOfEscalation(session.id));
  }
  return Response.json({ ok: true, status: "ESCALATED_TO_HUMAN", alreadyEscalated: !first });
}
