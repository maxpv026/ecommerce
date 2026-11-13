"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin/permissions";
import { isChatExpired, purgeIfExpired } from "@/lib/chatRetention";
import { postAgentReply } from "@/lib/admin/supportOps";

/**
 * The team's side of the support chat (/admin/support). Every action
 * re-checks the caller against the database (requireAdmin) — a server
 * action is a public endpoint.
 */

type Done = { ok: true } | { ok: false; error: string };

async function admin(): Promise<string | null> {
  const session = await auth();
  const check = await requirePermission(session?.user?.id, "support");
  return check.ok ? null : "Not authorised.";
}

const SessionId = z.string().trim().min(1).max(64);

const EXPIRED = "This conversation was inactive for an hour and has been deleted.";

/** Retention: an expired chat is deleted, not acted on. */
async function expired(sessionId: string): Promise<boolean> {
  const row = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { updatedAt: true } });
  if (!row) return true;
  if (isChatExpired(row.updatedAt)) {
    await purgeIfExpired(sessionId);
    return true;
  }
  return false;
}

function refresh(sessionId: string) {
  revalidatePath("/[locale]/admin/support", "page");
  revalidatePath(`/[locale]/admin/support/${sessionId}`, "page");
}


/**
 * Posts a reply as the team. The visitor's widget picks it up on its next
 * poll. A signed-in customer is also emailed (they may have left the site
 * since asking); a guest can only be reached through the widget.
 */
export async function replyAsAgent(rawSessionId: string, rawText: string, emailCustomer = true): Promise<Done & { emailed?: boolean }> {
  const denied = await admin();
  if (denied) return { ok: false, error: denied };
  return postAgentReply(rawSessionId, rawText, emailCustomer);
}

/** Closes a conversation. The visitor's next message starts a new one with the AI. */
export async function resolveChat(rawSessionId: string): Promise<Done> {
  const denied = await admin();
  if (denied) return { ok: false, error: denied };
  const sessionId = SessionId.safeParse(rawSessionId);
  if (!sessionId.success) return { ok: false, error: "Unknown conversation." };
  if (await expired(sessionId.data)) return { ok: false, error: EXPIRED };
  const { count } = await prisma.chatSession.updateMany({
    where: { id: sessionId.data, status: { not: "RESOLVED" } },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "Already resolved." };
  refresh(sessionId.data);
  return { ok: true };
}

/** Hands an escalated conversation back to the AI (e.g. the question was routine after all). */
export async function returnChatToAi(rawSessionId: string): Promise<Done> {
  const denied = await admin();
  if (denied) return { ok: false, error: denied };
  const sessionId = SessionId.safeParse(rawSessionId);
  if (!sessionId.success) return { ok: false, error: "Unknown conversation." };
  if (await expired(sessionId.data)) return { ok: false, error: EXPIRED };
  const { count } = await prisma.chatSession.updateMany({
    where: { id: sessionId.data, status: "ESCALATED_TO_HUMAN" },
    data: { status: "AI_ACTIVE" },
  });
  if (count === 0) return { ok: false, error: "This conversation isn't with the team." };
  refresh(sessionId.data);
  return { ok: true };
}
