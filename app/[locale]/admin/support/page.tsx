import type { Metadata } from "next";
import { Headset } from "lucide-react";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { Link } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import { chatExpiresAt, purgeExpiredChats } from "@/lib/chatRetention";

export const metadata: Metadata = { title: "Support — My Energy Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS = {
  ESCALATED_TO_HUMAN: { label: "Waiting for you", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  AI_ACTIVE: { label: "With the AI", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  RESOLVED: { label: "Resolved", cls: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
} as const;

export default async function AdminSupportPage({ params, searchParams }: PageProps<"/[locale]/admin/support">) {
  await guardAdmin(params, "support");
  const view = (await searchParams).view === "all" ? "all" : "open";

  const { sessions, waiting } = await loadQueue(view);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10 md:px-8 md:py-14">
      <header className="mb-6">
        <p className="m-0 text-[11px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500">Customers</p>
        <h1 className="m-0 mt-2 text-[34px] font-semibold tracking-[-.045em]">Support chats</h1>
        <p className="m-0 mt-2 max-w-[640px] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">
          Conversations the assistant handed to the team, or the customer asked to. While a chat is waiting for you the AI
          stays silent; your reply appears in the customer&rsquo;s chat window within seconds. Every chat is permanently
          deleted one hour after its last message — including ones still waiting for you.
        </p>
        <div className="mt-4 flex gap-2 text-[13px] font-medium">
          <Link href="/admin/support" className={`rounded-full px-3.5 py-1.5 ${view === "open" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            Waiting ({waiting})
          </Link>
          <Link href={{ pathname: "/admin/support", query: { view: "all" } }} className={`rounded-full px-3.5 py-1.5 ${view === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            All recent
          </Link>
        </div>
      </header>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] border border-dashed border-border px-6 py-14 text-center" data-support-empty>
          <Headset size={22} className="text-muted-foreground" />
          <p className="m-0 mt-3 font-semibold">{view === "open" ? "Nobody is waiting." : "No conversations yet."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-support-list>
          {sessions.map((s) => {
            const who = s.user ? s.user.companyName || s.user.name || s.user.email : "Guest";
            const last = s.messages[0];
            return (
              <Link
                key={s.id}
                href={`/admin/support/${s.id}`}
                data-support-row={s.id}
                className="flex items-center gap-4 rounded-[16px] bg-card px-4 py-3.5 shadow-card transition-shadow hover:shadow-popover dark:border dark:border-hairline"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{who}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                    <span className="text-[12px] text-muted-foreground">{s._count.messages} messages</span>
                  </div>
                  {s.escalationReason && <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{s.escalationReason}</div>}
                  {last && last.content && (
                    <div className="mt-0.5 truncate text-[13px] text-foreground/80">
                      {last.role === "user" ? "Customer" : last.role === "human_agent" ? "You" : "AI"}: {last.content}
                    </div>
                  )}
                </div>
                <span className="flex flex-none flex-col items-end text-[12px] text-muted-foreground">
                  <span>{s.when}</span>
                  <span data-deletes-in className="text-red-600/80 dark:text-red-400/80">{s.deletesIn}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The inbox rows, with their age worked out at request time (outside render). */
async function loadQueue(view: "open" | "all") {
  // Retention: anything an hour quiet is deleted before it can be listed.
  await purgeExpiredChats();
  const rows = await prisma.chatSession.findMany({
    where: view === "open" ? { status: "ESCALATED_TO_HUMAN" } : {},
    // Waiting conversations first, oldest wait at the top — that's the queue.
    orderBy: view === "open" ? [{ escalatedAt: "asc" }] : [{ updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      escalationReason: true,
      escalatedAt: true,
      updatedAt: true,
      startedOn: true,
      user: { select: { name: true, email: true, companyName: true } },
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { role: true, content: true } },
    },
  });
  const waiting = await prisma.chatSession.count({ where: { status: "ESCALATED_TO_HUMAN" } });
  const now = Date.now();
  const ago = (d: Date) => {
    const m = Math.round((now - d.getTime()) / 60000);
    return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };
  return {
    waiting,
    sessions: rows.map((s) => ({
      ...s,
      when: s.status === "ESCALATED_TO_HUMAN" && s.escalatedAt ? `waiting ${ago(s.escalatedAt)}` : ago(s.updatedAt),
      deletesIn: `deleted in ${Math.max(0, Math.round((chatExpiresAt(s.updatedAt).getTime() - now) / 60000))} min`,
    })),
  };

}
