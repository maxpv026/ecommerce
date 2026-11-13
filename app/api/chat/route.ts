import { after } from "next/server";
import { alertSupportMessage } from "@/lib/telegram/alerts";
import { sweepExpiredChats } from "@/lib/chatRetention";
import { createUIMessageStream, createUIMessageStreamResponse, hasToolCall, stepCountIs, streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { logAiUsage } from "@/lib/ai/budget";
import { z } from "zod";
import { auth } from "@/auth";
import { ASSISTANT_UNAVAILABLE, CHAT_STREAM_TIMEOUT, timeoutAsUnavailable } from "@/lib/aiTimeout";
import { getProducts, type StoreProduct } from "@/lib/data";
import { parseGasMarks } from "@/lib/gasMarks";
import { isPurchasable } from "@/lib/waitlist";
import {
  currentSession,
  escalateSession,
  modelHistory,
  notifyAdminOfEscalation,
  saveMessage,
  startSession,
  type ChatMessageData,
} from "@/lib/chatSession";

/**
 * POST /api/chat — the storefront support assistant.
 *
 * The browser sends only its newest message (see AIChatWidget's transport).
 * The conversation is the database's: the user's turn is saved, the model
 * reads the stored history, and its reply — text plus the products it
 * showed — is saved when the stream finishes. Once a session has been handed
 * to the team the model stays silent: the message is stored for the team
 * and nothing is generated.
 *
 * Tools:
 *   searchCatalog   real catalog rows → rendered by the widget as ProductCards
 *   escalateToHuman hands the session to the team and stops the model
 */

// Every route runs on Node.js in this Next.js version.
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are My Energy AI, the support assistant of My Energy, a B2B wholesaler of refrigerant gases (cylinders, drums), refrigeration equipment and recovery cylinders, for certified HVAC/R professionals in Europe. Be concise, technical and professional. Use metric units.

Catalog and prices:
- Whenever the user asks about products, stock, availability, prices or sizes, call searchCatalog. The products it returns are already shown to the user as product cards with price, stock and an add-to-cart button. Do not list them again: reply in one or two sentences that help them choose (which fits, which is in stock).
- Never write links or URLs — the cards link to the products.
- Any question about whether we sell, stock or have something — gas, cylinders, recovery cylinders, tools, equipment — must go through searchCatalog first (use the query field for anything that isn't a refrigerant). Never answer it from general knowledge.
- Never state a price, stock level or product that searchCatalog did not return. If nothing matches, say so plainly. When the result's note says the matches are out of stock, say we carry it but it's currently out of stock, and that they can use "Notify me" on the card.
- If a refrigerant is phased out or unavailable (e.g. R-22), you may suggest the usual replacement and search for it.

Handing over to a person — call escalateToHuman, and then stop, when:
- the user asks for a human, a person, a sales rep, a callback or a quote negotiation;
- the user asks for custom, volume or bulk pricing, contract terms or credit;
- the user reports a problem with an order, delivery, invoice or account that you cannot see or fix;
- you cannot resolve the request after a genuine attempt.
Do not promise anything on the team's behalf (prices, delivery dates, refunds).

You can also explain F-Gas Regulation basics and decipher common HVAC fault codes from general knowledge, saying so when unsure.`;

const Body = z.object({
  message: z.object({
    id: z.string().max(100).optional(),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).max(20),
  }),
  pathname: z.string().max(200).optional(),
});

/** An empty, well-formed UI stream: useChat finishes cleanly with no reply. */
const silentResponse = () => createUIMessageStreamResponse({ stream: createUIMessageStream({ execute: () => {} }) });

export async function POST(req: Request) {
  // Retention sweep for everyone's chats, after this response (lib/chatRetention).
  after(sweepExpiredChats);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  const text = parsed.data.message.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim()
    .slice(0, 2000);
  if (!text) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });

  const userId = (await auth())?.user?.id ?? null;
  const session = (await currentSession(userId)) ?? (await startSession(userId, parsed.data.pathname ?? null));
  await saveMessage(session.id, "user", text);

  // With the team: stored for them, no automated reply.
  if (session.status === "ESCALATED_TO_HUMAN") {
    // …and forwarded to the admins' Telegram, where a reply answers this chat.
    after(() => alertSupportMessage(session.id, text));
    return silentResponse();
  }

  const shown: string[] = [];
  let escalated = false;

  const searchCatalog = tool({
    description:
      "Search the live My Energy catalog. Returns matching products with price per kg, container size, price per container, refundable deposit and stock. The user sees them as product cards.",
    inputSchema: z.object({
      refrigerant: z.string().nullable().describe("Refrigerant mark, e.g. 'R-32', 'R-410A'. Null to search by text only."),
      query: z.string().nullable().describe("Free text for anything else: a product name, SKU, 'recovery cylinder', 'manifold'. Null if not needed."),
      containerKg: z.number().nullable().describe("Preferred container size in kg if the user said one (e.g. 10 for a 10 kg cylinder). Null otherwise."),
      inStockOnly: z.boolean().describe("True unless the user explicitly wants to see unavailable products too."),
    }),
    execute: async ({ refrigerant, query, containerKg, inStockOnly }) => {
      const marks = parseGasMarks(refrigerant ?? undefined);
      // An unknown mark must not silently turn into "everything".
      if (refrigerant && marks.length === 0) return { products: [] as StoreProduct[], note: `${refrigerant} is not a refrigerant we stock.` };
      const all = await getProducts({ gasMarks: marks, search: query ?? undefined });
      let rows = inStockOnly ? all.filter(isPurchasable) : all;
      // Nothing in stock but we do carry it: show those (their cards offer
      // "Notify me") rather than leave the buyer at "nothing available".
      const outOfStockFallback = inStockOnly && rows.length === 0 && all.length > 0;
      if (outOfStockFallback) rows = all;
      if (containerKg && containerKg > 0) rows = [...rows].sort((a, b) => Math.abs(a.weightKg - containerKg) - Math.abs(b.weightKg - containerKg));
      const products = rows.slice(0, 4);
      shown.push(...products.map((p) => p.id).filter((id) => !shown.includes(id)));
      return { products, totalMatches: rows.length, ...(outOfStockFallback ? { note: "None in stock; showing matching products that are out of stock (the user can join their waitlist)." } : {}) };
    },
    // The widget gets the full rows (for the cards); the model gets only what
    // it needs to talk about them. Handing it ids and hrefs is how it ended up
    // writing "[View Product](https://myenergy.com/…)" — a domain that isn't
    // ours — and re-listing every price the cards already show.
    toModelOutput: ({ output }) => ({
      type: "json",
      value: {
        shownToUserAsCards: output.products.length,
        totalMatches: "totalMatches" in output ? output.totalMatches : 0,
        ...("note" in output ? { note: output.note } : {}),
        products: output.products.map((p) => ({
          name: p.name,
          size: p.weightLabel,
          pricePerContainerEur: p.pricePerKg > 0 ? p.cylinderPrice : null,
          inStock: isPurchasable(p),
        })),
      },
    }),
  });

  const escalateToHuman = tool({
    description:
      "Hand this conversation to the My Energy team. Use when the user asks for a person, wants custom/bulk pricing or terms, has an order/account problem you can't see, or you can't resolve the request. After calling it, stop — do not write anything else.",
    inputSchema: z.object({
      reason: z.enum(["customer_requested", "bulk_pricing", "order_or_account_issue", "unresolved", "other"]),
      summary: z.string().max(400).describe("One or two sentences for the team: what the customer needs."),
    }),
    execute: async ({ reason, summary }) => {
      const first = await escalateSession(session.id, `${reason}: ${summary}`);
      escalated = true;
      // After the response: the visitor's stream never waits on SMTP.
      if (first) after(() => notifyAdminOfEscalation(session.id));
      return { escalated: true };
    },
  });

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: parsed.data.pathname
      ? `${SYSTEM_PROMPT}\n\nThe user is on the ${parsed.data.pathname} page; use it for context when natural.`
      : SYSTEM_PROMPT,
    messages: await modelHistory(session.id),
    tools: { searchCatalog, escalateToHuman },
    // Tool → answer needs a second step; a handoff ends the turn at once so
    // the model can't keep talking for the team.
    stopWhen: [stepCountIs(5), hasToolCall("escalateToHuman")],
    // Per step. Replies are one or two sentences; this caps what a prompt
    // engineered to make the model ramble can cost.
    maxOutputTokens: 800,
    timeout: CHAT_STREAM_TIMEOUT,
    // Logged with the real cause; the browser gets a stable code, never the
    // provider's raw message (quota, keys, request ids).
    // FinOps trail: every turn's tokens, all steps (tool call + answer) together.
    onFinish: ({ totalUsage }) => logAiUsage({ feature: "chat", model: "gpt-4o-mini", source: "model", inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens, cachedInputTokens: totalUsage.cachedInputTokens }),
    onError: ({ error }) => console.error("[chat] stream error:", error),
    onAbort: () => console.error("[chat] stream timed out"),
  });

  // A timeout ends as the same ASSISTANT_UNAVAILABLE error, not an empty bubble.
  const stream = result.toUIMessageStream({
    onError: () => ASSISTANT_UNAVAILABLE,
    messageMetadata: ({ part }) => (part.type === "start" ? { author: "assistant", createdAt: new Date().toISOString() } : undefined),
    onFinish: async ({ responseMessage, isAborted }) => {
      const reply = responseMessage.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("")
        .trim();
      const data: ChatMessageData = {
        ...(shown.length ? { productIds: shown } : {}),
        ...(escalated ? { escalated: true } : {}),
      };
      if (!reply && !shown.length && !escalated) return;
      try {
        await saveMessage(session.id, "assistant", reply + (isAborted ? " …" : ""), data);
      } catch (error) {
        console.error(`[support] could not save the reply for ${session.id}:`, error);
      }
    },
  });
  return createUIMessageStreamResponse({ stream: timeoutAsUnavailable(stream) });
}
