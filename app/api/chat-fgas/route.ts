import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { cylinderGasPrice } from "@/lib/pricing";
import { formatContext, retrieveForQuestion } from "@/lib/rag";

/**
 * POST /api/chat-fgas — the F-Gas RAG assistant.
 *
 * A SEPARATE route from /api/chat on purpose. That one is a working general
 * assistant with its own inventory tool, substitute finder and fault-code
 * support, wired to AIChatWidget on the home and catalogue pages. This one
 * answers only from the vector knowledge base and is deliberately far more
 * constrained — they are different products and merging them would make the
 * strict one leaky and the general one useless.
 *
 * Shape of a turn:
 *   1. embed the user's latest message
 *   2. cosine-search KnowledgeChunk for the top 3 relevant facts
 *   3. stream an answer grounded ONLY in those facts
 *   4. optionally call suggestProduct, which is resolved against the real
 *      catalogue before anything reaches the client
 */

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are an elite B2B F-Gas consultant for My Energy, advising HVAC professionals on refrigerant regulation and replacement.

Answer ONLY using the CONTEXT provided in the user message. The context is the entire extent of your knowledge here.

- If the context does not contain the answer, say plainly that you do not have that data and suggest the user contact the team. Do not reason around the gap.
- NEVER invent or estimate gas properties — GWP figures, quota rules, pressures, glide, oil compatibility, phase-out dates. A number that is not in the context does not get stated.
- Do not use general knowledge about refrigerants even when you are confident. In this role, confident and unsourced is the failure mode.
- Keep answers concise and technical. Cite the context entries you used as [1], [2].

LANGUAGE:
- First identify the language of the user's most recent message, then write your entire reply in that language. If they wrote in English, reply in English. Do not assume a default language, and do not name any particular language as more likely than another.
- Do not mix languages within a reply, and do not switch language between turns unless the user switches first.
- This applies to the "I do not have that data" refusal too — never fall back to a different language for it.
- The knowledge base is written in English. Translate what the context says; do not let translating turn into paraphrasing, and never add a detail the context does not contain. Answering in another language does not widen what you are allowed to say.
- Leave these exactly as written, in every language: refrigerant designations (R-134a, R-1234yf, R-32), safety classes (A1, A2L), regulation and standard numbers (2006/40/EC, 517/2014, EN 378), and all figures. Do not translate, localise or convert them.

TOOL USE — this is a rule, not a suggestion:
- Whenever your answer names a specific refrigerant as a replacement, retrofit or alternative, you MUST call suggestProduct for it BEFORE writing that answer. Pass the designation (e.g. "R-449A") and a one-line reason.
- Call it at most twice per turn, and only for a gas the context actually names.
- Then read the result carefully and write your answer:
  - available: true  — you may offer it for order and state its price.
  - available: false — the gas is in our catalogue but CANNOT be bought right now. Name it as a technical recommendation only. Do NOT say it is available, in stock, or orderable, and never state a price for it.
  - found: false     — we do not stock it at all. Say so plainly.
- Never state a price, SKU or stock status that did not come back from the tool.
- All prices are in EUR. Quote them exactly as unitPriceFormatted gives them (e.g. "€250.00"). Never convert a price or use another currency symbol.`;

/**
 * The model names a refrigerant; the CATALOGUE decides what that means.
 *
 * Same rule as Magic Order: the model is never the source of a SKU, a price
 * or a stock status. It passes a designation, and `execute` resolves it
 * against real rows. A hallucinated gas simply comes back `found: false`,
 * and the system prompt tells the model not to recommend what is not
 * available — so the failure surfaces as "we don't stock that" rather than as
 * a confident recommendation for a product that does not exist.
 */
const suggestProduct = tool({
  description:
    "Check whether My Energy stocks a specific refrigerant and surface it to the user as a product suggestion. Call this when the context supports recommending a replacement gas. Pass the refrigerant designation (e.g. 'R-449A'), not a product name or SKU.",
  inputSchema: z.object({
    sku: z
      .string()
      .min(2)
      .max(32)
      .describe("Refrigerant designation or exact SKU, e.g. 'R-449A' or 'HC-R410A-25'."),
    reason: z
      .string()
      .min(8)
      .max(240)
      .describe("One line on why this product answers the question, grounded in the context."),
  }),
  execute: async ({ sku, reason }) => {
    // Normalised comparison so "R-449A", "r449a" and "R449A" all land on the
    // same row — the same normalisation lib/gasMarks uses everywhere else.
    const needle = sku.replace(/[^a-z0-9]/gi, "").toUpperCase();

    const candidates = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        weight: true,
        pricePerKg: true,
        weightKg: true,
        inStock: true,
        stockQuantity: true,
        cylinderDeposit: true,
      },
    });

    const norm = (v: string) => v.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const match =
      candidates.find((p) => norm(p.sku) === needle) ??
      candidates.find((p) => norm(p.name) === needle) ??
      candidates.find((p) => norm(p.name).startsWith(needle));

    if (!match) {
      return { found: false as const, query: sku, reason };
    }

    const purchasable = match.inStock && match.stockQuantity > 0 && match.pricePerKg > 0;

    // Three distinct outcomes, three distinct SHAPES — not one shape with a
    // boolean buried in it.
    //
    // This was originally a single object with `purchasable: false` sitting
    // among ten sibling fields, and gpt-4o-mini read `found: true` as "in
    // stock" and told the user an unpriced, zero-quantity cylinder was
    // "currently available". Returning the price of an unbuyable product is
    // what made that possible, so the unbuyable branch now carries no price,
    // no productId and no variant at all: there is nothing for the model to
    // quote and nothing for the UI to put an Add-to-Cart button on.
    if (!purchasable) {
      return {
        found: true as const,
        available: false as const,
        sku: match.sku,
        name: match.name,
        note: "IN CATALOGUE BUT NOT PURCHASABLE (no stock or no price). Do not tell the user it is available and do not offer it for order. Name it only as a technical recommendation.",
        reason,
      };
    }

    return {
      found: true as const,
      available: true as const,
      productId: match.id,
      sku: match.sku,
      name: match.name,
      variant: match.weight,
      // Straight from the row; the model never sets a price.
      unitPrice: cylinderGasPrice(match.pricePerKg, match.weightKg),
      // A bare number let the model pick its own currency symbol — it wrote
      // "£250" for a €250 cylinder while the card beside it read €250.00.
      // Stating the currency, and handing over a preformatted string, leaves
      // nothing to infer.
      currency: "EUR" as const,
      unitPriceFormatted: `€${cylinderGasPrice(match.pricePerKg, match.weightKg).toFixed(2)}`,
      // The full pricing shape, not just a display price — the exact lesson
      // from lib/magicOrderResolve.ts. A cart line is keyed by sku and needs
      // pricePerKg/weightKg/deposit; returning only `unitPrice` would leave
      // the suggestion card able to SHOW the product but unable to add it
      // correctly, and a missing deposit would quietly understate the cart by
      // the per-cylinder deposit that placeOrder then charges anyway.
      pricePerKg: match.pricePerKg,
      weightKg: match.weightKg,
      deposit: match.cylinderDeposit == null ? 0 : Number(match.cylinderDeposit),
      reason,
    };
  },
});

export async function POST(request: Request) {
  let messages: UIMessage[];
  try {
    ({ messages } = await request.json());
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("[RAG] OPENAI_API_KEY is not set.");
    return Response.json({ error: "The assistant is not configured." }, { status: 500 });
  }

  // The latest user turn is what gets embedded. Retrieval on the whole
  // transcript would drag every earlier topic into the search and steadily
  // blur the results as the conversation grows.
  const latest = [...messages].reverse().find((m) => m.role === "user");
  const question = (latest?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim()
    .slice(0, 1000);

  let context: string | null = null;
  let sources: Array<{ id: string; distance: number; metadata: unknown }> = [];

  if (question.length >= 3) {
    try {
      const chunks = await retrieveForQuestion(question);
      context = formatContext(chunks);
      sources = chunks.map((c) => ({ id: c.id, distance: c.distance, metadata: c.metadata }));
    } catch (error) {
      // A retrieval failure must not become a confidently-unsourced answer.
      // With no context the prompt below tells the model to decline, which is
      // the correct behaviour for a knowledge-base assistant that has lost
      // its knowledge base.
      console.error("[RAG] retrieval failed:", error);
    }
  }

  const grounded = context
    ? `CONTEXT:\n${context}\n\nQUESTION: ${question}`
    : `CONTEXT: (no relevant entries were found in the knowledge base)\n\nQUESTION: ${question}`;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    // The retrieved context replaces the final user turn rather than being
    // prepended as another message, so the model cannot mistake it for
    // something the user asserted.
    messages: [
      ...(await convertToModelMessages(messages.slice(0, -1))),
      { role: "user" as const, content: grounded },
    ],
    tools: { suggestProduct },
    // The v6 equivalent of maxSteps: 2 — one step to call the tool, one to
    // write the answer using its result. (`maxSteps` was the v4 API; in
    // ai@6 the default is stepCountIs(1), which would stop right after the
    // tool call and never produce prose.)
    stopWhen: stepCountIs(2),
    onError: ({ error }) => console.error("[RAG] stream error:", error),
  });

  return result.toUIMessageStreamResponse({
    // Lets the UI show what the answer was grounded in.
    messageMetadata: () => ({ sources }),
  });
}
