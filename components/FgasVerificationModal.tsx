"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { ArrowRight, Check, Clock, FileText, Loader2, Lock, ShieldAlert, ShieldCheck, TriangleAlert, Upload, X } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useFgasModal } from "@/lib/fgasModalEvents";
import { FGAS_MAX_BYTES, daysUntil, isAcceptedFgasFile, type VerifyFgasErrorCode, type VerifyFgasEvent, type VerifyFgasResponse, type VerifyFgasResult } from "@/lib/fgas";
import FgasChecklist, { flagOf } from "./fgas/FgasChecklist";

/**
 * The F-Gas verification window — one instance for the whole app, opened
 * from the cart, the dashboard and the mobile profile (lib/fgasModalEvents).
 *
 *   guest    sign in first: a certificate is verified against an account
 *   idle     drop zone
 *   running  the server's own four stages, streamed (POST ?stream=1)
 *   result   VERIFIED / PENDING_REVIEW / REJECTED, each its own view
 *   error    a technical failure (file, timeout, service) — not a verdict
 */

type Phase = "idle" | "running" | "result" | "error";
const EASE = [0.16, 1, 0.3, 1] as const;
const CLIENT_TIMEOUT_MS = 70_000;

const ERROR_KEY: Partial<Record<VerifyFgasErrorCode, string>> = {
  SIGN_IN_REQUIRED: "errorSignIn",
  UNSUPPORTED_TYPE: "errorFileType",
  TOO_LARGE: "errorFileSize",
  CORRUPT_FILE: "errorFileCorrupt",
  AI_UNCONFIGURED: "errorUnconfigured",
  AI_TIMEOUT: "errorTimeout",
  AI_ERROR: "errorService",
};

export default function FgasVerificationModal() {
  const open = useFgasModal((s) => s.open);
  return <AnimatePresence>{open && <Dialog key="fgas" />}</AnimatePresence>;
}

function Dialog() {
  const t = useTranslations("FgasModal");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, update } = useSession();
  const source = useFgasModal((s) => s.source);
  const hide = useFgasModal((s) => s.hide);

  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState("errorBody");
  const [result, setResult] = useState<VerifyFgasResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const running = phase === "running";

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !running && hide();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [running, hide]);

  const reset = () => {
    setPhase("idle");
    setStage(0);
    setFileName(null);
    setResult(null);
  };

  const fail = (key: string) => {
    setErrorKey(key);
    setPhase("error");
  };

  const finish = (payload: VerifyFgasResponse) => {
    if (!payload.ok) return fail(ERROR_KEY[payload.code] ?? "errorBody");
    setResult(payload);
    setPhase("result");
    // The account's status may have changed: refresh the session claim and
    // every server-rendered gate on the page.
    void update({});
    router.refresh();
  };

  const submit = async (file: File) => {
    if (!isAcceptedFgasFile(file)) return fail("errorFileType");
    if (file.size > FGAS_MAX_BYTES) return fail("errorFileSize");
    setFileName(file.name);
    setStage(1);
    setPhase("running");
    const body = new FormData();
    body.append("certificate", file);
    try {
      const res = await fetch("/api/verify-fgas?stream=1", { method: "POST", body, signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
      if (res.status === 429) return fail("errorRateLimited");
      if (!res.body) return fail(res.status === 413 ? "errorFileSize" : "errorBody");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as VerifyFgasEvent;
          if (event.type === "stage") setStage(event.stage);
          else return finish(event.result);
        }
        if (done) break;
      }
      fail("errorBody");
    } catch (e) {
      fail(e instanceof DOMException && e.name === "TimeoutError" ? "errorTimeout" : "errorBody");
    }
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void submit(file);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (phase === "idle") pick(e.dataTransfer.files);
  };
  const onZoneKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const verdict = phase === "result" ? result?.verdict : null;
  const accent =
    verdict === "VERIFIED" ? "#10b981" : verdict === "PENDING_REVIEW" ? "#3b6fd8" : verdict === "REJECTED" ? "#ef4444" : phase === "error" ? "#f59e0b" : running ? "#22d3ee" : "#64748b";
  const dateOf = (iso: string | null | undefined) => (iso ? format.dateTime(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso), { dateStyle: "long", timeZone: "UTC" }) : null);

  const stages = [t("stage1"), t("stage2"), t("stage3"), t("stage4")];
  const guest = authStatus === "unauthenticated";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[#090A0C]/75 backdrop-blur-md sm:items-center sm:p-4"
      onClick={() => !running && hide()}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
        transition={{ duration: 0.45, ease: EASE }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fgas-modal-title"
        data-fgas-modal={phase === "result" ? verdict : guest ? "guest" : phase}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-white shadow-[0_40px_120px_-30px_rgba(4,10,25,.75)] sm:max-h-[90vh] sm:w-[540px] sm:rounded-[24px] dark:bg-[#141518]"
      >
        {/* status rail */}
        <span aria-hidden className="block h-1 w-full flex-none transition-colors duration-500" style={{ background: accent }} />

        <div className="flex flex-none items-start gap-3 px-6 pb-4 pt-5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-slate-900 text-white dark:bg-white/10">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 pr-8">
            <div className="text-[10.5px] font-semibold tracking-[.1em] text-slate-400 dark:text-ink-muted">{t("poweredBy")}</div>
            <h2 id="fgas-modal-title" className="m-0 mt-0.5 text-[19px] font-semibold tracking-[-.03em]">
              {t("title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={hide}
            disabled={running}
            aria-label={t("close")}
            className="absolute right-4 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/5 text-slate-600 hover:bg-slate-900/10 disabled:opacity-40 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          <AnimatePresence mode="wait" initial={false}>
            {guest ? (
              <motion.div key="guest" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-fgas-guest>
                <div className="flex items-start gap-3 rounded-[16px] border border-slate-900/[.08] bg-slate-50 p-4 dark:border-hairline dark:bg-white/[.03]">
                  <Lock size={18} strokeWidth={2} className="mt-0.5 flex-none text-slate-500" />
                  <div>
                    <div className="text-[14.5px] font-semibold">{t("guestTitle")}</div>
                    <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">{t("guestBody")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    hide();
                    router.push({ pathname: "/auth", query: { callbackUrl: pathname } });
                  }}
                  data-fgas-signin
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-slate-900 text-[14px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                >
                  {t("signIn")}
                  <ArrowRight size={15} strokeWidth={2.2} />
                </button>
              </motion.div>
            ) : phase === "idle" ? (
              <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="m-0 mb-4 text-[13px] leading-[1.55] text-slate-600 dark:text-ink-muted">{t("subtitle")}</p>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={onZoneKey}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  data-fgas-dropzone
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-[18px] border-[1.5px] border-dashed px-6 py-8 text-center transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-600/30 ${
                    dragOver ? "border-blue-600 bg-blue-600/[.06]" : "border-slate-900/[.16] bg-slate-50/60 hover:border-blue-600/50 dark:border-white/[.16] dark:bg-white/[.02]"
                  }`}
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] bg-blue-700 text-white">
                    <Upload size={20} strokeWidth={2} />
                  </span>
                  <span className="text-[14.5px] font-semibold tracking-[-.02em]">{t("dropTitle")}</span>
                  <span className="mt-1 text-[12px] text-slate-500 dark:text-ink-muted">{t("dropHint")}</span>
                  <span className="mt-4 inline-flex h-9 items-center rounded-[11px] border border-slate-900/[.14] bg-white px-4 text-[12.5px] font-semibold dark:border-white/[.14] dark:bg-white/[.06]">{t("browse")}</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    data-fgas-file
                    onChange={(e) => {
                      pick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{t("addCompanyHint")}</p>
              </motion.div>
            ) : phase === "running" ? (
              <motion.div key="running" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite" data-fgas-running>
                <div className="mb-4 flex items-center gap-2.5 rounded-[14px] bg-slate-50 px-3.5 py-3 dark:bg-white/[.04]">
                  <FileText size={16} strokeWidth={2} className="flex-none text-slate-500" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{fileName}</span>
                  <Loader2 size={15} className="flex-none animate-spin text-blue-600" />
                </div>
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {stages.map((label, i) => {
                    const n = i + 1;
                    const done = stage > n;
                    const active = stage === n;
                    return (
                      <li
                        key={label}
                        data-stage={n}
                        data-state={done ? "done" : active ? "active" : "todo"}
                        className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-[13px] transition-colors ${
                          done
                            ? "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-800 dark:text-emerald-300"
                            : active
                              ? "border-blue-600/40 bg-blue-600/[.06] font-semibold"
                              : "border-slate-900/[.07] text-slate-400 dark:border-hairline"
                        }`}
                      >
                        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold">
                          {done ? <Check size={14} strokeWidth={3} /> : active ? <Loader2 size={14} className="animate-spin" /> : n}
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ol>
              </motion.div>
            ) : phase === "result" && result ? (
              <motion.div key={`result-${result.verdict}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-fgas-result={result.verdict} data-kept-active={result.keptActive ? "1" : "0"}>
                {result.verdict === "VERIFIED" ? (
                  <VerifiedView result={result} dateOf={dateOf} />
                ) : (
                  <>
                    <div
                      className={`flex items-start gap-3 rounded-[16px] border p-4 ${
                        result.verdict === "PENDING_REVIEW" ? "border-blue-600/25 bg-blue-600/[.05]" : "border-red-500/30 bg-red-500/[.06]"
                      }`}
                    >
                      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-[12px] text-white ${result.verdict === "PENDING_REVIEW" ? "bg-[#3b6fd8]" : "bg-red-600"}`}>
                        {result.verdict === "PENDING_REVIEW" ? <Clock size={18} strokeWidth={2} /> : <ShieldAlert size={18} strokeWidth={2} />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[15.5px] font-semibold tracking-[-.02em]">{result.verdict === "PENDING_REVIEW" ? t("pendingTitle") : t("rejectedTitle")}</div>
                        <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">{result.verdict === "PENDING_REVIEW" ? t("pendingBody") : t("rejectedBody")}</p>
                      </div>
                    </div>
                    {result.keptActive && (
                      <p className="m-0 mt-3 flex items-start gap-2 rounded-[12px] bg-emerald-500/[.08] px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-800 dark:text-emerald-300" data-fgas-kept-active>
                        <ShieldCheck size={14} strokeWidth={2.2} className="mt-0.5 flex-none" />
                        {t("keptActive")}
                      </p>
                    )}
                    <div className="mt-4 text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-400">
                      {result.verdict === "PENDING_REVIEW" ? t("reviewTitle") : t("checksTitle")}
                    </div>
                    <div className="mt-2.5">
                      <FgasChecklist checks={result.checks} only={result.verdict === "PENDING_REVIEW" ? ["review"] : undefined} />
                    </div>
                    {result.verdict === "PENDING_REVIEW" && result.checks.some((c) => c.id === "holder" && c.outcome === "review") && (
                      <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{t("addCompanyHint")}</p>
                    )}
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" data-fgas-error={errorKey}>
                <div className="flex items-start gap-3 rounded-[16px] border border-amber-500/35 bg-amber-500/[.08] p-4">
                  <TriangleAlert size={18} strokeWidth={2} className="mt-0.5 flex-none text-amber-600" />
                  <div>
                    <div className="text-[15px] font-semibold">{t("errorTitle")}</div>
                    <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">{t(errorKey)}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* footer: actions + the accurate privacy statement */}
        {!guest && (
          <div className="flex-none border-t border-slate-900/[.07] px-6 pb-5 pt-4 dark:border-hairline">
            {phase === "result" && result?.verdict === "VERIFIED" ? (
              <button
                type="button"
                onClick={() => {
                  hide();
                  if (source === "cart") router.push("/checkout");
                }}
                data-fgas-done
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-emerald-600 text-[14px] font-semibold text-white hover:bg-emerald-500"
              >
                {source === "cart" ? t("proceedCheckout") : t("done")}
                <ArrowRight size={15} strokeWidth={2.2} />
              </button>
            ) : phase === "result" && result?.verdict === "PENDING_REVIEW" ? (
              <button type="button" onClick={hide} data-fgas-done className="flex h-12 w-full items-center justify-center rounded-[14px] bg-slate-900 text-[14px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                {t("done")}
              </button>
            ) : phase === "result" || phase === "error" ? (
              <button type="button" onClick={reset} data-fgas-retry className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[14px] font-semibold text-white hover:bg-blue-800">
                <Upload size={15} strokeWidth={2.2} />
                {phase === "result" ? t("uploadAnother") : t("retry")}
              </button>
            ) : null}
            <p className={`m-0 text-center text-[11px] leading-[1.5] text-slate-400 dark:text-slate-500 ${phase === "result" || phase === "error" ? "mt-3" : ""}`} data-fgas-privacy>
              {t("privacyNote")}
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function VerifiedView({ result, dateOf }: { result: VerifyFgasResult; dateOf: (iso: string | null | undefined) => string | null }) {
  const t = useTranslations("FgasModal");
  const x = result.extracted;
  const days = daysUntil(x?.expiresAt ? `${x.expiresAt}T23:59:59Z` : null);
  const rows = [
    { label: t("fieldCertId"), value: x?.certificateId ?? "—", mono: true },
    { label: t("fieldHolder"), value: x?.companyName ?? x?.personName ?? "—" },
    { label: t("fieldIssuer"), value: x?.issuingBody ?? "—" },
    { label: t("fieldCountry"), value: x?.countryCode ? `${flagOf(x.countryCode)} ${x.countryCode}` : "—" },
    { label: t("fieldCategory"), value: x?.category ?? "—" },
    { label: t("fieldExpiry"), value: dateOf(x?.expiresAt) ?? t("noExpiry") },
  ];
  return (
    <div data-fgas-verified>
      <div className="flex items-start gap-3 rounded-[16px] border border-emerald-500/30 bg-emerald-500/[.06] p-4">
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 18 }}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-emerald-600 text-white"
        >
          <ShieldCheck size={18} strokeWidth={2} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15.5px] font-semibold tracking-[-.02em]">{t("verifiedTitle")}</span>
            {days !== null && (
              <span className="rounded-full bg-emerald-600/12 px-2 py-[2px] text-[11px] font-semibold text-emerald-700 dark:text-emerald-300" data-fgas-countdown>
                {t("daysLeft", { days })}
              </span>
            )}
          </div>
          <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">{t("verifiedBody")}</p>
        </div>
      </div>
      <dl className="m-0 mt-4 grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0 rounded-[12px] border border-slate-900/[.08] px-3 py-2.5 dark:border-hairline">
            <dt className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">{r.label}</dt>
            <dd className={`m-0 mt-0.5 truncate text-[13px] font-semibold ${r.mono ? "font-mono tabular-nums" : ""}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
