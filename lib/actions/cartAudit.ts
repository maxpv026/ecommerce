"use server";

import { z } from "zod";
import { generateText, Output } from "ai";
import { aiTimeout } from "@/lib/aiTimeout";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import { PUBLIC_AI_RULE, withinActionLimit } from "@/lib/actionRateLimit";
import { auth } from "@/auth";
import { LISTED } from "@/lib/productFamily";
import { withAiCache } from "@/lib/ai/cache";
import { MAX_OUTPUT, logAiUsage, model, usageOf } from "@/lib/ai/budget";

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
        text: z.string().max(160).describe("One sentence."),
      })
    )
    .min(1)
    .max(4),
  suggestions: z
    .array(
      z.object({
        sku: z.string().describe("An addable item's SKU."),
        reason: z.string().max(120).describe("Why, tied to a cart line."),
      })
    )
    .max(3)
    .describe("Required additions only; empty if complete."),
});

const AUDIT_SYSTEM = `Audit a B2B refrigerant order for EU F-Gas compliance and on-site compatibility: A2L handling (ventilation, leak detection, seals), ADR mixed-class rules, oil/fitting compatibility, plausible total charge for one certified buyer.
Give 2-4 short findings ("ok" = cleared, "warn" = genuine caution). Suggest only addable items this order genuinely needs for safety or fit (not upsell), each tied to a line → verdict "optimisable"; otherwise "compliant" with no suggestions.`;

/** Bump when AUDIT_SYSTEM or AuditSchema changes. */
const CACHE_VERSION = 1;

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
  // Callable without signing in, and each call is a paid model request.
  if (!(await withinActionLimit("cartAudit", PUBLIC_AI_RULE))) return { ok: false, code: "UNAVAILABLE" };

  try {
    const catalog = await prisma.product.findMany({ where: LISTED });
    const bySku = new Map(catalog.map((p) => [p.sku, p]));
    const lines = parsed.data.filter((l) => bySku.has(l.sku));
    if (lines.length === 0) return { ok: false, code: "INVALID_INPUT" };

    // The signed-in buyer's certificate grounds the compliance wording.
    const session = await auth();
    const cert = session?.user?.email
      ? await prisma.certificate
          .findFirst({ where: { user: { email: session.user.email } }, select: { certType: true } })
          .catch(() => null)
      : null;

    // What the audit judges: the order lines, compactly. Prices play no part
    // in a compliance check, so they aren't sent.
    const describe = (sku: string) => {
      const p = bySku.get(sku)!;
      return `${p.sku}: ${p.name}, ${p.category}, ${p.weight}, class ${p.gwpClass}${p.gwp ? `, GWP ${p.gwp}` : ""}`;
    };
    // What it may suggest: equipment and recovery items not already in the
    // cart — never the whole catalog (a gas is never a "required addition").
    const inCartSkus = new Set(lines.map((l) => l.sku));
    const candidates = catalog
      .filter((p) => (p.category === "equipment" || p.category === "recovery") && !inCartSkus.has(p.sku))
      .map((p) => `${p.sku}: ${p.name}`)
      .sort();
    const certLine = cert ? `${cert.certType} on file` : "none on file (checked at checkout)";
    const orderLines = [...lines].sort((x, y) => x.sku.localeCompare(y.sku)).map((l) => `${l.qty}× ${describe(l.sku)}`);

    const llm = model(process.env.CART_AUDIT_MODEL);
    const { value: object } = await withAiCache<z.infer<typeof AuditSchema>>(
      { feature: "cart-audit", version: CACHE_VERSION, parts: [llm, orderLines, certLine, candidates], ttlSeconds: 86_400 },
      async () => {
        const result = await generateText({
          model: openai(llm),
          output: Output.object({ schema: AuditSchema }),
          abortSignal: aiTimeout(),
          maxOutputTokens: MAX_OUTPUT.cartAudit,
          temperature: 0,
          system: AUDIT_SYSTEM,
          prompt: `Order:\n${orderLines.join("\n")}\nBuyer F-Gas certificate: ${certLine}\nAddable items:\n${candidates.join("\n") || "none"}`,
        });
        logAiUsage({ feature: "cart-audit", model: llm, source: "model", ...usageOf(result) });
        return { value: result.output, cacheable: true };
      }
    );

    const suggestions = object.suggestions
      .filter((s) => bySku.has(s.sku) && !inCartSkus.has(s.sku))
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
