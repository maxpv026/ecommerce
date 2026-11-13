// Lets any component (e.g. the Home page's "Try Now" teaser, or the desktop
// AI charge calculator tile) open the global AIChatWidget without needing a
// shared context — the widget just subscribes to this window event.
export const OPEN_AI_CHAT_EVENT = "halocore:open-ai-chat";

export interface OpenAiChatDetail {
  /** When present, the widget sends this text immediately on open instead of just idling on the input. */
  prefillText?: string;
}

/**
 * The widget is loaded lazily (AIChatWidgetMount → next/dynamic), so a tap
 * in the first moments after page load can fire the event before anything
 * listens. The request is therefore also parked here, and the widget picks it
 * up when it mounts (takePendingAiChat) — the tap is never silently lost.
 */
let pending: { detail: OpenAiChatDetail; at: number } | null = null;
/** A parked request only counts while the page that made it is still loading. */
const PENDING_TTL_MS = 10_000;

export function openAiChat(prefillText?: string) {
  if (typeof window !== "undefined") {
    pending = { detail: { prefillText }, at: Date.now() };
    window.dispatchEvent(new CustomEvent<OpenAiChatDetail>(OPEN_AI_CHAT_EVENT, { detail: { prefillText } }));
  }
}

/** The open request made before the widget was listening, once. */
export function takePendingAiChat(): OpenAiChatDetail | null {
  const p = pending;
  pending = null;
  return p && Date.now() - p.at < PENDING_TTL_MS ? p.detail : null;
}

/**
 * Routes where the AI assistant launcher appears.
 *
 * Lives here, apart from the widget, on purpose: AIChatWidgetMount has to
 * consult this list *before* deciding whether to load the widget, and
 * importing it from AIChatWidget would pull that module — and with it the AI
 * SDK and chat transport — into every page's bundle. That is not a
 * hypothetical: the first attempt did exactly that, and `DefaultChatTransport`
 * was measurably still in the JavaScript served for the terms-of-service page.
 *
 * Exact matches, not prefixes — deliberately. Detail and flow routes
 * (/products/[id], /checkout, /profile/*) own the bottom of the screen with
 * their own sticky action bars, and a floating launcher sitting on top of a
 * "Place Order" button is how you lose a sale.
 *
 * The compliance pages are here because the F-Gas Consultant tab is a
 * compliance tool: that is where someone is already reading about regulation
 * and most likely to ask something the knowledge base can actually answer.
 * Both leaves are listed rather than the parent — /compliance itself only
 * redirects to /compliance/sds, so an entry for it would never match.
 *
 * And why this is not simply every route: the launcher is a floating button
 * pinned bottom-right, and several routes own the bottom of the screen with
 * their own fixed action bar — /cart (total + checkout), /checkout (Place
 * Order), /products/[id] (Add to Cart), the /profile/settings forms (Save).
 * A launcher floating over one of those is not a cosmetic problem: a mis-tap
 * on a payment CTA is the exact failure this codebase already measured and
 * fixed once, on the mobile cart. So "global" means every route where the
 * button has somewhere safe to sit, not literally all of them.
 */
export const ASSISTANT_VISIBLE_PATHS = [
  "/",
  "/products",
  "/categories",
  // The market hub: someone reading a quota phase-down insight is one tap from
  // "does this apply to my R-404A chillers?", which is exactly the question
  // the knowledge base answers. Its bottom edge is free — the page ends in a
  // chart, not a fixed action bar.
  "/hub",
  "/compliance/sds",
  "/compliance/certifications",
  // The carbon record and the certificate/SDS page are where a technician is
  // already reading F-Gas figures, so they are the likeliest place for a
  // question the knowledge base can answer.
  "/profile/compliance",
  // The phone help screen: its "chat with support" button opens this widget.
  "/profile/support",
];

