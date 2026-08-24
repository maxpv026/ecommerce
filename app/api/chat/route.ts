import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import prisma from "@/lib/prisma";

// This Next.js version has deprecated the Edge runtime (`runtime = "edge"`
// is now a build error) — every route runs on Node.js, so no runtime/Node
// split is needed here (unlike the auth.config.ts/auth.ts middleware split).
export const maxDuration = 30;

const BASE_SYSTEM_PROMPT = `You are My Energy AI, an elite B2B assistant for HVAC professionals. Your primary job is to help technicians calculate precise refrigerant charges based on system specs (line length, temperatures, tonnage), explain F-Gas Regulation compliance, and recommend products. Keep answers highly technical, concise, and professional.

You also have these capabilities:
- Diagnostic support: decipher HVAC fault/error codes from major manufacturers (e.g. Daikin "U4", Mitsubishi "E6", Carrier, Trane, LG) — explain the likely fault and the next diagnostic step.
- Live inventory & pricing lookups: use the checkInventoryAndPrices tool whenever a user asks about stock, price, weight, or availability of a refrigerant or SKU. Never guess or invent a price, stock status, or quantity — only state what the tool returns. This catalog tracks stock as in-stock/out-of-stock, not exact cylinder counts, so never state a specific quantity on hand.
- Substitute finder: if a requested refrigerant is out of stock or phased out (e.g. R-22), use your HVAC domain knowledge to identify the nearest compatible drop-in replacement (e.g. R-22 → R-407C or R-422B), then call checkInventoryAndPrices again on that substitute to confirm it's actually in our catalog and in stock before recommending it. If the substitute isn't in our catalog either, say so plainly instead of guessing.`;

const checkInventoryAndPrices = tool({
  description:
    "Look up real-time price, stock status, GWP class, and cylinder weight for a refrigerant product in the My Energy catalog by product name, refrigerant type, or exact SKU. Always call this before answering any question about stock, price, or availability — never guess or use outside knowledge for these figures.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'Product name, refrigerant type, or SKU to search for, e.g. "R-410A", "R-32 Low GWP", or an exact SKU.'
      ),
  }),
  execute: async ({ query }) => {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { sku: { equals: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 5,
    });

    if (products.length === 0) {
      return {
        found: false as const,
        query,
        message: `No product matching "${query}" was found in the My Energy catalog.`,
      };
    }

    return {
      found: true as const,
      products: products.map((p) => ({
        sku: p.sku,
        name: p.name,
        price: Number(p.price),
        currency: "EUR",
        weight: p.weight,
        gwpClass: p.gwpClass,
        inStock: p.inStock,
      })),
    };
  },
});

export async function POST(req: Request) {
  const { messages, pathname }: { messages: UIMessage[]; pathname?: string } = await req.json();

  const system = pathname
    ? `${BASE_SYSTEM_PROMPT}\n\nThe user is currently viewing the ${pathname} page. Use this to offer contextual help relevant to that page when it's natural (e.g. offer to review their cart if they're on the cart page, or help with a specific product if they're on a product page) — don't force it into every reply.`
    : BASE_SYSTEM_PROMPT;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system,
    messages: await convertToModelMessages(messages),
    tools: { checkInventoryAndPrices },
    // Allows the model to call a tool and then use its result to write the
    // final reply (default stopWhen is stepCountIs(1), which would stop
    // right after the tool call and never produce an answer).
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
