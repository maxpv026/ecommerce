"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Bot, CheckCircle2, Headset, Loader2, RotateCcw, Send, UserRound } from "lucide-react";
import { replyAsAgent, resolveChat, returnChatToAi } from "@/lib/actions/support";

interface ThreadMessage {
  id: string;
  role: "user" | "assistant" | "human_agent";
  content: string;
  createdAt: string;
  products: string[];
  escalated: boolean;
}

interface ThreadSession {
  id: string;
  status: "AI_ACTIVE" | "ESCALATED_TO_HUMAN" | "RESOLVED";
  escalationReason: string | null;
  startedOn: string | null;
  createdAt: string;
  /** Deleted at this time unless someone writes (lib/chatRetention). */
  expiresAt: string;
  customer: { name: string | null; email: string | null; company: string | null; fGas: string } | null;
}

const Markdown = dynamic(() => import("react-markdown"), { ssr: false });

/** One support conversation for the team: transcript, reply box, close / hand back to the AI. */
export default function AdminSupportThread({ session, messages }: { session: ThreadSession; messages: ThreadMessage[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [emailCustomer, setEmailCustomer] = useState(true);
  const [pending, start] = useTransition();
  const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const run = (task: () => Promise<{ ok: boolean; error?: string; emailed?: boolean }>, success: string) =>
    start(async () => {
      const result = await task();
      if (!result.ok) return void toast.error(result.error ?? "Failed.");
      toast.success(result.emailed ? `${success} The customer was also emailed.` : success);
      router.refresh();
    });

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    run(async () => {
      const r = await replyAsAgent(session.id, text, emailCustomer);
      if (r.ok) setDraft("");
      return r;
    }, "Reply sent.");
  };

  const who = session.customer ? session.customer.company || session.customer.name || session.customer.email : "Guest";

  return (
    <div className="mt-4">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-.04em]">{who}</h1>
          <p className="m-0 mt-1 text-[13px] text-muted-foreground">
            {session.customer ? [session.customer.name, session.customer.email, `F-Gas: ${session.customer.fGas}`].filter(Boolean).join(" · ") : "Not signed in — can only be reached in the chat window."}
          </p>
          <p className="m-0 mt-1 text-[12.5px] text-muted-foreground">
            Started {time(session.createdAt)}
            {session.startedOn ? ` on ${session.startedOn}` : ""}
            {session.escalationReason ? ` · ${session.escalationReason}` : ""}
          </p>
          <p data-expires className="m-0 mt-1 text-[12.5px] font-medium text-red-600 dark:text-red-400">
            Deleted at {new Date(session.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} unless someone writes — replying keeps it for another hour.
          </p>
        </div>
        <div className="flex gap-2">
          {session.status === "ESCALATED_TO_HUMAN" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => returnChatToAi(session.id), "Handed back to the AI.")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-medium disabled:opacity-50"
            >
              <RotateCcw size={14} /> Back to AI
            </button>
          )}
          {session.status !== "RESOLVED" && (
            <button
              type="button"
              disabled={pending}
              data-resolve-chat
              onClick={() => run(() => resolveChat(session.id), "Conversation resolved.")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-600/30 px-3.5 text-[13px] font-medium text-emerald-700 disabled:opacity-50 dark:text-emerald-400"
            >
              <CheckCircle2 size={14} /> Resolve
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-[20px] bg-card p-5 shadow-card dark:border dark:border-hairline" data-support-transcript>
        {messages.map((m) => {
          const Icon = m.role === "user" ? UserRound : m.role === "human_agent" ? Headset : Bot;
          const label = m.role === "user" ? "Customer" : m.role === "human_agent" ? "Team" : "AI";
          return (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "" : "pl-6"}`} data-transcript-row={m.role}>
              <span className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full ${m.role === "human_agent" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{label}</span> · {time(m.createdAt)}
                </div>
                {m.content &&
                  (m.role === "assistant" ? (
                    // The AI writes markdown; render it as the customer saw it.
                    <div className="mt-0.5 text-[14px] leading-[1.55] [&_ol]:my-1 [&_ol]:pl-5 [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:my-1 [&_ul]:pl-5">
                      <Markdown>{m.content}</Markdown>
                    </div>
                  ) : (
                    <div className="mt-0.5 whitespace-pre-line text-[14px] leading-[1.55]">{m.content}</div>
                  ))}
                {m.products.length > 0 && <div className="mt-1 text-[12.5px] text-muted-foreground">Showed: {m.products.join("; ")}</div>}
                {m.escalated && <div className="mt-1 text-[12.5px] font-medium text-amber-700 dark:text-amber-400">Handed to the team.</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[20px] bg-card p-4 shadow-card dark:border dark:border-hairline">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          rows={4}
          placeholder={session.status === "RESOLVED" ? "Replying reopens this conversation with you." : "Reply as the My Energy team…"}
          data-agent-reply
          className="w-full resize-y rounded-[12px] border border-input bg-transparent p-3 text-[14px] outline-none focus:ring-[3px] focus:ring-ring"
        />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} disabled={!session.customer?.email} />
            {session.customer?.email ? "Also email the customer" : "Guest — no email on file"}
          </label>
          <button
            type="button"
            onClick={send}
            disabled={pending || !draft.trim()}
            data-send-agent-reply
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send reply
          </button>
        </div>
      </div>
    </div>
  );
}
