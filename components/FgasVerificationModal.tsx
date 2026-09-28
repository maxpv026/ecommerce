"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Check, FileText, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert, Upload, X } from "lucide-react";
import { FGAS_MAX_BYTES, isAcceptedFgasFile, type VerifyFgasErrorCode, type VerifyFgasResponse } from "@/lib/fgas";
import type { FgasVerification } from "@/lib/store/cart";

type Phase = "idle" | "scanning" | "success" | "error";

/**
 * A rejection ("this is a receipt, not a certificate") is a red boundary —
 * the document was audited and refused. Everything else is amber: a wrong
 * file, a slow service, a missing key. Both carry the server's own reason
 * when it sent one.
 */
interface ErrorState {
  tone: "reject" | "warn";
  titleKey: string;
  bodyKey: string;
  /** Specific finding from the server, shown verbatim under the message. */
  reason: string | null;
}

const REJECTED_ERROR = { tone: "reject", titleKey: "rejectedTitle", bodyKey: "rejectedBody" } as const;
const WARN_ERROR = { tone: "warn", titleKey: "errorTitle" } as const;

/** Maps a server error code onto the boundary the user sees. */
function errorStateFor(code: VerifyFgasErrorCode, reason: string | null): ErrorState {
  switch (code) {
    case "REJECTED":
      return { ...REJECTED_ERROR, reason };
    case "UNSUPPORTED_TYPE":
      return { ...WARN_ERROR, bodyKey: "errorFileType", reason: null };
    case "TOO_LARGE":
      return { ...WARN_ERROR, bodyKey: "errorFileSize", reason: null };
    case "CORRUPT_FILE":
      return { ...WARN_ERROR, bodyKey: "errorFileCorrupt", reason: null };
    case "AI_UNCONFIGURED":
      return { ...WARN_ERROR, bodyKey: "errorUnconfigured", reason: null };
    case "AI_TIMEOUT":
      return { ...WARN_ERROR, bodyKey: "errorTimeout", reason: null };
    case "AI_ERROR":
      return { ...WARN_ERROR, bodyKey: "errorService", reason: null };
    default:
      return { ...WARN_ERROR, bodyKey: "errorBody", reason: null };
  }
}

const localError = (bodyKey: string): ErrorState => ({ ...WARN_ERROR, bodyKey, reason: null });

// A real vision pass takes a few seconds; the floor only stops the scan
// animation from flashing past on a fast rejection.
const MIN_SCAN_MS = 900;
const STEP_TIMINGS_MS = [900, 2600, 5200];
// Slightly beyond the route's own 15 s AI budget, so a hung connection
// still resolves instead of leaving the modal spinning forever.
const CLIENT_TIMEOUT_MS = 25_000;

interface FgasVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where the result will live — copy only; the route decides from the real session. */
  scope: "guest" | "account";
  userId?: string | null;
  onVerified: (verification: FgasVerification) => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The dialog body mounts only while open, so every opening starts from a
 * fresh dropzone without a reset effect; AnimatePresence keeps it mounted
 * through the exit animation.
 */
export default function FgasVerificationModal({ isOpen, ...dialog }: FgasVerificationModalProps) {
  return <AnimatePresence>{isOpen && <FgasVerificationDialog key="fgas-modal" {...dialog} />}</AnimatePresence>;
}

function FgasVerificationDialog({ onClose, scope, userId = null, onVerified }: Omit<FgasVerificationModalProps, "isOpen">) {
  const t = useTranslations("FgasModal");
  const format = useFormatter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState>(localError("errorBody"));
  const [result, setResult] = useState<FgasVerification | null>(null);
  const [issuingBody, setIssuingBody] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scanning = phase === "scanning";
  const rejected = phase === "error" && error.tone === "reject";

  const reset = () => {
    setPhase("idle");
    setStep(0);
    setDragOver(false);
    setFileName(null);
    setResult(null);
    setIssuingBody(null);
  };

  // Escape closes (never mid-scan); body scroll is locked while open — same
  // contract as AuthModal so the two feel identical.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !scanning) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [scanning, onClose]);

  // Progress steps light up on a fixed cadence under the laser.
  useEffect(() => {
    if (!scanning) return;
    const ids = STEP_TIMINGS_MS.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [scanning]);

  const fail = (state: ErrorState) => {
    setError(state);
    setPhase("error");
  };

  const submit = async (file: File) => {
    // Fast local feedback only — the route re-checks all of this, and also
    // sniffs the bytes, so a hand-crafted request gains nothing.
    if (!isAcceptedFgasFile(file)) return fail(localError("errorFileType"));
    if (file.size > FGAS_MAX_BYTES) return fail(localError("errorFileSize"));

    setFileName(file.name);
    setStep(0);
    setPhase("scanning");

    const body = new FormData();
    body.append("certificate", file);
    const floor = new Promise((resolve) => setTimeout(resolve, MIN_SCAN_MS));

    try {
      const [response] = await Promise.all([
        fetch("/api/verify-fgas", { method: "POST", body, signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) }),
        floor,
      ]);

      let payload: VerifyFgasResponse | null = null;
      try {
        payload = (await response.json()) as VerifyFgasResponse;
      } catch {
        // Non-JSON body (proxy error page, 413 from the platform).
        return fail(localError(response.status === 413 ? "errorFileSize" : "errorBody"));
      }

      // A certificate the route accepted comes back as VERIFIED (or GUEST
      // for a signed-out visitor); a refused or unreadable one comes back as
      // an error code. Anything without a `status` is a failure.
      if (!response.ok || payload.status === undefined) {
        const code = payload.status === undefined ? payload.code : "FAILED";
        const reason = payload.status === undefined ? payload.errorReason : null;
        return fail(errorStateFor(code, reason));
      }

      const submission: FgasVerification = {
        scope: payload.status === "VERIFIED" ? "account" : "guest",
        userId: payload.status === "VERIFIED" ? userId : null,
        companyName: payload.extracted.companyName,
        certificateId: payload.extracted.certificateId,
        category: payload.extracted.category,
        expiresAt: payload.extracted.expiresAt,
        verifiedAt: payload.submittedAt,
      };
      setIssuingBody(payload.extracted.issuingBody);
      setResult(submission);
      setPhase("success");
      onVerified(submission);
    } catch (e) {
      // AbortSignal.timeout fires a TimeoutError; anything else is a network drop.
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      fail(localError(timedOut ? "errorTimeout" : "errorBody"));
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

  const onZoneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const frameStyle =
    phase === "scanning"
      ? {
          background: "linear-gradient(90deg,#1d4ed8,#22d3ee,#7c3aed,#1d4ed8)",
          backgroundSize: "300% 100%",
          animation: "hc-sweep 2.4s linear infinite",
          boxShadow: "0 40px 120px -30px rgba(4,10,25,.75), 0 0 70px -18px rgba(34,211,238,.6)",
        }
      : phase === "success"
        ? { background: "rgba(16,185,129,.55)", boxShadow: "0 40px 120px -30px rgba(4,10,25,.75), 0 0 80px -18px rgba(52,211,153,.75)" }
        : phase === "error"
          ? rejected
            ? { background: "rgba(239,68,68,.6)", boxShadow: "0 40px 120px -30px rgba(4,10,25,.75), 0 0 74px -16px rgba(239,68,68,.7)" }
            : { background: "rgba(245,158,11,.5)", boxShadow: "0 40px 120px -30px rgba(4,10,25,.75), 0 0 70px -18px rgba(245,158,11,.6)" }
          : dragOver
            ? { background: "rgba(34,211,238,.55)", boxShadow: "0 40px 120px -30px rgba(4,10,25,.75), 0 0 70px -18px rgba(34,211,238,.6)" }
            : { background: "var(--hc-border-idle)", boxShadow: "0 40px 120px -30px rgba(4,10,25,.7)" };

  const steps = [t("stepLayout"), t("stepFields"), t("stepRegister")];
  const expiryLabel = result
    ? format.dateTime(new Date(`${result.expiresAt}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" })
    : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#090A0C]/80 p-4 backdrop-blur-md"
      onClick={() => {
        if (!scanning) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.2 } }}
        transition={{ duration: 0.45, ease: EASE }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fgas-modal-title"
        data-fgas-modal={phase}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[480px] max-w-full rounded-[28px] p-[1.5px] transition-[box-shadow] duration-500"
        style={frameStyle}
      >
        <div className="relative overflow-hidden rounded-[26.5px] bg-white/[.88] p-[30px] pb-6 backdrop-blur-2xl backdrop-saturate-150 dark:bg-[#141518]/[.92]">
          {/* ambient tint follows the phase */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full opacity-40 blur-[70px] transition-[background] duration-700 [animation:hc-breathe_7s_ease-in-out_infinite]"
            style={{
              background: `radial-gradient(circle,${
                phase === "success"
                  ? "#34d399"
                  : phase === "error"
                    ? rejected
                      ? "#f87171"
                      : "#fbbf24"
                    : phase === "scanning"
                      ? "#22d3ee"
                      : "#7c3aed"
              },transparent 68%)`,
            }}
          />

          <button
            type="button"
            onClick={onClose}
            disabled={scanning}
            aria-label={t("close")}
            className="absolute right-4 top-4 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-900/5 text-slate-600 transition-colors hover:bg-slate-900/[.11] disabled:opacity-40 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <X size={14} strokeWidth={2} />
          </button>

          <div className="relative mb-1 flex items-center gap-2 text-[10.5px] font-semibold tracking-[.09em] text-slate-400 dark:text-ink-muted">
            <Sparkles size={13} strokeWidth={2} className="text-violet-600 dark:text-violet-400" />
            {t("poweredBy")}
          </div>
          <h2 id="fgas-modal-title" className="relative m-0 pr-8 text-[23px] font-semibold tracking-[-.035em]">
            {t("title")}
          </h2>
          <p className="relative mb-6 mt-[7px] text-[13px] leading-[1.55] text-slate-500 dark:text-ink-muted">{t("subtitle")}</p>

          <AnimatePresence mode="wait" initial={false}>
            {phase === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={onZoneKeyDown}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  data-fgas-dropzone
                  className={`relative flex cursor-pointer flex-col items-center justify-center rounded-[22px] border-[1.5px] border-dashed px-6 py-9 text-center transition-[border-color,background-color,box-shadow] duration-300 focus:outline-none focus-visible:ring-[3.5px] focus-visible:ring-cyan-400/30 ${
                    dragOver
                      ? "border-cyan-400 bg-cyan-400/[.08] shadow-[0_0_40px_-14px_#22d3ee]"
                      : "border-slate-900/[.16] bg-slate-900/[.025] hover:border-violet-500/50 hover:bg-violet-500/[.05] dark:border-white/[.16] dark:bg-white/[.03] dark:hover:border-violet-400/50"
                  }`}
                >
                  <span className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] text-white shadow-[0_18px_36px_-16px_rgba(37,99,235,.9)]">
                    <span className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle,#7c3aed,transparent_68%)] opacity-40 blur-[18px]" />
                    <Upload size={26} strokeWidth={1.9} className="relative" />
                  </span>
                  <span className="text-[15px] font-semibold tracking-[-.025em]">{t("dropTitle")}</span>
                  <span className="mt-1.5 text-[12px] text-slate-500 dark:text-ink-muted">{t("dropHint")}</span>
                  <span className="mt-5 inline-flex h-10 items-center justify-center rounded-[12px] border border-slate-900/[.14] bg-white px-4 text-[12.5px] font-semibold tracking-[-.015em] text-slate-900 transition-colors dark:border-hairline-strong dark:bg-white/[.06] dark:text-slate-50">
                    {t("browse")}
                  </span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      pick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              </motion.div>
            )}

            {phase === "scanning" && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
                transition={{ duration: 0.4, ease: EASE }}
                aria-live="polite"
                className="flex flex-col items-center"
              >
                {/* document under the scanner */}
                <div className="relative flex h-[172px] w-[134px] flex-col overflow-hidden rounded-[16px] border border-cyan-400/40 bg-white/80 p-4 shadow-[0_24px_50px_-28px_rgba(2,4,10,.7),0_0_34px_-12px_rgba(34,211,238,.7)] dark:bg-white/[.05]">
                  <FileText size={22} strokeWidth={1.7} className="mb-3 text-slate-500 dark:text-slate-300" />
                  {[78, 100, 62, 92, 54, 84].map((w, i) => (
                    <span
                      key={i}
                      className="mb-[7px] block h-[5px] rounded-full bg-slate-900/[.09] dark:bg-white/[.12]"
                      style={{ width: `${w}%` }}
                    />
                  ))}

                  {/* laser sweep */}
                  <motion.span
                    aria-hidden
                    initial={{ top: "0%" }}
                    animate={{ top: ["0%", "100%"] }}
                    transition={{ duration: 1.4, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                    className="pointer-events-none absolute inset-x-0 h-0"
                  >
                    <span className="absolute inset-x-0 -top-10 h-10 bg-[linear-gradient(to_bottom,transparent,rgba(34,211,238,.28))]" />
                    <span className="absolute inset-x-0 -top-px h-[2px] bg-[linear-gradient(90deg,transparent,#22d3ee_20%,#a78bfa_80%,transparent)] shadow-[0_0_14px_2px_rgba(34,211,238,.8)]" />
                  </motion.span>
                </div>

                <div className="mt-6 text-center">
                  <div className="text-[16px] font-semibold tracking-[-.03em]">{t("scanningTitle")}</div>
                  <div className="mt-1 flex items-center justify-center gap-1.5 text-[12px] text-slate-500 dark:text-ink-muted">
                    {[0, 0.16, 0.32].map((d) => (
                      <span
                        key={d}
                        className="h-[5px] w-[5px] rounded-full bg-cyan-500 dark:bg-cyan-400"
                        style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }}
                      />
                    ))}
                    <span className="ml-1 truncate">{fileName ?? t("scanningNote")}</span>
                  </div>
                </div>

                <ol className="mt-5 flex w-full flex-col gap-2">
                  {steps.map((label, i) => {
                    const done = step > i;
                    const active = step === i;
                    return (
                      <li
                        key={label}
                        className={`flex items-center gap-2.5 rounded-[12px] border px-3 py-2 text-[12px] transition-[border-color,background-color,color] duration-300 ${
                          done
                            ? "border-emerald-500/30 bg-emerald-500/[.08] text-emerald-700 dark:text-emerald-300"
                            : active
                              ? "border-cyan-400/40 bg-cyan-400/[.08] text-slate-900 dark:text-slate-50"
                              : "border-slate-900/[.07] text-slate-400 dark:border-hairline dark:text-ink-muted"
                        }`}
                      >
                        <span className="flex h-4 w-4 flex-none items-center justify-center">
                          {done ? (
                            <Check size={13} strokeWidth={2.6} />
                          ) : (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                active ? "bg-cyan-400 shadow-[0_0_8px_1px_#22d3ee] [animation:hc-glow_1.1s_ease-in-out_infinite]" : "bg-slate-300 dark:bg-white/20"
                              }`}
                            />
                          )}
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ol>
              </motion.div>
            )}

            {phase === "success" && result && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
                transition={{ duration: 0.4, ease: EASE }}
                aria-live="polite"
                data-fgas-success
              >
                <div className="flex items-start gap-3.5">
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.05 }}
                    className="relative flex h-12 w-12 flex-none items-center justify-center rounded-[15px] bg-[linear-gradient(140deg,#059669,#34d399)] text-white shadow-[0_16px_32px_-14px_rgba(16,185,129,.9)]"
                  >
                    <span className="pointer-events-none absolute -inset-3 rounded-full bg-[radial-gradient(circle,#34d399,transparent_68%)] opacity-50 blur-[14px]" />
                    <ShieldCheck size={22} strokeWidth={2} className="relative" />
                  </motion.span>
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold tracking-[-.03em]">{t("successTitle")}</div>
                    <p className="mb-0 mt-1 text-[12.5px] leading-[1.55] text-slate-500 dark:text-ink-muted">
                      {scope === "account" ? t("successBodyAccount") : t("successBodyGuest")}
                    </p>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-2.5">
                  {[
                    { label: t("fieldCompany"), value: result.companyName },
                    { label: t("fieldCertId"), value: result.certificateId, mono: true },
                    { label: t("fieldCategory"), value: result.category },
                    { label: t("fieldExpiry"), value: expiryLabel },
                  ].map((row, i) => (
                    <motion.div
                      key={row.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE, delay: 0.12 + i * 0.06 }}
                      className="min-w-0 rounded-[14px] border border-emerald-500/20 bg-emerald-500/[.06] px-3.5 py-3"
                    >
                      <dt className="text-[10px] font-semibold tracking-[.08em] text-emerald-700/80 dark:text-emerald-300/80">
                        {row.label.toUpperCase()}
                      </dt>
                      <dd className={`m-0 mt-1 truncate text-[13px] font-semibold tracking-[-.02em] ${row.mono ? "tabular-nums" : ""}`}>
                        {row.value}
                      </dd>
                    </motion.div>
                  ))}
                </dl>

                {issuingBody && (
                  <p className="mb-0 mt-2.5 text-center text-[11.5px] text-slate-500 dark:text-ink-muted" data-fgas-issuer>
                    {t("issuedBy", { body: issuingBody })}
                  </p>
                )}

                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  data-fgas-done
                  className="mt-5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-emerald-600 text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_18px_36px_-16px_#10b981,0_0_26px_-8px_#34d399] transition-colors hover:bg-emerald-500"
                >
                  <Check size={16} strokeWidth={2.4} />
                  {t("done")}
                </motion.button>
              </motion.div>
            )}

            {phase === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
                transition={{ duration: 0.4, ease: EASE }}
                role="alert"
                data-fgas-error={error.tone}
              >
                <div
                  className={`flex items-start gap-3.5 rounded-[18px] border p-3.5 ${
                    rejected
                      ? "border-red-500/40 bg-red-500/[.09] shadow-[0_0_34px_-14px_rgba(239,68,68,.8)]"
                      : "border-amber-500/35 bg-amber-500/[.09]"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 flex-none items-center justify-center rounded-[15px] text-white ${
                      rejected
                        ? "bg-[linear-gradient(140deg,#dc2626,#f87171)] shadow-[0_16px_32px_-14px_rgba(239,68,68,.95)]"
                        : "bg-[linear-gradient(140deg,#f59e0b,#f97316)] shadow-[0_16px_32px_-14px_rgba(245,158,11,.9)]"
                    }`}
                  >
                    {rejected ? <ShieldAlert size={22} strokeWidth={2} /> : <TriangleAlert size={22} strokeWidth={2} />}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-[17px] font-semibold tracking-[-.03em] ${
                        rejected ? "text-red-700 dark:text-red-300" : ""
                      }`}
                    >
                      {t(error.titleKey)}
                    </div>
                    <p className="mb-0 mt-1 text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">
                      {t(error.bodyKey)}
                    </p>
                  </div>
                </div>

                {/* The auditor's own finding, so the buyer knows what to fix */}
                {error.reason && (
                  <div className="mt-3 rounded-[14px] border border-slate-900/[.08] bg-slate-900/[.03] px-3.5 py-3 dark:border-hairline dark:bg-white/[.04]">
                    <div className="text-[9.5px] font-semibold tracking-[.08em] text-slate-400 dark:text-ink-muted">
                      {t("reasonLabel").toUpperCase()}
                    </div>
                    <p className="mb-0 mt-1 text-[12.5px] leading-[1.5] text-slate-700 dark:text-slate-200" data-fgas-reason>
                      {error.reason}
                    </p>
                  </div>
                )}

                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={reset}
                  data-fgas-retry
                  className={`mt-5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-semibold tracking-[-.01em] transition-colors ${
                    rejected
                      ? "bg-red-600 text-white shadow-[0_18px_36px_-16px_rgba(220,38,38,.95)] hover:bg-red-500"
                      : "bg-amber-500 text-slate-950 shadow-[0_18px_36px_-16px_rgba(245,158,11,.95)] hover:bg-amber-400"
                  }`}
                >
                  <Upload size={16} strokeWidth={2.2} />
                  {t("retry")}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="relative mb-0 mt-5 text-center text-[11px] leading-[1.5] text-slate-400 dark:text-slate-500">
            {t("privacyNote")}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
