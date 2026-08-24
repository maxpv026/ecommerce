"use server";

import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";

const AuditInput = z
  .array(z.object({ sku: z.string().min(1).max(64), qty: z.number().int().min(1).max(99) }))
  .min(1)
  .max(40);

const AuditSchema = z.object({
  verdict: z.enum(["compliant", "optimisable"]),
  findings: z
    .array(
      z.object({
        tone: z.enum(["ok", "warn"]),
        text: z.string().max(160).describe("One finding sentence about this order's F-Gas / safety / fit status."),
      })
    )
    .min(1)
    .max(4),
  suggestions: z
    .array(
      z.object({
        sku: z.string().describe("A catalog SKU not already in the cart."),
        reason: z.string().max(120).describe("Why this order needs it, tied to a specific cart line."),
      })
    )
    .max(3)
    .describe("Genuinely required or strongly recommended additions only. Empty when the order is complete."),
});

export interface CartAuditSuggestion {
  sku: string;
  reason: string;
}

export type CartAuditResult =
  | {
      ok: true;
      verdict: "compliant" | "optimisable";
      findings: Array<{ tone: "ok" | "warn"; text: string }>;
      suggestions: CartAuditSuggestion[];
    }
  | { ok: false; code: "INVALID_INPUT" | "UNAVAILABLE" };

/**
 * Real AI compliance + compatibility audit over the live cart. Judges the
 * actual lines against F-Gas handling rules and flags catalog products the
 * order genuinely needs. Failures degrade to UNAVAILABLE — the UI never
 * shows an invented verdict.
 */
export async function auditCart(rawLines: Array<{ sku: string; qty: number }>): Promise<CartAuditResult> {
  const parsed = AuditInput.safeParse(rawLines);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    const catalog = await prisma.product.findMany();
    const bySku = new Map(catalog.map((p) => [p.sku, p]));
    const lines = parsed.data.filter((l) => bySku.has(l.sku));
    if (lines.length === 0) return { ok: false, code: "INVALID_INPUT" };

    // The signed-in buyer's certificate grounds the compliance wording.
    const session = await auth();
    const cert = session?.user?.email
      ? await prisma.certificate
          .findFirst({ where: { user: { email: session.user.email } } })
          .catch(() => null)
      : null;

    const describe = (sku: string) => {
      const p = bySku.get(sku)!;
      return `${p.sku}: ${p.name} · category ${p.category} · ${p.weight} · safety ${p.gwpClass}` +
        (p.gwp ? ` · GWP ${p.gwp}` : "") + ` · €${p.price}`;
    };

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: AuditSchema,
      prompt: `You audit a B2B refrigerant order for EU F-Gas compliance and on-site compatibility.

Order lines:
${lines.map((l) => `- qty ${l.qty} × ${describe(l.sku)}`).join("\n")}

Buyer certificate: ${cert ? `${cert.certType} (${cert.certId})` : "not on file — verified at checkout"}.

Full catalog (for suggestions):
${catalog.map((p) => `- ${describe(p.sku)}`).join("\n")}

Review the order: A2L handling (ventilated storage, leak detection, safety seals), ADR mixed-class consignment rules, oil/fitting compatibility between refrigerants and any equipment lines, and whether the combined charge is plausible for one certified buyer. Report 2-4 short findings ("ok" for cleared checks, "warn" for genuine cautions). If the catalog contains items this order genuinely needs (safety or fit driven, not upsell), return them as suggestions with a reason tied to a specific line and verdict "optimisable"; otherwise verdict "compliant" with no suggestions. Only use catalog SKUs not already in the order.`,
    });

    const inCart = new Set(lines.map((l) => l.sku));
    const suggestions = object.suggestions
      .filter((s) => bySku.has(s.sku) && !inCart.has(s.sku))
      .slice(0, 3);
    // A verdict promising additions with none surviving validation is a
    // compliant order as far as the UI is concerned.
    const verdict = suggestions.length > 0 ? object.verdict : "compliant";

    return { ok: true, verdict, findings: object.findings, suggestions };
  } catch (error) {
    console.error("auditCart failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
