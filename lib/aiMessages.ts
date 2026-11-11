import "server-only";

import type { UIMessage } from "ai";
import { z } from "zod";

/**
 * Bounds a client-supplied chat transcript before it reaches a model.
 *
 * /api/chat-sds and /api/chat-fgas are stateless: the browser sends the whole
 * conversation on every turn. Taken as-is, that body is attacker-controlled
 * in size (a 5 MB "message" is billed by the token) and in shape (a forged
 * `system` turn, or tool parts the server never produced). This keeps only
 * what the assistants need — user and assistant TEXT, the most recent turns,
 * under a total character budget — and drops everything else.
 *
 * Returns null when nothing usable remains or the last turn isn't the user's.
 */

const Part = z.object({ type: z.string(), text: z.unknown().optional() }).passthrough();
const Message = z.object({ id: z.unknown().optional(), role: z.string(), parts: z.array(Part).max(50) }).passthrough();
const Transcript = z.array(Message).min(1).max(200);

export interface TranscriptLimits {
  /** Most recent messages kept. */
  maxMessages: number;
  /** Per-message text cap, in characters. */
  maxMessageChars: number;
  /** Cap across everything kept, in characters (the newest win). */
  maxTotalChars: number;
}

export const DEFAULT_TRANSCRIPT_LIMITS: TranscriptLimits = { maxMessages: 12, maxMessageChars: 2000, maxTotalChars: 12_000 };

export function boundTranscript(raw: unknown, limits: TranscriptLimits = DEFAULT_TRANSCRIPT_LIMITS): UIMessage[] | null {
  const parsed = Transcript.safeParse(raw);
  if (!parsed.success) return null;

  const cleaned: UIMessage[] = [];
  for (const [i, m] of parsed.data.entries()) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("")
      .trim()
      .slice(0, limits.maxMessageChars);
    if (!text) continue;
    cleaned.push({ id: typeof m.id === "string" ? m.id.slice(0, 100) : `m${i}`, role: m.role, parts: [{ type: "text", text }] });
  }

  const kept: UIMessage[] = [];
  let budget = limits.maxTotalChars;
  for (const m of cleaned.slice(-limits.maxMessages).reverse()) {
    const length = (m.parts[0] as { text: string }).text.length;
    if (length > budget) break;
    budget -= length;
    kept.unshift(m);
  }

  if (kept.length === 0 || kept[kept.length - 1]!.role !== "user") return null;
  return kept;
}
