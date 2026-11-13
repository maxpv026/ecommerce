import "server-only";

/**
 * Model and token budget for every OpenAI call in the app — one place to read
 * and change what each feature costs.
 *
 * Text: gpt-4o-mini by default (≈16× cheaper than gpt-4o per token). A
 * feature's own env override (SMART_ORDER_MODEL, COMPAT_MODEL, …) still wins,
 * then AI_TEXT_MODEL for the whole app.
 *
 * Vision is the exception, on purpose: gpt-4o-mini bills an image at
 * 2,833 + 5,667 tokens per 512 px tile, against 85 + 170 for gpt-4o — priced
 * to cost about the same in money, but ~33× the tokens. So the certificate
 * reader defaults to gpt-4o (fewer tokens, same or lower cost) and keeps
 * FGAS_VISION_MODEL as the override.
 *
 * Output caps (`maxOutputTokens`) are per call and sized to the schema each
 * feature returns, with headroom — a JSON extraction never needs 4,000.
 */

export const TEXT_MODEL = process.env.AI_TEXT_MODEL?.trim() || "gpt-4o-mini";

export const model = (override: string | undefined) => override?.trim() || TEXT_MODEL;

/** Vision default — see the header for why it isn't the mini model. */
export const VISION_MODEL = process.env.FGAS_VISION_MODEL?.trim() || "gpt-4o";

export const MAX_OUTPUT = {
  chargeExtraction: 300,
  smartOrderLine: 160, // per unparsed line, capped below
  smartOrderMax: 1500,
  cartAudit: 450,
  fgasReading: 900,
  compatibility: 450,
  broadcastDraft: 900,
  smartMatch: 250,
  homeAssistant: 120,
  recommendations: 120,
  localization: 1200,
  pdfText: 2000,
} as const;

/**
 * One structured log line per model call — the FinOps trail: feature, model,
 * tokens in/out, and whether it was served from the cache or the
 * deterministic fast path (0 tokens). Grep Vercel logs for "[ai-usage]".
 */
export function logAiUsage(entry: {
  feature: string;
  model?: string;
  source: "model" | "cache" | "fast-path";
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}) {
  console.info(
    `[ai-usage] ${JSON.stringify({
      feature: entry.feature,
      source: entry.source,
      ...(entry.model ? { model: entry.model } : {}),
      in: entry.inputTokens ?? 0,
      out: entry.outputTokens ?? 0,
      ...(entry.cachedInputTokens ? { cachedIn: entry.cachedInputTokens } : {}),
    })}`
  );
}

/** AI SDK usage → our log fields. */
export function usageOf(result: { usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number } }) {
  return {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    cachedInputTokens: result.usage?.cachedInputTokens ?? 0,
  };
}
