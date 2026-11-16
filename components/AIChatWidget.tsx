"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Headset, Loader2, MessageCircle, PackageSearch, Send, ShieldCheck, Sparkles, X } from "lucide-react";
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

const MODES: Array<{ id: Mode; labelKey: "modeSupport" | "modeFgas"; Icon: typeof MessageCircle }> = [
  { id: "support", labelKey: "modeSupport", Icon: MessageCircle },
  { id: "fgas", labelKey: "modeFgas", Icon: ShieldCheck },
];

const QUICK_REPLY_KEYS = ["quick1", "quick2", "quick3"] as const;

/** Newest server timestamp in the list — the poll's cursor. */
const lastServerTime = (messages: SupportUIMessage[]) =>
  messages.reduce<string | null>((max, m) => (m.metadata?.createdAt && (!max || m.metadata.createdAt > max) ? m.metadata.createdAt : max), null);

export default function AIChatWidget() {
  const pathname = usePathname();
  const isVisible = ASSISTANT_VISIBLE_PATHS.includes(pathname);
  // Phones: 12 px above the 64 px dock (MobileBottomNav), tucked to the edge.
  const fabOffset = "bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6";
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

  const showChips = !escalated && messages.length === 0;

  return (
    <>
      {/* ── Launcher ── */}
      <div
        className={`fixed z-[100] transition-[opacity,transform] duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${fabOffset}`}
        style={{
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? "scale(.8)" : "scale(1)",
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
          data-chat-fab
          className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(145deg,#3b82f6,#1d4ed8_55%,#1e3a8a)] text-white shadow-[0_18px_40px_-14px_rgba(29,78,216,0.7),inset_0_1px_0_rgba(255,255,255,.25)] ring-1 ring-white/25 transition-[transform,box-shadow] duration-200 hover:scale-[1.06] hover:shadow-[0_24px_48px_-14px_rgba(29,78,216,0.8),inset_0_1px_0_rgba(255,255,255,.25)] active:scale-95 md:h-14 md:w-14 dark:ring-white/15"
        >
          {/* Soft halo, so the launcher reads as live without a bouncing animation. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-blue-500/15 transition-[box-shadow] group-hover:ring-blue-500/25" />
          <MessageCircle strokeWidth={1.9} className="h-5 w-5 md:h-6 md:w-6" />
          <Sparkles strokeWidth={2.2} className="absolute left-[29%] top-[30%] h-2.5 w-2.5 md:h-3 md:w-3" aria-hidden />
          <span aria-hidden className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950" data-chat-online />
          {unread && <span data-chat-unread className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500 dark:border-slate-950" />}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Backdrop: the phone bottom sheet only — the desktop panel floats free. */}
          <div className="fixed inset-0 z-[104] bg-slate-950/45 backdrop-blur-[2px] md:hidden" onClick={() => setIsOpen(false)} aria-hidden="true" />

          {/* z-[105]: above the dock (100), every page layer and the 3D canvas;
              below the modals this panel itself opens (StockNotifyModal, 110). */}
          <div
            role="dialog"
            aria-label={fgas ? t("fgasTitle") : "My Energy AI"}
            data-chat-panel
            className="fixed inset-x-0 bottom-0 z-[105] h-[85dvh] w-full [animation:hc-sheet-up_.34s_cubic-bezier(.2,.8,.2,1)_both] md:inset-x-auto md:bottom-6 md:right-6 md:h-[600px] md:max-h-[calc(100dvh-48px)] md:w-[400px] md:max-w-[calc(100vw-32px)] md:[animation:hc-panel_.34s_cubic-bezier(.2,.8,.2,1)_both]"
          >
            {/* Solid surface: nothing on the page can show through it. */}
            <div className="flex h-full flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white text-slate-900 shadow-[0_40px_90px_-30px_rgba(15,23,42,0.45),0_12px_28px_-12px_rgba(15,23,42,0.18)] md:rounded-[24px] dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-50 dark:shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85)]">
              <div className="flex flex-none justify-center pb-1 pt-2.5 md:hidden">
                <span className="h-1.5 w-9 rounded-full bg-slate-900/15 dark:bg-white/20" />
              </div>

              {/* ── Header ── */}
              <div className="flex-none border-b border-slate-200/80 bg-slate-50/70 px-4 pb-3 pt-3 md:pt-4 dark:border-slate-800/80 dark:bg-slate-900/40">
                {/* Row 1 — identity + close. One line, always: min-w-0 + truncate. */}
                <div className="flex items-center gap-3">
                  <span className="relative flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-[linear-gradient(145deg,#1e293b,#0f172a)] shadow-[inset_0_1px_0_rgba(255,255,255,.12)] dark:bg-[linear-gradient(145deg,#f8fafc,#e2e8f0)]" aria-hidden>
                    {/* The brand ring, with an AI spark on it. */}
                    <span className="block h-[15px] w-[15px] rounded-full border-[3.5px] border-white dark:border-slate-900" />
                    <span className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-600 ring-2 ring-slate-50 dark:ring-slate-900">
                      {fgas ? <ShieldCheck size={10} strokeWidth={2.6} className="text-white" /> : <Sparkles size={10} strokeWidth={2.6} className="text-white" />}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold tracking-[-.02em]" data-chat-title>
                      {fgas ? t("fgasTitle") : "My Energy AI"}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                      {fgas ? (
                        // No "online" dot here: this assistant's honesty about
                        // what it does not know is the thing worth stating.
                        <span className="truncate">{t("fgasSubtitle")}</span>
                      ) : escalated ? (
                        <span data-chat-status="escalated" className="flex min-w-0 items-center gap-1.5">
                          <span className="h-2 w-2 flex-none rounded-full bg-amber-500 [animation:hc-pulse_2.4s_ease-in-out_infinite]" />
                          <span className="truncate">{t("statusWithTeam")}</span>
                        </span>
                      ) : (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="relative flex h-2 w-2 flex-none">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 [animation:hc-pulse_2.4s_ease-in-out_infinite]" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          <span className="truncate">{t("subtitleOnline")}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label={t("close")}
                    data-chat-close
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-900/[.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[.08] dark:hover:text-white"
                  >
                    <X size={17} strokeWidth={2} />
                  </button>
                </div>

                {/* Row 2 — segmented switch. Each tab keeps its own conversation:
                    the two assistants have different knowledge and rules. */}
                <div role="tablist" aria-label={t("modesAria")} className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-900/[.05] p-1 dark:bg-white/[.06]" data-chat-modes>
                  {MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setMode(m.id)}
                        data-chat-mode={m.id}
                        className={`flex min-w-0 items-center justify-center gap-1.5 rounded-[9px] px-2 py-[7px] text-[12.5px] font-semibold tracking-[-.01em] transition-colors ${
                          active
                            ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,.12)] dark:bg-slate-800 dark:text-white"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        }`}
                      >
                        <m.Icon size={14} strokeWidth={2} className="flex-none" />
                        <span className="truncate">{t(m.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Row 3 — a person on request, without depending on the model to decide. */}
                {!fgas && !escalated && (
                  <button
                    type="button"
                    onClick={talkToPerson}
                    disabled={escalating}
                    data-talk-to-person
                    title={t("talkToPerson")}
                    className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-900/[.1] bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-blue-600/40 hover:text-blue-700 disabled:opacity-60 dark:border-white/[.12] dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-400/40 dark:hover:text-blue-300"
                  >
                    {escalating ? <Loader2 size={14} className="flex-none animate-spin" /> : <Headset size={14} strokeWidth={2} className="flex-none" />}
                    <span className="truncate">{t("talkToManager")}</span>
                  </button>
                )}
              </div>

              {fgas ? (
                // Self-contained: its own message list, product cards and composer.
                <RagAssistant embedded />
              ) : (
                <>
                  <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" data-chat-messages>
                    <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[.08em] text-slate-500 dark:text-slate-400" data-chat-today>
                      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                      {t("today")}
                      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Welcome card: what this assistant can actually do. */}
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900" data-chat-welcome>
                      <div className="text-[14px] font-semibold tracking-[-.015em]">{t("welcomeTitle")}</div>
                      <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
                        {([
                          ["cap1", PackageSearch],
                          ["cap2", ShieldCheck],
                          ["cap3", Headset],
                        ] as const).map(([key, Icon]) => (
                          <li key={key} className="flex items-start gap-2.5 text-[13px] leading-[1.45] text-slate-600 dark:text-slate-300">
                            <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-md bg-blue-600/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300">
                              <Icon size={12} strokeWidth={2.2} />
                            </span>
                            {t(key)}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {messages.map((m) => (
                      <SupportMessage key={m.id} message={m} cartSkus={cartSkus} onAddToCart={addToCart} onNotify={setNotifyFor} />
                    ))}
                    {chatStatus === "RESOLVED" && (
                      <div data-chat-resolved className="text-center text-[11.5px] text-slate-500 dark:text-slate-400">
                        {t("resolvedNotice")}
                      </div>
                    )}
                    {chatStatus === "EXPIRED" && (
                      <div data-chat-expired className="text-center text-[11.5px] text-slate-500 dark:text-slate-400">
                        {t("expiredNotice")}
                      </div>
                    )}
                    {/* A model outage / timeout ends the stream with an error part:
                        say so plainly instead of the dots just vanishing. */}
                    {streamError && !isTyping && !escalated && (
                      <div role="alert" data-chat-error className="rounded-[14px] border border-amber-500/30 bg-amber-500/[.08] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-amber-800 dark:text-amber-300">
                        {t("errorUnavailable")}
                      </div>
                    )}
                    {isTyping && !escalated && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-1 rounded-[16px_16px_16px_5px] border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900">
                          <span className="h-[5px] w-[5px] rounded-full bg-slate-400 [animation:hc-pulse_1.2s_ease-in-out_infinite]" />
                          <span className="h-[5px] w-[5px] rounded-full bg-slate-400 [animation:hc-pulse_1.2s_ease-in-out_.2s_infinite]" />
                          <span className="h-[5px] w-[5px] rounded-full bg-slate-400 [animation:hc-pulse_1.2s_ease-in-out_.4s_infinite]" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Composer (opaque footer) ── */}
                  <div className="flex-none border-t border-slate-200/80 bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:pb-3 dark:border-slate-800/80 dark:bg-slate-950">
                    {/* Starter questions WRAP — never clipped at the edge; gone once the conversation starts. */}
                    {showChips && (
                      <div className="mb-2.5 flex flex-wrap gap-2" aria-label={t("chipsAria")} data-chat-chips>
                        {QUICK_REPLY_KEYS.map((key) => t(key)).map((label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => send(label)}
                            className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[12px] font-medium leading-[1.35] text-slate-700 transition-colors hover:border-blue-600/40 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") send(draft);
                        }}
                        placeholder={escalated ? t("placeholderTeam") : t("placeholder")}
                        aria-label={escalated ? t("placeholderTeam") : t("placeholder")}
                        data-chat-input
                        // pr-14: the placeholder ends before the send button, in every language.
                        className="h-12 w-full truncate rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-14 text-[14px] text-slate-900 transition-[border-color,box-shadow] placeholder:text-slate-500 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => send(draft)}
                        aria-label={t("send")}
                        disabled={!draft.trim()}
                        data-chat-send
                        className={`absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl transition-[background-color,transform,color] duration-150 disabled:cursor-not-allowed ${
                          draft.trim()
                            ? "bg-blue-700 text-white shadow-[0_8px_18px_-8px_rgba(29,78,216,.8)] hover:bg-blue-800 active:scale-95"
                            : "bg-slate-200/70 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                        }`}
                      >
                        <Send size={16} strokeWidth={2} />
                      </button>
                    </div>
                    <p data-chat-retention className="m-0 mt-2 text-center text-[11px] leading-[1.4] text-slate-500 dark:text-slate-400">
                      {t("retentionNote")}
                    </p>
                  </div>
                </>
              )}
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
