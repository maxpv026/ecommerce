import type { UIMessageChunk } from "ai";

/**
 * The budget for one model call, retries included. Every AI call passes this
 * as `abortSignal`, so an OpenAI stall (or a request queued behind a rate
 * limit) ends as a clean error the caller already handles — never a
 * serverless function hanging until the platform kills it.
 */
export const AI_CALL_TIMEOUT_MS = 25_000;

export const aiTimeout = (ms: number = AI_CALL_TIMEOUT_MS) => AbortSignal.timeout(ms);

/**
 * streamText's `timeout` for the chat routes (maxDuration 30 s): the whole
 * answer within 20 s and no 10 s silence once it has started — leaving room
 * for the history load, and for chat-fgas's 5 s retrieval (lib/rag) before it.
 */
export const CHAT_STREAM_TIMEOUT = { totalMs: 20_000, chunkMs: 10_000 } as const;

/** The stable code every chat client maps to its own "assistant unavailable" notice. */
export const ASSISTANT_UNAVAILABLE = "ASSISTANT_UNAVAILABLE";

/**
 * streamText ends a timed-out stream with an `abort` chunk, which useChat
 * treats as a normal finish — the user would be left with an empty bubble.
 * The chat routes never forward the client's own abort signal, so on them an
 * abort can only be the timeout: report it as the same error a provider
 * failure produces.
 */
export function timeoutAsUnavailable(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        controller.enqueue(chunk.type === "abort" ? { type: "error", errorText: ASSISTANT_UNAVAILABLE } : chunk);
      },
    })
  );
}
