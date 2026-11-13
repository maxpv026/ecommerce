"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Bot, Send, Sparkles, UserRound, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ASSISTANT_VISIBLE_PATHS, OPEN_AI_CHAT_EVENT, takePendingAiChat, type OpenAiChatDetail } from "@/lib/aiChatEvents";
import { useCartStore } from "@/lib/store/cart";
import { isPurchasable } from "@/lib/waitlist";
import type { StoreProduct } from "@/lib/data";
import type { SupportUIMessage } from "@/lib/chatSession";
import SupportMessage from "./ai/SupportMessage";
import StockNotifyModal from "./StockNotifyModal";

/** EXPIRED: deleted by the one-hour retention rule while this panel had it (lib/chatRetention). */
type ChatStatus = "AI_ACTIVE" | "ESCALATED_TO_HUMAN" | "RESOLVED" | "EXPIRED" | null;

/** How often to look for a team reply while the conversation is with a person. */
const POLL_OPEN_MS = 5_000;
const POLL_CLOSED_MS = 20_000;

/**
 * The F-Gas consultant is a second, separate assistant sharing this panel.
 *
 * Deliberately NOT merged with the general support chat: that one is chatty
 * and uses general knowledge, this one answers only from the vectorised
 * knowledge base and refuses everything else. One prompt cannot be both
 * without making the strict one leaky.
 *
 * Deferred again inside this already-deferred widget so its product cards and
 * tool-part rendering only download when someone actually opens the tab.
 */
const RagAssistant = dynamic(() => import("./ai/RagAssistant"), { ssr: false });

type Mode = "support" | "fgas";

const MODES: Array<{ id: Mode; label: string; Icon: typeof Bot }> = [
  { id: "support", label: "Support", Icon: Bot },
  { id: "fgas", label: "F-Gas Expert", Icon: Sparkles },
];

const QUICK_REPLY_KEYS = ["quick1", "quick2", "quick3"] as const;

/** Newest server timestamp in the list — the poll's cursor. */
const lastServerTime = (messages: SupportUIMessage[]) =>
  messages.reduce<string | null>((max, m) => (m.metadata?.createdAt && (!max || m.metadata.createdAt > max) ? m.metadata.createdAt : max), null);

export default function AIChatWidget() {
  const pathname = usePathname();
  const isVisible = ASSISTANT_VISIBLE_PATHS.includes(pathname);
  const fabOffset = "bottom-[120px] md:bottom-6";
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("support");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("SupportChat");
  // Only the newest message goes to the server; the conversation itself
  // lives in the database (lib/chatSession), which is also where team
  // replies appear.
  const [transport] = useState(
    () =>
      new DefaultChatTransport<SupportUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({ body: { message: messages[messages.length - 1], ...body } }),
      })
  );
  const { messages, setMessages, sendMessage, status, error: streamError } = useChat<SupportUIMessage>({ transport });
  const isTyping = status === "submitted" || status === "streaming";
  const fgas = mode === "fgas";

  // ── Session state: restored from the server, polled while with a person ──
  const [chatStatus, setChatStatus] = useState<ChatStatus>(null);
  const [restored, setRestored] = useState(false);
  const [unread, setUnread] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const escalated = chatStatus === "ESCALATED_TO_HUMAN";

  // The handoff tool in a streamed reply moves the widget into "with the team".
  const lastMessage = messages[messages.length - 1];
  const streamedHandoff =
    lastMessage?.role === "assistant" && lastMessage.parts.some((p) => p.type === "tool-escalateToHuman" && p.state === "output-available");
  if (streamedHandoff && chatStatus !== "ESCALATED_TO_HUMAN" && chatStatus !== "RESOLVED") setChatStatus("ESCALATED_TO_HUMAN");

  // First open: bring back this browser's conversation (it survives page
  // changes and reloads — the widget remounts, the session doesn't).
  useEffect(() => {
    if (!isOpen || restored) return;
    let cancelled = false;
    fetch("/api/chat/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { status: ChatStatus; messages: SupportUIMessage[] }) => {
        if (cancelled) return;
        setRestored(true);
        setChatStatus(data.status === "RESOLVED" ? null : data.status);
        if (data.status !== "RESOLVED" && data.messages?.length) setMessages(data.messages);
      })
      .catch(() => setRestored(true));
    return () => {
      cancelled = true;
    };
  }, [isOpen, restored, setMessages]);

  // While a person has the conversation: look for their reply. Faster with
  // the panel open; slower (with an unread dot on the launcher) when closed.
  // The poll reads the latest list through a ref so the interval isn't torn
  // down and restarted on every streamed token.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    if (!escalated) return;
    const tick = async () => {
      if (document.visibilityState !== "visible" || isTyping) return;
      const cursor = lastServerTime(messagesRef.current);
      try {
        const res = await fetch(`/api/chat/session${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        const data = (await res.json()) as { status: ChatStatus; messages: SupportUIMessage[] };
        // The visitor's own messages are already on screen (under a local id).
        const known = new Set(messagesRef.current.map((m) => m.id));
        const fresh = (data.messages ?? []).filter((m) => m.metadata?.author !== "user" && !known.has(m.id));
        if (fresh.length) {
          setMessages([...messagesRef.current, ...fresh]);
          if (!isOpen) setUnread(true);
        }
        if (data.status === null) {
          // Gone: an hour without activity and the server deleted it. Clear
          // the copy on screen too — the transcript no longer exists anywhere.
          setMessages([]);
          setChatStatus("EXPIRED");
        } else if (data.status !== "ESCALATED_TO_HUMAN") setChatStatus(data.status);
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    };
    const id = window.setInterval(tick, isOpen ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => window.clearInterval(id);
  }, [escalated, isOpen, isTyping, setMessages]);

  const talkToPerson = async () => {
    if (escalating || escalated) return;
    setEscalating(true);
    try {
      const res = await fetch("/api/chat/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname }),
      });
      if (res.ok) {
        setChatStatus("ESCALATED_TO_HUMAN");
        const data = (await fetch("/api/chat/session", { cache: "no-store" }).then((r) => r.json())) as { messages: SupportUIMessage[] };
        if (data.messages?.length) setMessages(data.messages);
      }
    } finally {
      setEscalating(false);
    }
  };

  // ── Product cards inside the chat ──
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const cartSkus = useMemo(() => new Set(cartItems.map((i) => i.sku)), [cartItems]);
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);
  const addToCart = (product: StoreProduct) => {
    if (!isPurchasable(product)) return;
    addItem(
      { sku: product.sku, name: product.name, variant: product.weightLabel, pricePerKg: product.pricePerKg, weightKg: product.weightKg, deposit: product.cylinderDeposit },
      1
    );
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setDraft("");
      // After the team closed it (or it expired), the server starts a fresh session.
      if (chatStatus === "RESOLVED" || chatStatus === "EXPIRED") setChatStatus("AI_ACTIVE");
      sendMessage({ text: trimmed }, { body: { pathname } });
    },
    [pathname, sendMessage, chatStatus]
  );

  // Lets other components (e.g. the Home page's "Try Now" teaser, or the
  // desktop AI charge calculator tile) open the widget — with an optional
  // prefilled message that's sent immediately — without a shared context;
  // this is a valid effect (subscribing to an external event system),
  // unlike calling setState directly in an effect body. Re-subscribes when
  // `send` changes so a prefilled send always carries the current page.
  useEffect(() => {
    const open = (detail: OpenAiChatDetail | null | undefined) => {
      setIsOpen(true);
      if (detail?.prefillText) send(detail.prefillText);
    };
    const handleOpen = (e: Event) => {
      takePendingAiChat(); // handled live — don't replay it on the next mount
      open((e as CustomEvent<OpenAiChatDetail>).detail);
    };
    window.addEventListener(OPEN_AI_CHAT_EVENT, handleOpen);
    // A tap that happened while this widget was still loading. Deferred a
    // tick: a setState from a timer, not from the effect body.
    const early = takePendingAiChat();
    const id = early ? window.setTimeout(() => open(early), 0) : undefined;
    return () => {
      window.removeEventListener(OPEN_AI_CHAT_EVENT, handleOpen);
      if (id !== undefined) window.clearTimeout(id);
    };
  }, [send]);

  if (!isVisible) return null;

  return (
    <>
      <div
        className={`fixed right-6 z-[100] transition-[opacity,transform] duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${fabOffset}`}
        style={{
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? "scale(.85)" : "scale(1)",
          pointerEvents: isOpen ? "none" : "auto",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setUnread(false);
          }}
          aria-label={unread ? t("openUnread") : t("open")}
          className="relative flex h-[58px] w-[58px] items-center justify-center rounded-full bg-blue-600/90 text-white shadow-[0_18px_40px_-14px_rgba(29,78,216,0.55)] backdrop-blur-md backdrop-saturate-150 transition-[transform,box-shadow,background-color] duration-200 hover:scale-[1.06] hover:bg-blue-600 hover:shadow-[0_22px_46px_-14px_rgba(29,78,216,0.65)]"
        >
          <Bot size={22} strokeWidth={1.8} />
          {unread && <span data-chat-unread className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500" />}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Backdrop: mobile bottom-sheet only — the desktop panel floats free */}
          <div
            className="fixed inset-0 z-[99] bg-slate-950/35 backdrop-blur-[2px] md:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="fixed inset-x-0 bottom-0 z-[100] h-[80vh] w-full [animation:hc-sheet-up_.34s_cubic-bezier(.2,.8,.2,1)_both] md:inset-x-auto md:right-6 md:bottom-6 md:h-[560px] md:w-96 md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-48px)] md:[animation:hc-panel_.34s_cubic-bezier(.2,.8,.2,1)_both]">
            <div className="relative h-full overflow-hidden rounded-t-3xl md:rounded-[24px]">
              {/* Faint tech-blue / frost-cyan mesh, behind the glass panel */}
              <div className="pointer-events-none absolute -left-[90px] -top-[70px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),rgba(37,99,235,0)_70%)] opacity-20 blur-[64px] [animation:hc-float_20s_ease-in-out_infinite] dark:opacity-[.32]" />
              <div className="pointer-events-none absolute -right-[80px] -bottom-[60px] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_70%)] opacity-20 blur-[64px] [animation:hc-float_26s_ease-in-out_infinite_reverse] dark:opacity-[.3]" />

              <div className="relative flex h-full flex-col overflow-hidden rounded-t-3xl border border-white/75 bg-white/72 shadow-[0_30px_70px_-24px_rgba(15,23,42,0.34)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/75 md:rounded-[24px]">
                <div className="flex flex-none justify-center pb-1 pt-2.5 md:hidden">
                  <span className="h-1.5 w-9 rounded-full bg-slate-900/15 dark:bg-white/20" />
                </div>

                <div className="flex items-center gap-[11px] px-4 pb-3 pt-4">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900">
                    {fgas ? <Sparkles size={15} strokeWidth={1.9} /> : <Bot size={16} strokeWidth={1.8} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold tracking-[-.015em]">
                      {fgas ? "F-Gas Consultant" : t("title")}
                    </div>
                    <div className="mt-[3px] flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                      {fgas ? (
                        // No "Online" dot here: this assistant's honesty about
                        // what it does not know is the thing worth stating.
                        <span>Answers only from our knowledge base</span>
                      ) : escalated ? (
                        <span data-chat-status="escalated" className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 [animation:hc-pulse_2.4s_ease-in-out_infinite]" />
                          {t("statusWithTeam")}
                        </span>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-green-600 [animation:hc-pulse_2.4s_ease-in-out_infinite]" />
                          {t("statusOnline")}
                        </>
                      )}
                    </div>
                  </div>
                  {!fgas && !escalated && (
                    // A person on request, without depending on the model to decide.
                    <button
                      type="button"
                      onClick={talkToPerson}
                      disabled={escalating}
                      data-talk-to-person
                      title={t("talkToPerson")}
                      className="flex h-[30px] flex-none items-center gap-1.5 rounded-[9px] bg-slate-900/5 px-2.5 text-[11.5px] font-medium text-slate-700 transition-colors hover:bg-slate-900/[.11] disabled:opacity-50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <UserRound size={13} strokeWidth={2} />
                      {t("talkToPersonShort")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close chat"
                    className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-slate-900/5 text-slate-600 transition-colors hover:bg-slate-900/[.11] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>

                {/* Segmented switch. Each tab keeps its own conversation: the
                    two assistants have different knowledge and different
                    rules, so carrying a transcript across would be misleading. */}
                <div
                  role="tablist"
                  aria-label="Assistant mode"
                  className="flex flex-none gap-1 border-b border-slate-900/[.07] px-3 pb-2.5 dark:border-white/[.08]"
                >
                  {MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setMode(m.id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-[7px] text-[12px] font-medium tracking-[-.01em] transition-colors ${
                          active
                            ? "bg-slate-900/[.06] text-slate-900 dark:bg-white/10 dark:text-slate-50"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        <m.Icon size={13} strokeWidth={2} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {fgas ? (
                  // Self-contained: it brings its own message list, product
                  // cards and composer, so the support body below is replaced
                  // wholesale rather than sharing an input that posts to the
                  // wrong endpoint.
                  <RagAssistant embedded />
                ) : (
                  <>
                <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="text-center text-[11px] tracking-[.03em] text-slate-400 dark:text-slate-500">
                  Today
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[84%] rounded-[16px_16px_16px_5px] border border-slate-900/[.07] bg-white/92 px-3.5 py-[11px] text-[13px] leading-[1.55] tracking-[-.005em] text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-white/[.08] dark:bg-white/[.06] dark:text-slate-50">
                    {t("greeting")}
                  </div>
                </div>
                {messages.map((m) => (
                  <SupportMessage key={m.id} message={m} cartSkus={cartSkus} onAddToCart={addToCart} onNotify={setNotifyFor} />
                ))}
                {chatStatus === "RESOLVED" && (
                  <div data-chat-resolved className="text-center text-[11.5px] text-muted-foreground">
                    {t("resolvedNotice")}
                  </div>
                )}
                {chatStatus === "EXPIRED" && (
                  <div data-chat-expired className="text-center text-[11.5px] text-muted-foreground">
                    {t("expiredNotice")}
                  </div>
                )}
                {/* A model outage / timeout ends the stream with an error part:
                    say so plainly instead of the dots just vanishing. The
                    buyer's message is already saved, and "Talk to a person"
                    still works. */}
                {streamError && !isTyping && !escalated && (
                  <div role="alert" data-chat-error className="rounded-[14px] border border-amber-500/30 bg-amber-500/[.08] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-amber-800 dark:text-amber-300">
                    {t("errorUnavailable")}
                  </div>
                )}
                {isTyping && !escalated && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-[16px_16px_16px_5px] border border-slate-900/[.07] bg-white/90 px-3.5 py-3 dark:border-white/[.08] dark:bg-white/[.06]">
                      <span className="h-[5px] w-[5px] rounded-full bg-slate-400 [animation:hc-pulse_1.2s_ease-in-out_infinite]" />
                      <span className="h-[5px] w-[5px] rounded-full bg-slate-400 [animation:hc-pulse_1.2s_ease-in-out_.2s_infinite]" />
                      <span className="h-[5px] w-[5px] rounded-full bg-slate-400 [animation:hc-pulse_1.2s_ease-in-out_.4s_infinite]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-900/[.07] p-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/[.08] md:pb-3">
                <div className={`mb-2 flex gap-[7px] overflow-x-auto ${escalated ? "hidden" : ""}`}>
                  {QUICK_REPLY_KEYS.map((key) => t(key)).map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => send(label)}
                      className="flex-none whitespace-nowrap rounded-full border border-slate-900/[.11] bg-white/80 px-[11px] py-1.5 text-[11.5px] text-slate-600 transition-colors hover:border-slate-900/30 dark:border-white/[.12] dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/30"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex h-11 items-center gap-2 rounded-[14px] border border-slate-900/[.12] bg-white/85 py-0 pl-3.5 pr-1.5 dark:border-white/[.14] dark:bg-white/5">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send(draft);
                    }}
                    placeholder={escalated ? t("placeholderTeam") : t("placeholder")}
                    className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => send(draft)}
                    aria-label={t("send")}
                    disabled={!draft.trim()}
                    className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] transition-colors disabled:cursor-not-allowed ${
                      draft.trim()
                        ? "bg-blue-700 text-white"
                        : "bg-slate-900/[.08] text-slate-400 dark:bg-white/10 dark:text-slate-500"
                    }`}
                  >
                    <Send size={15} strokeWidth={2} />
                  </button>
                </div>
                <p data-chat-retention className="m-0 mt-1.5 text-center text-[10.5px] text-slate-400 dark:text-slate-500">{t("retentionNote")}</p>
              </div>
                  </>
                )}
            </div>
          </div>
        </div>
        </>
      )}

      <StockNotifyModal
        isOpen={notifyFor !== null}
        onClose={() => setNotifyFor(null)}
        productId={notifyFor?.id ?? ""}
        productName={notifyFor?.name ?? ""}
      />
    </>
  );
}
