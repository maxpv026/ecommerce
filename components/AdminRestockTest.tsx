"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { BugPlay, Loader2 } from "lucide-react";
import { testRestockEmail, type TestRestockReport } from "@/lib/actions/testRestock";

/**
 * Admin-only probe on the product page: force a real back-in-stock run and
 * show exactly what happened, without a terminal or a session cookie.
 *
 * Rendered only for an ADMIN session — and that is presentation only. The
 * server action re-checks the caller against the database row and
 * ADMIN_EMAIL, because a session claim is only as fresh as the last sign-in
 * and a server action is a public endpoint whatever the UI decides to show.
 *
 * Deliberately not translated: this is an internal diagnostic, and an
 * English-only string beats 29 locale entries nobody but the operator reads.
 */

interface AdminRestockTestProps {
  productId: string;
}

export default function AdminRestockTest({ productId }: AdminRestockTestProps) {
  const { data: session } = useSession();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TestRestockReport | null>(null);

  if (session?.user?.role !== "ADMIN") return null;

  const run = async () => {
    if (running) return;
    setRunning(true);
    setReport(null);
    try {
      // Awaited end to end: the action does not return until the SMTP
      // conversation has finished, so this result reflects real delivery.
      const result = await testRestockEmail({ productId, quantity: 25 });
      setReport(result);
      if (result.ok) toast.success(result.headline);
      else toast.error(result.headline);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReport({ ok: false, headline: "The action itself failed.", steps: [], error: message });
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      data-admin-restock-test
      className="mt-4 rounded-2xl border border-dashed border-amber-500/45 bg-amber-500/[.06] p-4"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[.07em] text-amber-700 uppercase dark:text-amber-400">
        <BugPlay size={14} strokeWidth={2.2} />
        Admin diagnostic
      </div>

      <button
        type="button"
        onClick={run}
        disabled={running}
        data-force-restock
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-amber-600 text-[13.5px] font-semibold tracking-[-.015em] text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
      >
        {running && <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />}
        {running ? "Running…" : "Admin Test: Force Restock Email"}
      </button>

      <p className="m-0 mt-2 text-[11.5px] leading-[1.5] text-amber-800/80 dark:text-amber-200/70">
        Takes this product to 0 and back to 25, then runs the same dispatcher the CRM webhook runs.
        The trip through zero matters: the mail fires on a 0 → positive transition, not on stock simply being positive.
      </p>

      {report && (
        <div
          data-restock-report
          className={`mt-3 rounded-[14px] border p-3 text-[12px] leading-[1.6] ${
            report.ok
              ? "border-emerald-500/30 bg-emerald-500/[.08] text-emerald-900 dark:text-emerald-200"
              : "border-red-500/30 bg-red-500/[.08] text-red-900 dark:text-red-200"
          }`}
        >
          <div className="font-semibold">{report.headline}</div>

          {report.steps.length > 0 && (
            <ol className="m-0 mt-2 list-decimal space-y-0.5 pl-4">
              {report.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          {report.error && (
            <div className="mt-2 rounded-[10px] bg-black/[.06] px-2.5 py-2 font-mono text-[11px] break-all dark:bg-white/[.08]">
              {report.error}
            </div>
          )}

          {report.detail && (
            <dl className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px]">
              <dt className="opacity-70">Subscribers found</dt>
              <dd className="m-0 text-right font-semibold">{report.detail.pendingFound}</dd>
              <dt className="opacity-70">Sent</dt>
              <dd className="m-0 text-right font-semibold">{report.detail.sent}</dd>
              <dt className="opacity-70">Failed</dt>
              <dd className="m-0 text-right font-semibold">{report.detail.failed}</dd>
              <dt className="opacity-70">Stock</dt>
              <dd className="m-0 text-right font-semibold">
                {report.detail.quantityBefore} → {report.detail.quantityAfter}
              </dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
