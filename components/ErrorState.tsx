"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "@/i18n/navigation";

const CARD =
  "rounded-[20px] border border-slate-900/[.07] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.04]";

export interface ErrorStateProps {
  title: string;
  description: string;
  retryLabel: string;
  /** Omitted by boundaries that have nowhere sensible to send the buyer. */
  homeLabel?: string;
  /** Label for the support reference line; hidden entirely when there is no digest. */
  referenceLabel?: string;
  /**
   * Next's error digest — a hash, not a stack trace. It is the only part of a
   * server error that is safe to show: it lets support correlate the report
   * with the server log without telling the browser anything about the
   * failure. Never render `error.message` from a server component here; in
   * production Next already redacts it to a generic string, and in
   * development it can carry connection strings and query text.
   */
  digest?: string;
  /** The boundary's own `reset`, passed straight through from error.tsx. */
  reset: () => void;
}

export default function ErrorState({
  title,
  description,
  retryLabel,
  homeLabel,
  referenceLabel,
  digest,
  reset,
}: ErrorStateProps) {
  const router = useRouter();

  /**
   * `reset()` on its own does NOT recover from a server error, which is worth
   * spelling out because the button looks like it works: reset only clears
   * the boundary and re-renders the segment from the RSC payload the client
   * already has — the failed one. React immediately throws again and the
   * error state snaps straight back. Verified against a route that fails once
   * and then succeeds: with reset alone the boundary never cleared.
   *
   * router.refresh() is the half that actually re-requests the segment from
   * the server. Both run inside one transition so the refreshed payload and
   * the boundary reset commit together, rather than flashing the error again
   * in between.
   */
  const handleRetry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16 md:py-24">
      <div className={`${CARD} w-full max-w-[480px] p-6 text-center md:p-8`}>
        <span className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-[16px] border border-amber-600/[.24] bg-amber-500/[.10] text-amber-600 dark:text-amber-400">
          <AlertTriangle size={24} strokeWidth={1.8} />
        </span>

        <h1 className="m-0 mt-4 text-[22px] font-semibold tracking-[-.035em] md:text-[25px]">{title}</h1>
        <p className="mx-auto mt-2 max-w-[38ch] text-[14px] leading-[1.55] text-slate-500 dark:text-slate-400">
          {description}
        </p>

        <div className="mt-6 flex flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleRetry}
            data-error-retry
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-blue-600 px-5 text-[14px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-blue-700 active:scale-[.98]"
          >
            <RefreshCw size={16} strokeWidth={2} />
            {retryLabel}
          </button>

          {homeLabel ? (
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[14px] border border-slate-900/[.10] px-5 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-300 dark:hover:bg-white/[.06]"
            >
              {homeLabel}
            </Link>
          ) : null}
        </div>

        {digest && referenceLabel ? (
          <p className="mt-5 text-[11.5px] tracking-[.02em] text-slate-400 dark:text-slate-500">
            {referenceLabel}: <code className="font-mono">{digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
