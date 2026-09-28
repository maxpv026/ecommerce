import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { SDS_DOCUMENTS } from "@/lib/sds";

/**
 * The SDS page's per-refrigerant safety assistant.
 *
 * Deliberately separate from /api/chat: that assistant sells — it has
 * catalog tools, quotes prices and recommends substitutes. This one answers
 * safety questions about one gas and nothing else, with no tools at all, so
 * there is no path by which a question about first aid comes back with an
 * upsell.
 *
 * The gas name is not taken on trust: it is matched against the SDS catalog
 * before it reaches the prompt, so a crafted request can't rewrite the
 * assistant's subject.
 */

export const maxDuration = 30;

const systemPromptFor = (gas: string) =>
  `You are an expert HVAC Safety Assistant. The user is asking about the refrigerant ${gas}. Provide short, highly accurate, safety-focused answers based on standard SDS (Safety Data Sheet) knowledge. Focus on first aid, flammability, and handling. Warn the user to always consult the official PDF.

Additional rules:
- Answer only about ${gas} and general refrigerant safety. If asked about anything else — pricing, availability, ordering, unrelated topics — say that this assistant only covers safety for ${gas} and point them at the main assistant or their account manager.
- Be concise: a few short sentences or a tight bulleted list. A technician may be reading this at a job site.
- If a question implies an active emergency (exposure, frostbite, inhalation, a leak in a confined space), lead with the immediate action, then say to call emergency services — NCEC +44 1865 407 333 in Europe, or 112 for anything life-threatening.
- Never invent figures. Exposure limits, flash points, autoignition and boiling temperatures, pressures and concentrations vary between suppliers and revisions — if you are not certain a number matches THIS product's current SDS, describe the hazard qualitatively and send the user to the PDF for the value rather than quoting one.
- Close every substantive answer by reminding the user that the official SDS PDF is the controlled document and takes precedence over anything you say.`;

/** The gas must be one this page actually publishes an SDS for. */
function resolveGas(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return null;
  const match = SDS_DOCUMENTS.find(
    (doc) => doc.gas.toLowerCase() === wanted || doc.name.toLowerCase() === wanted
  );
  return match?.gas ?? null;
}

export async function POST(req: Request) {
  let body: { messages?: UIMessage[]; gas?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const gas = resolveGas(body.gas);
  if (!gas) {
    return Response.json({ error: "Unknown refrigerant" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
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
    system: systemPromptFor(gas),
    messages: await convertToModelMessages(body.messages),
  });

  return result.toUIMessageStreamResponse();
}
