"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin/permissions";
import { saveMessage } from "@/lib/chatSession";
import { isChatExpired, purgeIfExpired } from "@/lib/chatRetention";
import { sendHtmlEmail } from "@/lib/mail";
import { emailContext } from "@/lib/email/context";
import type { Block } from "@/lib/email/design";

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
  const sessionId = SessionId.safeParse(rawSessionId);
  const text = z.string().trim().min(1).max(4000).safeParse(rawText);
  if (!sessionId.success || !text.success) return { ok: false, error: "Write a reply first." };
  if (await expired(sessionId.data)) return { ok: false, error: EXPIRED };

  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId.data },
    select: { id: true, status: true, user: { select: { email: true, name: true, locale: true } } },
  });
  if (!session) return { ok: false, error: "That conversation no longer exists." };

  // Replying to an AI-active or closed conversation takes it over: the AI
  // must not answer underneath a person.
  if (session.status !== "ESCALATED_TO_HUMAN") {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { status: "ESCALATED_TO_HUMAN", escalatedAt: new Date(), escalationReason: "taken over by the team", resolvedAt: null },
    });
  }
  await saveMessage(session.id, "human_agent", text.data);

  const email = emailCustomer ? session.user?.email : null;
  if (email) {
    after(async () => {
      try {
        const c = await emailContext(session.user?.locale, "SupportEmail");
        const name = session.user?.name?.trim();
        const subject = c.t("subject");
        const { html, text: plain } = c.render({
          subject,
          preview: text.data.slice(0, 140),
          reference: c.t("badge").toLocaleUpperCase(c.locale),
          heading: c.t("heading"),
          blocks: [
            ...(name ? ([{ kind: "text", text: c.t("greeting", { name }) }] satisfies Block[]) : []),
            { kind: "text", text: c.t("intro") },
            { kind: "quote", text: text.data },
            { kind: "cta", label: c.t("cta"), href: c.url("/"), note: c.t("ctaNote") },
          ],
          footer: { reason: c.t("reason") },
        });
        await sendHtmlEmail({ to: email, subject, html, text: plain });
      } catch (error) {
        console.error(`[support] reply email for ${session.id} failed:`, error);
      }
    });
  }

  refresh(session.id);
  return { ok: true, emailed: Boolean(email) };
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
