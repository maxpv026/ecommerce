import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { UIMessage } from "ai";
import prisma from "@/lib/prisma";
import { getProducts, type StoreProduct } from "@/lib/data";
import { sendHtmlEmail } from "@/lib/mail";
import { absoluteUrl } from "@/lib/siteUrl";
import type { ChatRole, ChatSessionStatus } from "@/lib/generated/prisma/enums";
import { chatExpiresAt, isChatExpired, purgeIfExpired } from "@/lib/chatRetention";

/**
 * Support chat persistence and human handoff — the server side of the
 * storefront chat widget (app/api/chat, app/api/chat/session) and of the
 * admin inbox (/admin/support).
 *
 * The database is the record of a conversation. The browser sends only its
 * newest message; the history the model sees, and the transcript the widget
 * restores after a page change, are read from here — so a reply typed by
 * the team is part of the conversation like any other message.
 */

// ── Which session is this browser's? ────────────────────────────────────

/** httpOnly cookie: "<sessionId>.<hmac>", so a guest can't name someone else's session. */
const COOKIE = "me.chat";
// Long enough to outlive the session itself (deleted an hour after its last
// activity, lib/chatRetention); a cookie pointing at a deleted session simply
// starts a new one.
const COOKIE_MAX_AGE = 60 * 60 * 24;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to sign chat session cookies");
  return value;
}
const sign = (id: string) => createHmac("sha256", secret()).update(`chat:${id}`).digest("base64url");

function readCookieId(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, signature] = raw.split(".");
  if (!id || !signature) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export interface ChatSessionRow {
  id: string;
  userId: string | null;
  status: ChatSessionStatus;
}

/**
 * The open session this browser (and, when signed in, this account) is in,
 * or null. A RESOLVED session is closed — the next message starts anew. A
 * session that belongs to another account is never handed out, even with a
 * valid cookie (someone else signed in on a shared machine).
 */
export async function currentSession(userId: string | null, options: { includeResolved?: boolean } = {}): Promise<ChatSessionRow | null> {
  const id = readCookieId((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const found = await prisma.chatSession.findUnique({ where: { id }, select: { id: true, userId: true, status: true, updatedAt: true } });
  // Retention (lib/chatRetention): an hour without activity and it's gone —
  // deleted here and now rather than waiting for the hourly sweep.
  if (found && isChatExpired(found.updatedAt)) {
    await purgeIfExpired(found.id);
    return null;
  }
  const session = found && { id: found.id, userId: found.userId, status: found.status };
  if (!session || (session.status === "RESOLVED" && !options.includeResolved)) return null;
  if (session.userId && session.userId !== userId) return null;
  // A guest who signs in mid-conversation keeps it, now on their account.
  if (!session.userId && userId) {
    await prisma.chatSession.updateMany({ where: { id, userId: null }, data: { userId } });
    return { ...session, userId };
  }
  return session;
}

export async function startSession(userId: string | null, startedOn: string | null): Promise<ChatSessionRow> {
  const session = await prisma.chatSession.create({
    data: { userId, startedOn: startedOn?.slice(0, 200) ?? null },
    select: { id: true, userId: true, status: true },
  });
  (await cookies()).set(COOKIE, `${session.id}.${sign(session.id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return session;
}

// ── Messages ────────────────────────────────────────────────────────────

/** What a stored message can carry besides its text. */
export interface ChatMessageData {
  /** Product ids a catalog search showed, in order. */
  productIds?: string[];
  /** The assistant handed the conversation to the team in this message. */
  escalated?: boolean;
}

export async function saveMessage(sessionId: string, role: ChatRole, content: string, data?: ChatMessageData) {
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { sessionId, role, content: content.slice(0, 8000), data: data && Object.keys(data).length ? (data as object) : undefined },
      select: { id: true, createdAt: true },
    }),
    // updatedAt drives the admin inbox's ordering.
    prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }),
  ]);
  return message;
}

/** Metadata on every UI message the server produces. */
export interface ChatMessageMeta {
  author: "user" | "assistant" | "human_agent";
  createdAt: string;
}
export type SupportUIMessage = UIMessage<ChatMessageMeta>;

/**
 * The stored transcript as the widget renders it. Catalog results are
 * re-read by id — today's price and stock, not a snapshot — and rebuilt as
 * the same tool parts the live stream produced, so a restored conversation
 * looks exactly like it did. A team reply is an assistant message marked
 * author "human_agent", which the widget styles as a person.
 */
export async function transcript(sessionId: string, options: { after?: Date } = {}): Promise<SupportUIMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, ...(options.after ? { createdAt: { gt: options.after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const wanted = new Set(rows.flatMap((r) => ((r.data as ChatMessageData | null)?.productIds ?? [])));
  const products = wanted.size ? (await getProducts()).filter((p) => wanted.has(p.id)) : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  return rows.map((r) => {
    const data = (r.data as ChatMessageData | null) ?? {};
    const parts: SupportUIMessage["parts"] = [];
    if (data.productIds?.length) {
      parts.push({
        type: "tool-searchCatalog",
        toolCallId: `${r.id}-catalog`,
        state: "output-available",
        input: {},
        output: { products: data.productIds.map((id) => byId.get(id)).filter((p): p is StoreProduct => Boolean(p)) },
      } as SupportUIMessage["parts"][number]);
    }
    if (r.content) parts.push({ type: "text", text: r.content });
    if (data.escalated) {
      parts.push({
        type: "tool-escalateToHuman",
        toolCallId: `${r.id}-handoff`,
        state: "output-available",
        input: {},
        output: { escalated: true },
      } as SupportUIMessage["parts"][number]);
    }
    return {
      id: r.id,
      role: r.role === "user" ? "user" : "assistant",
      metadata: { author: r.role, createdAt: r.createdAt.toISOString() },
      parts,
    };
  });
}

/**
 * The conversation as the model sees it: plain text turns, newest last.
 * Product cards become a one-line note of what was shown, so the model can
 * refer back to them without re-reading every price.
 */
export async function modelHistory(sessionId: string, limit = 30) {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true, data: true },
  });
  return rows.reverse().map((r) => {
    const data = (r.data as ChatMessageData | null) ?? {};
    const shown = data.productIds?.length ? `\n[Showed ${data.productIds.length} product card(s) from the catalog.]` : "";
    return {
      role: r.role === "user" ? ("user" as const) : ("assistant" as const),
      content: (r.role === "human_agent" ? "[Reply from the My Energy team] " : "") + r.content + shown,
    };
  });
}

// ── Handoff ─────────────────────────────────────────────────────────────

/**
 * Hands a session to the team. Conditional on AI_ACTIVE, so it happens — and
 * the admin is emailed — once, however many times it's asked for (the
 * model and the visitor's button can both trigger it).
 */
export async function escalateSession(sessionId: string, reason: string): Promise<boolean> {
  const { count } = await prisma.chatSession.updateMany({
    where: { id: sessionId, status: "AI_ACTIVE" },
    data: { status: "ESCALATED_TO_HUMAN", escalatedAt: new Date(), escalationReason: reason.slice(0, 500) },
  });
  return count === 1;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * "Action Required" to the admin. Never throws: the visitor's handoff has
 * already happened, and an SMTP failure must not turn it into an error.
 *
 * Deliberately carries no conversation content — no messages, no summary of
 * the request. Chats are deleted an hour after their last activity
 * (lib/chatRetention), and a copy sitting in a mailbox would outlive that.
 * It says who, links to the chat, and says when it will be gone.
 */
export async function notifyAdminOfEscalation(sessionId: string): Promise<void> {
  const to = process.env.ADMIN_EMAIL?.trim();
  if (!to) {
    console.error(`[support] chat ${sessionId} escalated, but ADMIN_EMAIL is not set — nobody was emailed.`);
    return;
  }
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { updatedAt: true, user: { select: { name: true, companyName: true } } },
    });
    if (!session) return;
    const who = session.user ? [session.user.name, session.user.companyName].filter(Boolean).join(" · ") || "a customer" : "Guest";
    const link = absoluteUrl(`/admin/support/${sessionId}`);
    const expires = chatExpiresAt(session.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia", timeZoneName: "short" });

    await sendHtmlEmail({
      to,
      subject: `Action Required: Chat escalated by ${who}`.replace(/[\r\n]+/g, " ").slice(0, 200),
      text: `Action Required: Chat escalated by ${who}.\n\nView transcript here: ${link}\n\nThe chat is deleted an hour after its last message — around ${expires} unless someone writes again.`,
      html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:560px;font-size:14px;line-height:1.6">
  <p style="margin:0 0 14px"><strong>Action Required:</strong> Chat escalated by ${escapeHtml(who)}.</p>
  <p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#22429b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">View transcript here</a></p>
  <p style="margin:0;font-size:12.5px;color:#64748b">The chat is deleted an hour after its last message — around ${escapeHtml(expires)} unless someone writes again. This email deliberately contains none of the conversation.</p>
</div>`,
    });
  } catch (error) {
    console.error(`[support] escalation email for ${sessionId} failed:`, error);
  }
}
