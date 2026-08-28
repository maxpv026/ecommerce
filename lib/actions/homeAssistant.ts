"use server";

import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";

const QueryInput = z.string().trim().min(2).max(280);

export type HomeAssistantResult =
  | { ok: true; answer: string }
  | { ok: false; code: "INVALID_INPUT" | "UNAVAILABLE" };

/**
 * Compact real-AI answer for the mobile home "Ask My Energy AI" hub.
 * Grounded in the live catalog and the signed-in buyer's order history;
 * failures degrade to UNAVAILABLE — never a canned reply.
 */
export async function askHomeAssistant(rawQuery: string): Promise<HomeAssistantResult> {
  const parsed = QueryInput.safeParse(rawQuery);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    const [catalog, session] = await Promise.all([prisma.product.findMany(), auth()]);
    const orders = session?.user?.id
      ? await prisma.order.findMany({
          where: { userId: session.user.id },
          include: { items: { include: { product: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [];

    const catalogList = catalog
      .map(
        (p) =>
          `- ${p.sku}: ${p.name} · ${p.category} · ${p.weight} · ${p.gwpClass}` +
          (p.gwp ? ` · GWP ${p.gwp}` : "") + ` · €${p.price} · stock ${p.stock}`
      )
      .join("\n");
    const orderList = orders
      .map((o) => `- ${o.orderNumber} (${o.status}): ${o.items.map((i) => `${i.quantity}× ${i.product.name}`).join(", ")}`)
      .join("\n");

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `You are My Energy AI, a B2B assistant for HVAC professionals. Answer the question below in AT MOST 40 words, plain text, no markdown. Be concrete and technical. Ground every stock/price claim in the catalog; never invent quantities or prices.

Catalog:
${catalogList}

${orderList ? `Customer's recent orders:\n${orderList}\n` : "Customer is not signed in — do not reference personal orders.\n"}
Question: "${parsed.data}"`,
    });

    const answer = text.trim();
    if (!answer) return { ok: false, code: "UNAVAILABLE" };
    return { ok: true, answer };
  } catch (error) {
    console.error("askHomeAssistant failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
