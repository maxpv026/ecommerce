"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, Check, ChevronDown, ExternalLink, FileText, Loader2, Search, ShieldAlert, ShieldCheck, ShieldX, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { updateUserFgasStatus } from "@/lib/actions/adminUsers";
import type { AdminUserFilter, AdminUserRow, AdminUsersPage } from "@/lib/adminUsers";

/**
 * Admin → Users. URL-driven (?filter, ?q, ?page) so a filtered view can be
 * bookmarked or shared. Decisions go through updateUserFgasStatus, which
 * hands off to lib/fgasReview — the buttons only appear for transitions that
 * module allows, and it re-checks them anyway.
 */

const CARD = "rounded-[22px] border border-slate-900/[.08] bg-white dark:border-white/[.08] dark:bg-surface";

const FILTERS: Array<{ id: AdminUserFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "VERIFIED", label: "Verified" },
  { id: "REJECTED", label: "Rejected" },
  { id: "NONE", label: "Missing" },
];

const STATUS: Record<AdminUserRow["status"], { label: string; icon: typeof ShieldCheck; tone: string }> = {
  VERIFIED: { label: "Verified", icon: ShieldCheck, tone: "border-emerald-600/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300" },
  PENDING_REVIEW: { label: "Pending review", icon: ShieldAlert, tone: "border-amber-600/25 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300" },
  REJECTED: { label: "Rejected", icon: ShieldX, tone: "border-red-600/25 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300" },
  NONE: { label: "Missing", icon: FileText, tone: "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[.05] dark:text-slate-400" },
};

/** Mirrors lib/fgasReview's APPROVABLE / REVOCABLE. */
const canVerify = (u: AdminUserRow) => (u.status === "PENDING_REVIEW" || u.status === "REJECTED") && Boolean(u.documentHref);
const canReject = (u: AdminUserRow) => u.status === "PENDING_REVIEW" || u.status === "VERIFIED";

const REASONS = [
  "The certificate has expired.",
  "The document is unreadable — please upload a clearer scan.",
  "The certificate holder doesn't match the company on this account.",
  "This document isn't an F-Gas certificate.",
];

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const isExpired = (u: AdminUserRow) => Boolean(u.extracted?.expiresAt && new Date(`${u.extracted.expiresAt}T23:59:59Z`) < new Date());

export default function AdminUsersTable({ data, filter, query }: { data: AdminUsersPage; filter: AdminUserFilter; query: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ user: AdminUserRow; mode: "verify" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const href = (next: { filter?: AdminUserFilter; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    const q = next.q ?? query;
    if (f !== "all") params.set("filter", f);
    if (q) params.set("q", q);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const s = params.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };

  const decide = () => {
    if (!dialog) return;
    const { user, mode } = dialog;
    startTransition(async () => {
      const result = await updateUserFgasStatus(user.id, mode === "verify" ? "VERIFIED" : "REJECTED", mode === "reject" ? reason : undefined).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Couldn't save the change.");
        return;
      }
      toast.success(mode === "verify" ? `${user.name ?? user.email} is verified and can purchase.` : `Certificate rejected. ${user.name ?? "The buyer"} will see your reason.`);
      setDialog(null);
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by F-Gas status">
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <Link
                key={f.id}
                href={href({ filter: f.id, page: 1 })}
                role="tab"
                aria-selected={on}
                data-filter={f.id}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors ${
                  on
                    ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900"
                    : "border-slate-900/[.12] text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-300 dark:hover:bg-white/[.06]"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/15" : "bg-slate-900/[.06] dark:bg-white/[.08]"}`}>{data.counts[f.id]}</span>
              </Link>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(href({ q: search.trim(), page: 1 }));
          }}
          className="relative w-full sm:w-[300px]"
        >
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, company or VAT"
            aria-label="Search users"
            data-user-search
            className="h-10 w-full rounded-[12px] border border-slate-900/[.12] bg-white pl-10 pr-3 text-[13px] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.03]"
          />
        </form>
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="bg-[#0B1020] text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-400">
                <th className="px-5 py-3">Account</th>
                <th className="px-4 py-3">Company · VAT</th>
                <th className="px-4 py-3">F-Gas status</th>
                <th className="px-4 py-3">Certificate</th>
                <th className="px-5 py-3 text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">
                    No accounts match{query ? ` “${query}”` : " this filter"}.
                  </td>
                </tr>
              )}
              {data.rows.map((u) => {
                const s = STATUS[u.status];
                const expanded = open === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr className="border-t border-slate-900/[.06] align-top dark:border-white/[.06]" data-user-row={u.id}>
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => setOpen(expanded ? null : u.id)} aria-expanded={expanded} className="group flex items-start gap-2 text-left">
                          <ChevronDown size={14} className={`mt-1 flex-none text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                              {u.name ?? "—"}
                              {u.role === "ADMIN" && <span className="rounded-full bg-blue-700/10 px-1.5 text-[9.5px] font-bold uppercase tracking-[.08em] text-blue-700 dark:text-blue-300">Admin</span>}
                            </span>
                            <span className="block text-[12px] text-slate-500 dark:text-slate-400">{u.email ?? "no email"}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-[12.5px]">
                        <span className="block font-medium">{u.companyName ?? <span className="text-slate-400">No company</span>}</span>
                        <span className="block font-mono text-[11.5px] text-slate-500 dark:text-slate-400">{u.vatNumber ?? "No VAT number"}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.tone}`} data-user-status>
                          <s.icon size={12} strokeWidth={2.2} />
                          {s.label}
                        </span>
                        {u.decidedByAi && u.status !== "NONE" && (
                          <span title="Decided automatically; no person has reviewed it" className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-violet-500/25 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                            <Bot size={10} />
                            AI
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-slate-400">{u.submittedAt ? `Submitted ${day(u.submittedAt)}` : "Nothing uploaded"}</span>
                      </td>
                      <td className="px-4 py-4 text-[12.5px]">
                        {u.extracted ? (
                          <>
                            <span className="block font-mono text-[11.5px]">{u.extracted.certificateId || "—"}</span>
                            <span className="block text-slate-500 dark:text-slate-400">
                              {u.extracted.category || "—"} · expires {u.extracted.expiresAt ? day(u.extracted.expiresAt) : "—"}
                              {isExpired(u) && <span className="ml-1 font-semibold text-red-600 dark:text-red-400">Expired</span>}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">{u.documentHref ? "Not read" : "—"}</span>
                        )}
                        {u.documentHref && (
                          <a href={u.documentHref} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" data-user-document className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                            <ExternalLink size={12} />
                            Open document
                          </a>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {canVerify(u) && (
                            <button type="button" onClick={() => setDialog({ user: u, mode: "verify" })} data-verify className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-emerald-600 px-3 text-[12px] font-semibold text-white hover:bg-emerald-700">
                              <Check size={13} strokeWidth={2.4} />
                              Verify
                            </button>
                          )}
                          {canReject(u) && (
                            <button type="button" onClick={() => setDialog({ user: u, mode: "reject" })} data-reject className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-red-600/30 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-400/10">
                              <X size={13} strokeWidth={2.4} />
                              {u.status === "VERIFIED" ? "Revoke" : "Reject"}
                            </button>
                          )}
                          {!canVerify(u) && !canReject(u) && <span className="text-[12px] text-slate-400">{u.status === "NONE" ? "Awaiting upload" : "—"}</span>}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/70 dark:bg-white/[.02]" data-user-details={u.id}>
                        <td colSpan={5} className="px-5 pb-5 pt-1">
                          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px] md:grid-cols-4">
                            {[
                              ["Holder on certificate", u.extracted?.companyName || "—"],
                              ["Company on account", u.companyName || "—"],
                              ["Issuing body", u.extracted?.issuingBody || "—"],
                              ["Issued", u.extracted?.issuedOn ? day(u.extracted.issuedOn) : "—"],
                              ["Last decision", u.reviewedAt ? `${day(u.reviewedAt)}${u.decidedByAi ? " · automatic" : " · by an admin"}` : "—"],
                              ["Orders", String(u.orderCount)],
                              ["Member since", day(u.createdAt)],
                              ["Account id", u.id],
                            ].map(([k, v]) => (
                              <div key={k} className="min-w-0">
                                <dt className="text-[10.5px] uppercase tracking-[.07em] text-slate-400">{k}</dt>
                                <dd className="m-0 mt-0.5 truncate font-medium" title={v}>{v}</dd>
                              </div>
                            ))}
                          </dl>
                          {u.rejectionReason && (
                            <p className="m-0 mt-3 rounded-[12px] border border-red-600/20 bg-red-50 p-3 text-[12.5px] text-red-800 dark:bg-red-400/[.08] dark:text-red-200">
                              <span className="font-semibold">Reason shown to the buyer:</span> {u.rejectionReason}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-900/[.06] px-5 py-3 text-[12.5px] dark:border-white/[.06]">
            <span className="text-slate-500 dark:text-slate-400">
              Page {data.page} of {data.pageCount} · {data.total} accounts
            </span>
            <div className="flex gap-2">
              {data.page > 1 && <Link href={href({ page: data.page - 1 })} className="rounded-[10px] border border-slate-900/[.12] px-3 py-1.5 font-semibold dark:border-white/[.12]">Previous</Link>}
              {data.page < data.pageCount && <Link href={href({ page: data.page + 1 })} className="rounded-[10px] border border-slate-900/[.12] px-3 py-1.5 font-semibold dark:border-white/[.12]">Next</Link>}
            </div>
          </div>
        )}
      </div>

      {/* Decision dialog */}
      {dialog && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="decision-title" onClick={() => !pending && setDialog(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[480px] max-w-full rounded-[24px] bg-white p-7 shadow-2xl dark:bg-surface" data-decision-dialog>
            {dialog.mode === "verify" ? (
              <>
                <h3 id="decision-title" className="m-0 text-[19px] font-semibold tracking-[-.03em]">Verify {dialog.user.name ?? dialog.user.email}?</h3>
                <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-slate-600 dark:text-slate-400">
                  This unlocks the purchase of F-Gas refrigerants for {dialog.user.companyName ?? "this account"}. Only confirm after opening the document and checking it is a valid certificate held by this business.
                </p>
                {isExpired(dialog.user) && (
                  <p className="m-0 mt-3 rounded-[12px] border border-red-600/25 bg-red-50 p-3 text-[12.5px] font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-300">
                    The certificate&rsquo;s expiry date as read from the document has passed.
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 id="decision-title" className="m-0 text-[19px] font-semibold tracking-[-.03em]">
                  {dialog.user.status === "VERIFIED" ? "Revoke verification" : "Reject certificate"}
                </h3>
                <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-slate-600 dark:text-slate-400">
                  {dialog.user.name ?? "The buyer"} won&rsquo;t be able to purchase refrigerants and will see this reason on their profile.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {REASONS.map((r) => (
                    <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-slate-900/[.12] px-2.5 py-1 text-[11.5px] hover:bg-slate-900/[.04] dark:border-white/[.12] dark:hover:bg-white/[.06]">
                      {r}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Reason shown to the buyer"
                  data-reject-reason
                  className="mt-3 w-full rounded-[14px] border border-slate-900/[.12] bg-slate-50 px-3.5 py-3 text-[13.5px] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/15 dark:border-white/[.12] dark:bg-white/[.03]"
                />
              </>
            )}
            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" disabled={pending} onClick={() => setDialog(null)} className="h-11 rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold hover:bg-slate-900/[.04] dark:border-white/[.14]">
                Cancel
              </button>
              <button
                type="button"
                onClick={decide}
                disabled={pending || (dialog.mode === "reject" && reason.trim().length < 5)}
                data-confirm-decision
                className={`inline-flex h-11 items-center gap-2 rounded-[14px] px-5 text-[13.5px] font-semibold text-white disabled:opacity-50 ${dialog.mode === "verify" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                {dialog.mode === "verify" ? "Verify and unlock purchasing" : dialog.user.status === "VERIFIED" ? "Revoke" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
