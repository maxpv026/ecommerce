"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";
import { ArrowUp, FileText, Sparkles, TriangleAlert, X } from "lucide-react";

/**
 * Per-refrigerant safety assistant, opened from a row on the SDS page.
 *
 * Follows the global theme like the page behind it — a black panel over a
 * white page was the most visible half of the forced-dark bug.
 *
 * Mounted only while open (the parent keys it by gas) so each refrigerant
 * starts a clean conversation — carrying R-32's answers into an R-410A
 * thread would be actively dangerous, since their flammability classes
 * differ.
 */

const SUGGESTIONS = [
  "What do I do for skin contact?",
  "Is it flammable?",
  "How should I store the cylinder?",
] as const;

interface SdsAssistantModalProps {
  open: boolean;
  /** Refrigerant designation, e.g. "R-32". */
  gas: string;
  /** Full catalog name, shown as the subtitle. */
  documentName: string;
  /** Public path to the controlled PDF, linked from the footer. */
  pdfHref: string;
  onClose: () => void;
}

export default function SdsAssistantModal({
  open,
  gas,
  documentName,
  pdfHref,
  onClose,
}: SdsAssistantModalProps) {
  const [draft, setDraft] = useState("");
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat-sds" }));
  const { messages, sendMessage, status, error } = useChat({ transport });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status === "submitted" || status === "streaming";
  // A reply is on its way but no token has landed yet — that gap is what the
  // typing indicator covers.
  const awaitingFirstToken =
    busy && messages[messages.length - 1]?.role !== "assistant";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, awaitingFirstToken]);

  // Escape closes; the page behind stops scrolling under the overlay.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    // `gas` rides along on every turn; the route re-validates it against the
    // SDS catalog rather than trusting it.
    void sendMessage({ text: trimmed }, { body: { gas } });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md sm:p-8 dark:bg-[#050507]/80"
        >
          <motion.div
            initial={{ y: 16, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`AI Safety Assistant: ${gas}`}
            data-sds-assistant={gas}
            className="relative flex h-[min(640px,88vh)] w-[560px] max-w-full flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white/90 shadow-[0_50px_100px_-40px_rgba(15,23,42,.45)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/90 dark:shadow-[0_60px_120px_-45px_rgba(0,0,0,.9)]"
          >
            {/* violet / cyan aura, matching the Ask AI trigger */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle,#7c3aed,transparent_68%)] opacity-[.10] blur-[70px] dark:opacity-30"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-24 top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,#22d3ee,transparent_68%)] opacity-[.10] blur-[70px] dark:opacity-25"
            />

            {/* header */}
            <div className="relative flex flex-none items-start gap-3 border-b border-slate-200 p-5 dark:border-white/10">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#7c3aed,#22d3ee)] text-white shadow-[0_14px_28px_-14px_rgba(124,58,237,.9)]">
                <Sparkles size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 truncate text-[15px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
                  AI Safety Assistant: {gas}
                </h2>
                <p className="mb-0 mt-0.5 truncate text-[11.5px] text-slate-600 dark:text-slate-400">{documentName}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                data-sds-assistant-close
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-900/[.06] hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            {/* transcript */}
            <div ref={scrollRef} className="scrollbar-slim relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div className="pt-2">
                  <div className="flex items-start gap-2.5 rounded-[16px] border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-400/25 dark:bg-amber-400/[.08]">
                    <TriangleAlert size={15} strokeWidth={2} className="mt-px flex-none text-amber-600 dark:text-amber-400" />
                    <p className="m-0 text-[12px] leading-[1.55] text-amber-800 dark:text-amber-200/90">
                      Guidance only. The official SDS PDF is the controlled document — always check
                      it before handling, and call emergency services for any active incident.
                    </p>
                  </div>

                  <p className="mb-3 mt-5 text-[10.5px] tracking-[.08em] text-slate-600 dark:text-slate-400">SUGGESTED</p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => ask(s)}
                        data-sds-suggestion
                        className="rounded-[14px] border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-[12.5px] text-slate-700 transition-colors hover:border-cyan-500/40 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/[.03] dark:text-slate-300 dark:hover:border-cyan-400/30 dark:hover:bg-white/[.07] dark:hover:text-white"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
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
                        data-sds-message={m.role}
                        className={`max-w-[86%] text-pretty px-3.5 py-[11px] text-[13px] leading-[1.6] ${
                          ai
                            ? "rounded-[16px_16px_16px_5px] border border-slate-200 bg-slate-50 text-slate-800 [&_code]:rounded [&_code]:bg-slate-900/[.07] [&_code]:px-1 [&_code]:py-px [&_li]:my-0.5 [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:m-0 [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-4 dark:border-white/10 dark:bg-white/[.06] dark:text-slate-100 dark:[&_code]:bg-white/10"
                            : "rounded-[16px_16px_5px_16px] bg-blue-700 text-white shadow-[0_10px_24px_-12px_rgba(29,78,216,.9)]"
                        }`}
                      >
                        {ai ? <Markdown>{text}</Markdown> : text}
                      </div>
                    </div>
                  );
                })}

                {/* typing indicator — the wait before the first token */}
                {awaitingFirstToken && (
                  <div className="flex justify-start" data-sds-typing>
                    <div className="rounded-[16px_16px_16px_5px] border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-white/10 dark:bg-white/[.06]">
                      <div className="flex items-center gap-1.5">
                        {[0, 0.16, 0.32].map((delay) => (
                          <span
                            key={delay}
                            className="h-[5px] w-[5px] rounded-full bg-cyan-600 dark:bg-cyan-400"
                            style={{ animation: `hc-dots 1.2s ease-in-out ${delay}s infinite` }}
                          />
                        ))}
                      </div>
                      {/* pulsing skeleton lines under the dots */}
                      <div className="mt-3 flex w-[220px] flex-col gap-2">
                        <span className="h-2 w-full animate-pulse rounded-full bg-slate-900/[.08] dark:bg-white/10" />
                        <span className="h-2 w-[80%] animate-pulse rounded-full bg-slate-900/[.08] dark:bg-white/10" />
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    data-sds-error
                    className="rounded-[14px] border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-[1.5] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  >
                    The assistant is unavailable right now. Open the official SDS PDF below, or call
                    NCEC on +44 1865 407 333 if this is urgent.
                  </div>
                )}
              </div>
            </div>

            {/* composer */}
            <div className="relative flex-none border-t border-slate-200 p-4 dark:border-white/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(draft);
                }}
                className="flex items-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3.5 py-2 transition-colors focus-within:border-cyan-500/45 dark:border-white/10 dark:bg-white/[.04] dark:focus-within:border-cyan-400/40"
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Ask about ${gas} safety…`}
                  aria-label={`Ask about ${gas} safety`}
                  data-sds-input
                  className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={busy || draft.trim().length === 0}
                  aria-label="Send"
                  data-sds-send
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-[linear-gradient(140deg,#7c3aed,#22d3ee)] text-white transition-opacity disabled:opacity-35"
                >
                  <ArrowUp size={15} strokeWidth={2.4} />
                </button>
              </form>

              <a
                href={pdfHref}
                download
                className="mt-3 flex items-center justify-center gap-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <FileText size={13} strokeWidth={2} />
                Open the official SDS for {gas}
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
