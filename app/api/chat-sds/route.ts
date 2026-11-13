import { convertToModelMessages, createUIMessageStreamResponse, streamText } from "ai";
import { ASSISTANT_UNAVAILABLE, CHAT_STREAM_TIMEOUT, timeoutAsUnavailable } from "@/lib/aiTimeout";
import { openai } from "@ai-sdk/openai";
import { logAiUsage } from "@/lib/ai/budget";
import { boundTranscript } from "@/lib/aiMessages";
import { GAS_SAFETY } from "@/lib/sdsLibrary";
import { normalizeMark } from "@/lib/gasMarks";
import { routing } from "@/i18n/routing";

/**
 * The SDS page's per-refrigerant safety assistant.
 *
 * Deliberately separate from /api/chat: that assistant sells — it has
 * catalog tools, quotes prices and recommends substitutes. This one answers
 * safety questions about one gas and nothing else, with no tools at all, so
 * there is no path by which a question about first aid comes back with an
 * upsell.
 *
 * The gas name is not taken on trust: it is matched against the SDS
 * library (lib/sdsLibrary) before it reaches the prompt, so a crafted
 * request can't rewrite the assistant's subject. Same for the language: only
 * a locale the site serves is named in the prompt.
 */

export const maxDuration = 30;

/** The emergency line printed on the sheets (SDS §1.4); none configured → 112 alone. */
const emergencyLine = () => {
  const phone = process.env.SDS_EMERGENCY_PHONE?.trim();
  return phone ? `our 24-hour emergency line ${phone}, or 112 for anything life-threatening` : "112";
};

const systemPromptFor = (gas: string, language: string) =>
  `You are an expert HVAC Safety Assistant. The user is asking about the refrigerant ${gas}. Provide short, highly accurate, safety-focused answers based on standard SDS (Safety Data Sheet) knowledge. Focus on first aid, flammability, and handling. Warn the user to always consult the official PDF.

Additional rules:
- Answer only about ${gas} and general refrigerant safety. If asked about anything else — pricing, availability, ordering, unrelated topics — say that this assistant only covers safety for ${gas} and point them at the main assistant or their account manager.
- Be concise: a few short sentences or a tight bulleted list. A technician may be reading this at a job site.
- If a question implies an active emergency (exposure, frostbite, inhalation, a leak in a confined space), lead with the immediate action, then say to call emergency services — ${emergencyLine()}.
- Never invent figures. Exposure limits, flash points, autoignition and boiling temperatures, pressures and concentrations vary between suppliers and revisions — if you are not certain a number matches THIS product's current SDS, describe the hazard qualitatively and send the user to the PDF for the value rather than quoting one.
- Close every substantive answer by reminding the user that the official SDS PDF is the controlled document and takes precedence over anything you say.
- Reply in ${language}, whatever language the question is in, unless the user explicitly asks for another one. Keep UN numbers, H/P codes and refrigerant designations as written.`;

/** The gas must be one the SDS page lists. */
function resolveGas(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const wanted = normalizeMark(raw.trim());
  if (!wanted) return null;
  return GAS_SAFETY.find((g) => normalizeMark(g.key) === wanted || normalizeMark(g.label) === wanted)?.label ?? null;
}

/** "uk" → "Ukrainian"; an unknown or missing locale → English. */
function languageFor(raw: unknown): string {
  const locale = typeof raw === "string" && (routing.locales as readonly string[]).includes(raw) ? raw : "en";
  return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? "English";
}

export async function POST(req: Request) {
  let body: { messages?: unknown; gas?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const gas = resolveGas(body.gas);
  if (!gas) {
    return Response.json({ error: "Unknown refrigerant" }, { status: 400 });
  }
  // The transcript is the client's: bounded in size and reduced to user /
  // assistant text before it is billed (lib/aiMessages).
  const messages = boundTranscript(body.messages);
  if (!messages) {
    return Response.json({ error: "No messages" }, { status: 400 });
  }

  // Same contract as every other AI surface here: no key means a loud 500,
  // never a fabricated safety answer.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      { error: "AI_UNCONFIGURED", detail: "OPENAI_API_KEY is not set. Add it to .env.local." },
      { status: 500 }
    );
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPromptFor(gas, languageFor(body.locale)),
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 700,
    timeout: CHAT_STREAM_TIMEOUT,
    // FinOps trail: every turn's tokens, all steps (tool call + answer) together.
    onFinish: ({ totalUsage }) => logAiUsage({ feature: "chat-sds", model: "gpt-4o-mini", source: "model", inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens, cachedInputTokens: totalUsage.cachedInputTokens }),
    onError: ({ error }) => console.error("[chat-sds] stream error:", error),
    onAbort: () => console.error("[chat-sds] stream timed out"),
  });

  // A stable code to the browser, never the provider's raw message; the modal
  // shows its own localized "unavailable — open the PDF / call the emergency line" notice.
  return createUIMessageStreamResponse({ stream: timeoutAsUnavailable(result.toUIMessageStream({ onError: () => ASSISTANT_UNAVAILABLE })) });
}
