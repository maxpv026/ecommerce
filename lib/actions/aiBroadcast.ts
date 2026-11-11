"use server";

import { z } from "zod";
import { generateText, Output } from "ai";
import { aiTimeout } from "@/lib/aiTimeout";
import { openai } from "@ai-sdk/openai";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/fgasReview";

/**
 * AI first draft for an admin regulatory broadcast.
 *
 * The hazard this guards against is the model inventing a fact: a quota
 * percentage, a deadline, an article number, a GWP value. In a regulatory
 * notice to every opted-in customer, an invented figure that looks right is
 * the worst possible output — so the draft is not trusted on the model's say
 * so:
 *
 *  1. The prompt forbids figures, dates and article references that are not
 *     in the admin's instruction, and asks for a visible
 *     `[CONFIRM: …]` placeholder wherever one is needed instead.
 *  2. On the way out, every number in the draft that does not appear in the
 *     instruction (or in the short list of regulation identifiers below) is
 *     flagged for the admin, whatever the model claims.
 *  3. The broadcast action refuses to send while any `[CONFIRM` placeholder
 *     is left (lib/actions/broadcast).
 *
 * Model: the project's OpenAI setup (OPENAI_API_KEY, already used elsewhere);
 * override with BROADCAST_DRAFT_MODEL.
 */

const MODEL = process.env.BROADCAST_DRAFT_MODEL?.trim() || "gpt-4o";

const Instruction = z.string().trim().min(10).max(1000);

const DraftSchema = z.object({
  subject: z.string().max(120).describe("Email subject. Factual, under 90 characters, no exclamation marks, no emoji."),
  content: z
    .string()
    .max(4000)
    .describe(
      "Plain-text body: 3 to 5 short paragraphs separated by one blank line. No greeting, no sign-off, no markdown, no links."
    ),
  toVerify: z
    .array(z.string().max(200))
    .max(8)
    .describe("Every factual claim in the draft that the sender must check against the regulation text before sending."),
});

/**
 * Regulation identifiers the draft may cite without the instruction naming
 * them — the instruments every F-Gas notice is built on. Anything else
 * numeric must come from the admin.
 */
const KNOWN_IDENTIFIERS = ["2024/573", "2015/2067", "517/2014", "1907/2006", "1272/2008"];

const SYSTEM = `You are a compliance officer at My Energy, an EU distributor of refrigerants (F-gases), drafting an informational regulatory update emailed to facility managers and HVAC/refrigeration businesses across Europe who opted in to receive such updates.

Tone: formal, concise, neutral, factual. British English. This is an information notice, not marketing: no sales language, no product promotion, no urgency or fear, no exclamation marks, no emoji, no calls to buy.

Fact discipline — the most important rule:
- Use ONLY the facts, figures, dates, percentages, deadlines, GWP values and article numbers that appear in the sender's instruction.
- If the update needs a specific fact the instruction does not give, do not supply it from memory. Write a placeholder in square brackets instead, e.g. [CONFIRM: percentage of the 2027 quota reduction] or [CONFIRM: date the measure applies].
- You may name Regulation (EU) 2024/573 (the EU F-Gas Regulation) and Commission Implementing Regulation (EU) 2015/2067 (personnel certification). Do not quote their articles or figures unless the instruction does.
- Never present guidance as legal advice.

Data protection: do not ask recipients for personal data, do not refer to any individual, and do not mention tracking.

Format: the email template already adds the greeting, a "not legal advice" note, the sender's details and the unsubscribe link — do not write any of those. Write only the subject and the body paragraphs. Structure the body as: what is changing; who it affects; from when; what readers should do (practical, non-commercial steps). End with one neutral sentence inviting questions to their usual My Energy contact.

List in toVerify every factual claim in your draft that the sender must confirm against the official text.`;

export type BroadcastDraftResult =
  | { ok: true; subject: string; content: string; toVerify: string[]; placeholders: number }
  | { ok: false; error: string };

/** Numbers, dates and "Article N" references in `text`, normalised for comparison. */
function factTokens(text: string): string[] {
  const tokens = text.match(/\b(?:Article|Art\.)\s*\d+[a-z]?\b|\d+(?:[.,/]\d+)*\s?%?/gi) ?? [];
  return [...new Set(tokens.map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => /\d/.test(t)))];
}

export async function generateBroadcastDraft(instruction: unknown): Promise<BroadcastDraftResult> {
  const session = await auth();
  const check = await requireAdmin(session?.user?.id);
  if (!check.ok) return { ok: false, error: "Not authorised." };

  const parsed = Instruction.safeParse(instruction);
  if (!parsed.success) return { ok: false, error: "Describe the update in 10 to 1,000 characters." };
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: "AI drafting isn't configured (OPENAI_API_KEY is not set)." };

  try {
    const { output: object } = await generateText({
      model: openai(MODEL),
      output: Output.object({ schema: DraftSchema }),
      abortSignal: aiTimeout(),
      system: SYSTEM,
      prompt: `Sender's instruction:\n"""\n${parsed.data}\n"""`,
      temperature: 0.3,
    });

    const subject = object.subject.replace(/[\r\n]+/g, " ").trim();
    const content = object.content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!subject || content.length < 20) return { ok: false, error: "The draft came back empty. Try rephrasing the instruction." };

    // The guard that doesn't depend on the model obeying: any figure in the
    // draft that the admin didn't supply is listed for checking.
    const given = parsed.data.toLowerCase();
    const unsourced = factTokens(`${subject}\n${content}`).filter((token) => {
      const t = token.toLowerCase();
      return !given.includes(t) && !KNOWN_IDENTIFIERS.some((id) => t.includes(id));
    });

    const toVerify = [
      ...unsourced.map((t) => `"${t}" wasn't in your instruction — confirm it against the official text or remove it.`),
      ...object.toVerify,
    ].slice(0, 12);

    const placeholders = (`${subject}\n${content}`.match(/\[CONFIRM/gi) ?? []).length;
    return { ok: true, subject, content, toVerify, placeholders };
  } catch (error) {
    console.error("[ai-broadcast] draft failed:", error);
    return { ok: false, error: "The AI service didn't respond. Try again in a moment." };
  }
}
