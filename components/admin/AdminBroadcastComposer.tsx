"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2, Mail, RefreshCw, Send, Sparkles, Square, Undo2, Users } from "lucide-react";
import {
  broadcastRegulatoryUpdate,
  continueBroadcast,
  getRegulatoryAudience,
  sendBroadcastTest,
  stopBroadcast,
} from "@/lib/actions/broadcast";
import { generateBroadcastDraft } from "@/lib/actions/aiBroadcast";
import type { BroadcastProgress } from "@/lib/broadcast";

/**
 * Compose → test → confirm → send, then drive the queue.
 *
 * Sending is a loop of time-boxed server passes (lib/broadcast). While this
 * page is open it runs them back to back and shows progress; if the tab is
 * closed the broadcast simply pauses in the database and the cron route (or
 * reopening this page and pressing Resume) carries on where it stopped.
 */

const SUBJECT_MAX = 200;
const CONTENT_MIN = 20;
/** When a pass makes no progress (only retries in back-off remain), wait this long. */
const IDLE_RETRY_MS = 20_000;

const CARD = "rounded-[22px] border border-slate-900/[.08] bg-white p-6 dark:border-white/[.08] dark:bg-surface";
const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-slate-500";
const INPUT =
  "w-full rounded-[14px] border border-slate-900/[.12] bg-slate-50 px-3.5 text-[14px] text-slate-900 transition-[border-color,box-shadow] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.03] dark:text-slate-50";

const STATUS_STYLE: Record<BroadcastProgress["status"], string> = {
  SENDING: "border-blue-600/25 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-300",
  COMPLETED: "border-emerald-600/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[.05] dark:text-slate-400",
};

const done = (p: BroadcastProgress) => p.sent + p.skipped + p.failed;

export default function AdminBroadcastComposer({
  initialAudience,
  initialRecent,
}: {
  initialAudience: number;
  initialRecent: BroadcastProgress[];
}) {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState(initialAudience);
  const [counting, setCounting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState<BroadcastProgress | null>(null);
  const [driving, setDriving] = useState(false);
  const [paused, setPaused] = useState<string | null>(null);
  const [recent, setRecent] = useState(initialRecent);
  const stopRequested = useRef(false);

  // AI assistant
  const [aiOpen, setAiOpen] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  /** A draft waiting for permission to replace what the admin already typed. */
  const [pendingDraft, setPendingDraft] = useState<{ subject: string; content: string; toVerify: string[] } | null>(null);
  /** What a replace overwrote, for one-step undo. */
  const [replaced, setReplaced] = useState<{ subject: string; content: string } | null>(null);
  const [toVerify, setToVerify] = useState<string[]>([]);

  const valid = subject.trim().length >= 3 && subject.trim().length <= SUBJECT_MAX && content.trim().length >= CONTENT_MIN;
  // Live count, so editing a placeholder away re-enables Send immediately.
  // The broadcast action refuses them too; this is the visible half.
  const unresolved = (`${subject}\n${content}`.match(/\[CONFIRM/gi) ?? []).length;
  const busy = starting || driving;

  const upsertRecent = (p: BroadcastProgress) =>
    setRecent((list) => [p, ...list.filter((b) => b.id !== p.id)].slice(0, 8));

  const applyDraft = (draft: { subject: string; content: string; toVerify: string[] }) => {
    if (subject.trim() || content.trim()) setReplaced({ subject, content });
    setSubject(draft.subject);
    setContent(draft.content);
    setToVerify(draft.toVerify);
    setPendingDraft(null);
  };

  const generate = async () => {
    setDrafting(true);
    setPendingDraft(null);
    const result = await generateBroadcastDraft(instruction).catch(() => null);
    setDrafting(false);
    if (!result?.ok) {
      toast.error(result?.ok === false ? result.error : "The AI service didn't respond.");
      return;
    }
    const draft = { subject: result.subject, content: result.content, toVerify: result.toVerify };
    // Never silently overwrite the admin's own text.
    if (subject.trim() || content.trim()) setPendingDraft(draft);
    else applyDraft(draft);
  };

  const undoReplace = () => {
    if (!replaced) return;
    setSubject(replaced.subject);
    setContent(replaced.content);
    setReplaced(null);
    setToVerify([]);
  };

  const recalculate = async () => {
    setCounting(true);
    const result = await getRegulatoryAudience().catch(() => null);
    setCounting(false);
    if (result?.ok) setAudience(result.count);
    else toast.error(result?.error ?? "Couldn't count the audience.");
  };

  const sendTest = async () => {
    setTesting(true);
    const result = await sendBroadcastTest({ subject, content }).catch(() => null);
    setTesting(false);
    if (result?.ok) toast.success(`Test sent to ${result.sentTo}. Check how it looks before sending to everyone.`);
    else toast.error(result?.error ?? "Test failed.");
  };

  // Runs passes until the broadcast finishes, is stopped, or the mail server fails.
  const drive = async (start: BroadcastProgress) => {
    setDriving(true);
    setPaused(null);
    stopRequested.current = false;
    let progress = start;
    while (progress.status === "SENDING" && progress.remaining > 0 && !stopRequested.current) {
      if (progress.stoppedReason === "SMTP_FAILING") {
        setPaused("The mail server rejected several sends in a row, so sending paused. Nothing was lost — fix the mail settings and press Resume.");
        break;
      }
      const before = done(progress);
      const result = await continueBroadcast(progress.id).catch(() => null);
      if (!result?.ok) {
        setPaused(result?.error ?? "Lost contact with the server. Press Resume to carry on.");
        break;
      }
      progress = result.progress;
      setActive(progress);
      upsertRecent(progress);
      if (done(progress) === before && progress.remaining > 0) {
        // Only retries waiting out their back-off are left.
        await new Promise((r) => setTimeout(r, IDLE_RETRY_MS));
      }
    }
    setDriving(false);
    if (progress.status === "COMPLETED") {
      toast.success(`Sent to ${progress.sent} of ${progress.total}.`);
      setSubject("");
      setContent("");
      setToVerify([]);
      setReplaced(null);
    }
  };

  const start = async () => {
    setConfirming(false);
    setStarting(true);
    const result = await broadcastRegulatoryUpdate({ subject, content }).catch(() => null);
    setStarting(false);
    if (!result?.ok) {
      toast.error(result?.error ?? "Could not start the broadcast.");
      return;
    }
    if (result.reused) toast.message("That broadcast is already running — resuming it instead of sending twice.");
    else toast.success("Broadcast started.");
    setActive(result.progress);
    upsertRecent(result.progress);
    void drive(result.progress);
  };

  const stop = async () => {
    if (!active) return;
    stopRequested.current = true;
    const result = await stopBroadcast(active.id).catch(() => null);
    if (result?.ok) {
      setActive(result.progress);
      upsertRecent(result.progress);
      toast.message("Broadcast stopped. Nobody else will receive it.");
    }
  };

  // Warn before closing the tab mid-send (it would pause, not lose, the broadcast).
  useEffect(() => {
    if (!driving) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [driving]);

  const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pct = active && active.total > 0 ? Math.round((done(active) / active.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.25fr_.95fr]">
        {/* ── Compose ── */}
        <section className={CARD} data-broadcast-compose>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#0f172a,var(--glow-700))] text-white">
              <Mail size={18} strokeWidth={2} />
            </span>
            <div>
              <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em]">Compose</h2>
              <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">Plain text. A blank line starts a new paragraph.</p>
            </div>
          </div>

          {/* ── AI assistant ── */}
          <div className="mb-5 overflow-hidden rounded-[18px] border border-white/[.06] bg-[linear-gradient(160deg,#0B1020,#111a33)] text-slate-200" data-ai-assistant>
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              aria-expanded={aiOpen}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[linear-gradient(140deg,#6d28d9,#0891b2)] text-white">
                <Sparkles size={14} strokeWidth={2.2} />
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-white">AI assistant</span>
                <span className="block text-[11px] text-slate-400">Describe the update; get a first draft to review and edit.</span>
              </span>
              <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${aiOpen ? "rotate-180" : ""}`} />
            </button>

            {aiOpen && (
              <div className="border-t border-white/[.06] px-4 pb-4 pt-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && instruction.trim().length >= 10 && !drafting && generate()}
                    disabled={drafting || busy}
                    maxLength={1000}
                    placeholder="e.g. Update on the 2027 HFC quota step-down and what it means for R-404A service stock"
                    className="h-11 min-w-0 flex-1 rounded-[12px] border border-white/[.1] bg-white/[.04] px-3.5 text-[13.5px] text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
                    data-ai-instruction
                  />
                  <button
                    type="button"
                    onClick={generate}
                    disabled={instruction.trim().length < 10 || drafting || busy}
                    data-ai-generate
                    className="inline-flex h-11 flex-none items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(140deg,#6d28d9,#0e7490)] px-4 text-[13px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,.9)] transition-[filter] hover:brightness-110 disabled:opacity-50"
                  >
                    {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} strokeWidth={2.2} />}
                    {drafting ? "Drafting…" : "Generate draft"}
                  </button>
                </div>
                <p className="m-0 mt-2 text-[11px] leading-[1.5] text-slate-400">
                  Give it the facts — figures, dates, articles. It won&rsquo;t invent any: anything missing comes back as{" "}
                  <code className="rounded bg-white/[.08] px-1 text-[10.5px] text-amber-200">[CONFIRM: …]</code> for you to fill in.
                </p>

                {pendingDraft && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-amber-400/30 bg-amber-400/[.08] px-3 py-2.5" data-ai-replace-prompt>
                    <span className="flex-1 text-[12.5px] text-amber-100">Replace your current subject and content with the new draft?</span>
                    <button type="button" onClick={() => applyDraft(pendingDraft)} className="h-8 rounded-[9px] bg-amber-300 px-3 text-[12px] font-semibold text-slate-900 hover:bg-amber-200" data-ai-replace>
                      Replace
                    </button>
                    <button type="button" onClick={() => setPendingDraft(null)} className="h-8 rounded-[9px] border border-white/15 px-3 text-[12px] font-semibold text-slate-200 hover:bg-white/[.06]">
                      Keep mine
                    </button>
                  </div>
                )}
                {replaced && !pendingDraft && (
                  <button type="button" onClick={undoReplace} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-300 hover:text-white" data-ai-undo>
                    <Undo2 size={13} strokeWidth={2.2} />
                    Undo — restore what you had
                  </button>
                )}
              </div>
            )}
          </div>

          <label className="mb-4 block">
            <span className="mb-1.5 flex items-baseline justify-between">
              <span className={LABEL.replace("mb-1.5 block ", "")}>Subject</span>
              <span className={`text-[11px] ${subject.length > SUBJECT_MAX ? "text-red-500" : "text-slate-400"}`}>
                {subject.length}/{SUBJECT_MAX}
              </span>
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              placeholder="e.g. EU F-Gas: 2027 HFC quota step-down"
              className={`${INPUT} h-12`}
              data-broadcast-subject
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between">
              <span className={LABEL.replace("mb-1.5 block ", "")}>Content</span>
              <span className="text-[11px] text-slate-400">{content.trim().length.toLocaleString()} chars</span>
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={busy}
              rows={13}
              placeholder={"What changes, from when, and what customers should do about it.\n\nKeep it factual — the email adds a \"not legal advice\" note."}
              className={`${INPUT} resize-y py-3 leading-[1.6]`}
              data-broadcast-content
            />
          </label>

          {(unresolved > 0 || toVerify.length > 0) && (
            <div className="mt-4 rounded-[14px] border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-400/[.08]" data-ai-review>
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle size={14} />
                Check before sending
              </div>
              {unresolved > 0 && (
                <p className="m-0 mt-1.5 text-[12.5px] text-amber-900 dark:text-amber-100" data-ai-unresolved>
                  {unresolved} <code className="rounded bg-amber-500/15 px-1">[CONFIRM: …]</code>{" "}
                  {unresolved === 1 ? "placeholder needs" : "placeholders need"} a verified fact (or removing) — sending is blocked until then.
                </p>
              )}
              {toVerify.length > 0 && (
                <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[12px] leading-[1.5] text-amber-900/90 dark:text-amber-100/90">
                  {toVerify.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {/* ── Audience + actions ── */}
          <section className={CARD} data-broadcast-audience>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className={LABEL}>Audience</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[34px] font-semibold leading-none tracking-[-.04em]" data-audience-count>
                    {audience.toLocaleString()}
                  </span>
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">opted in to regulatory updates</span>
                </div>
              </div>
              <button
                type="button"
                onClick={recalculate}
                disabled={counting}
                data-recalculate
                className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-slate-900/[.12] px-3 text-[12.5px] font-semibold transition-colors hover:bg-slate-900/[.04] disabled:opacity-60 dark:border-white/[.12] dark:hover:bg-white/[.06]"
              >
                <RefreshCw size={13} strokeWidth={2.2} className={counting ? "animate-spin" : ""} />
                Recalculate
              </button>
            </div>
            <p className="m-0 mt-3 flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
              <Users size={13} strokeWidth={2} />
              Counted when you send — anyone who opts out before their email goes out is skipped.
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={sendTest}
                disabled={!valid || testing || busy}
                data-send-test
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-slate-900/[.14] text-[13.5px] font-semibold transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:hover:bg-white/[.06]"
              >
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} strokeWidth={2} />}
                Send a test to me
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!valid || audience === 0 || busy || unresolved > 0}
                title={unresolved > 0 ? "Resolve the [CONFIRM: …] placeholders first" : undefined}
                data-send-broadcast
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[13.5px] font-semibold text-white shadow-[0_18px_36px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800 disabled:opacity-50"
              >
                {starting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2} />}
                Send to {audience.toLocaleString()} {audience === 1 ? "recipient" : "recipients"}
              </button>
            </div>
          </section>

          {/* ── Progress ── */}
          {active && (
            <section className={CARD} data-broadcast-progress aria-live="polite">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[active.status]}`}>
                  {driving && <Loader2 size={11} className="animate-spin" />}
                  {active.status === "SENDING" ? (driving ? "Sending" : "Paused") : active.status === "COMPLETED" ? "Completed" : "Stopped"}
                </span>
                <span className="text-[12.5px] font-semibold tabular-nums">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-900/[.08] dark:bg-white/[.08]">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--glow-700),#22d3ee)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <dl className="m-0 mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Sent", active.sent],
                  ["Skipped", active.skipped],
                  ["Failed", active.failed],
                  ["To go", active.remaining],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] bg-slate-50 py-2 dark:bg-white/[.03]">
                    <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">{label}</dt>
                    <dd className="m-0 mt-0.5 text-[16px] font-semibold tabular-nums" data-progress={String(label).toLowerCase().replace(" ", "-")}>
                      {Number(value).toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>

              {paused && (
                <p className="m-0 mt-4 flex items-start gap-2 rounded-[12px] border border-amber-500/30 bg-amber-50 p-3 text-[12.5px] leading-[1.5] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
                  <AlertTriangle size={14} className="mt-0.5 flex-none" />
                  {paused}
                </p>
              )}
              {active.status === "SENDING" && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="m-0 text-[12px] leading-[1.5] text-slate-500 dark:text-slate-400">
                    {driving ? "Keep this tab open to send fastest. Closing it pauses sending; nothing is lost." : "Paused — resume here, or the daily job picks it up."}
                  </p>
                  <div className="flex flex-none gap-2">
                    {!driving && (
                      <button
                        type="button"
                        onClick={() => drive(active)}
                        className="h-9 rounded-[11px] bg-blue-700 px-3.5 text-[12.5px] font-semibold text-white hover:bg-blue-800"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={stop}
                      data-stop-broadcast
                      className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-red-600/30 px-3 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-400/10"
                    >
                      <Square size={11} strokeWidth={2.6} />
                      Stop
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Preview ── */}
          <section className="overflow-hidden rounded-[22px] border border-slate-900/[.08] dark:border-white/[.08]" data-broadcast-preview>
            <div className="bg-[#0F172A] px-6 py-5">
              <div className="text-[10px] font-bold tracking-[2.4px] text-[#93C5FD]">MY ENERGY</div>
              <div className="mt-3 text-[10px] font-semibold tracking-[1.4px] text-slate-300">REGULATORY UPDATE</div>
              <div className="mt-1 text-[17px] font-bold leading-snug text-white">{subject.trim() || "Your subject line"}</div>
            </div>
            <div className="bg-white px-6 py-5 text-[13.5px] leading-[1.6] text-slate-800 dark:bg-white dark:text-slate-800">
              <p className="m-0 mb-3">Hello [first name],</p>
              {(paragraphs.length ? paragraphs : ["Your update will appear here as you type."]).map((p, i) => (
                <p key={i} className="m-0 mb-3 whitespace-pre-line">
                  {p}
                </p>
              ))}
              <p className="m-0 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                For guidance only. This summary does not replace the text of the regulation, and it is not legal advice.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* ── Recent ── */}
      {recent.length > 0 && (
        <section className={CARD} data-broadcast-history>
          <h2 className="m-0 mb-4 text-[15px] font-semibold tracking-[-.02em]">Recent broadcasts</h2>
          <div className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
            {recent.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{b.subject}</span>
                <span className="text-[12px] text-slate-400 tabular-nums">
                  {new Date(b.createdAt).toLocaleString("en-IE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                  {b.sent.toLocaleString()} / {b.total.toLocaleString()} sent
                  {b.failed > 0 && <span className="text-red-500"> · {b.failed} failed</span>}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[b.status]}`}>
                  {b.status === "SENDING" ? "In progress" : b.status === "COMPLETED" ? "Completed" : "Stopped"}
                </span>
                {b.status === "SENDING" && !busy && (
                  <button
                    type="button"
                    onClick={() => {
                      setActive(b);
                      void drive(b);
                    }}
                    className="h-8 rounded-[10px] border border-slate-900/[.12] px-3 text-[12px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.12] dark:hover:bg-white/[.06]"
                  >
                    Resume
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Confirm ── */}
      {confirming && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="broadcast-confirm-title"
          onClick={() => setConfirming(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-full rounded-[24px] bg-white p-7 shadow-2xl dark:bg-surface" data-broadcast-confirm>
            <h3 id="broadcast-confirm-title" className="m-0 text-[19px] font-semibold tracking-[-.03em]">
              Send to {audience.toLocaleString()} {audience === 1 ? "recipient" : "recipients"}?
            </h3>
            <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-slate-600 dark:text-slate-400">
              &ldquo;{subject.trim()}&rdquo; will be emailed to everyone opted in to regulatory updates. Emails can&rsquo;t be recalled once
              sent; you can stop the rest at any time.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.14]">
                Cancel
              </button>
              <button type="button" onClick={start} data-confirm-send className="h-11 rounded-[14px] bg-blue-700 px-5 text-[13.5px] font-semibold text-white hover:bg-blue-800">
                Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
