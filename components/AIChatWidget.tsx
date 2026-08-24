"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { Bot, Send, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";
import { OPEN_AI_CHAT_EVENT, type OpenAiChatDetail } from "@/lib/aiChatEvents";

const ACCENT = "#1d4ed8";

const GREETING =
  "Hi — I can calculate refrigerant charges, walk through F-Gas Regulation rules, or recommend products. What do you need?";

const QUICK_REPLIES = ["Check R-410A stock", "What does error code E9 mean?", "Calculate charge for 50ft line"];

// Only the Home and Catalog pages get the AI assistant launcher.
const ASSISTANT_VISIBLE_PATHS = ["/", "/cylinders"];

export default function AIChatWidget() {
  const pathname = usePathname();
  const isVisible = ASSISTANT_VISIBLE_PATHS.includes(pathname);
  const fabOffset = "bottom-[120px] md:bottom-6";
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat" }));
  const { messages, sendMessage, status } = useChat({ transport });
  const isTyping = status === "submitted" || status === "streaming";

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
      sendMessage({ text: trimmed }, { body: { pathname } });
    },
    [pathname, sendMessage]
  );

  // Lets other components (e.g. the Home page's "Try Now" teaser, or the
  // desktop AI charge calculator tile) open the widget — with an optional
  // prefilled message that's sent immediately — without a shared context;
  // this is a valid effect (subscribing to an external event system),
  // unlike calling setState directly in an effect body. Re-subscribes when
  // `send` changes so a prefilled send always carries the current page.
  useEffect(() => {
    const handleOpen = (e: Event) => {
      setIsOpen(true);
      const prefillText = (e as CustomEvent<OpenAiChatDetail>).detail?.prefillText;
      if (prefillText) send(prefillText);
    };
    window.addEventListener(OPEN_AI_CHAT_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, handleOpen);
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
          onClick={() => setIsOpen(true)}
          aria-label="Open My Energy AI Support"
          className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-blue-600/90 text-white shadow-[0_18px_40px_-14px_rgba(29,78,216,0.55)] backdrop-blur-md backdrop-saturate-150 transition-[transform,box-shadow,background-color] duration-200 hover:scale-[1.06] hover:bg-blue-600 hover:shadow-[0_22px_46px_-14px_rgba(29,78,216,0.65)]"
        >
          <Bot size={22} strokeWidth={1.8} />
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
              <div className="pointer-events-none absolute -left-[90px] -top-[70px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-20 blur-[64px] [animation:hc-float_20s_ease-in-out_infinite] dark:opacity-[.32]" />
              <div className="pointer-events-none absolute -right-[80px] -bottom-[60px] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-20 blur-[64px] [animation:hc-float_26s_ease-in-out_infinite_reverse] dark:opacity-[.3]" />

              <div className="relative flex h-full flex-col overflow-hidden rounded-t-3xl border border-white/75 bg-white/72 shadow-[0_30px_70px_-24px_rgba(15,23,42,0.34)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/75 md:rounded-[24px]">
                <div className="flex flex-none justify-center pb-1 pt-2.5 md:hidden">
                  <span className="h-1.5 w-9 rounded-full bg-slate-900/15 dark:bg-white/20" />
                </div>

                <div className="flex items-center gap-[11px] border-b border-slate-900/[.07] p-4 dark:border-white/[.08]">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900">
                    <Bot size={16} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold tracking-[-.015em]">My Energy AI Support</div>
                    <div className="mt-[3px] flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-600 [animation:hc-pulse_2.4s_ease-in-out_infinite]" />
                      Online
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close chat"
                    className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-slate-900/5 text-slate-600 transition-colors hover:bg-slate-900/[.11] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>

                <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="text-center text-[11px] tracking-[.03em] text-slate-400 dark:text-slate-500">
                  Today
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[84%] rounded-[16px_16px_16px_5px] border border-slate-900/[.07] bg-white/92 px-3.5 py-[11px] text-[13px] leading-[1.55] tracking-[-.005em] text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-white/[.08] dark:bg-white/[.06] dark:text-slate-50">
                    {GREETING}
                  </div>
                </div>
                {messages.map((m) => {
                  const ai = m.role === "assistant";
                  const text = m.parts
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("");
                  if (!text) return null;
                  return (
                    <div key={m.id} className={`flex ${ai ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[84%] text-pretty px-3.5 py-[11px] text-[13px] leading-[1.55] tracking-[-.005em] ${
                          ai
                            ? "rounded-[16px_16px_16px_5px] border border-slate-900/[.07] bg-white/92 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-white/[.08] dark:bg-white/[.06] dark:text-slate-50 [&_p]:m-0 [&_p+p]:mt-2 [&_code]:rounded [&_code]:bg-slate-900/[.06] [&_code]:px-1 [&_code]:py-[1px] [&_code]:text-[12px] dark:[&_code]:bg-white/10"
                            : "rounded-[16px_16px_5px_16px] text-white"
                        }`}
                        style={ai ? undefined : { background: ACCENT, boxShadow: `0 8px 20px -10px ${ACCENT}b3` }}
                      >
                        {ai ? <Markdown>{text}</Markdown> : text}
                      </div>
                    </div>
                  );
                })}
                {isTyping && (
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
                <div className="mb-2 flex gap-[7px] overflow-x-auto">
                  {QUICK_REPLIES.map((label) => (
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
                    placeholder="Ask about stock, specs, or F-Gas rules..."
                    className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => send(draft)}
                    aria-label="Send message"
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
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </>
  );
}
