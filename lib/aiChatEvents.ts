// Lets any component (e.g. the Home page's "Try Now" teaser, or the desktop
// AI charge calculator tile) open the global AIChatWidget without needing a
// shared context — the widget just subscribes to this window event.
export const OPEN_AI_CHAT_EVENT = "halocore:open-ai-chat";

export interface OpenAiChatDetail {
  /** When present, the widget sends this text immediately on open instead of just idling on the input. */
  prefillText?: string;
}

export function openAiChat(prefillText?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<OpenAiChatDetail>(OPEN_AI_CHAT_EVENT, { detail: { prefillText } }));
  }
}
