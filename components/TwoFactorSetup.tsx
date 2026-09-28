"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import {
  disableTwoFactor,
  enableTwoFactor,
  generateTwoFactorSecret,
} from "@/lib/actions/twoFactor";

/**
 * Enrol or remove an authenticator app.
 *
 * Replaces a decorative toggle that was `useState(true)` — it defaulted to
 * "on", persisted nothing and verified nothing, so the security page told
 * every user they had two-factor authentication when nobody did.
 *
 * The secret is displayed once, for apps that cannot scan, but is never sent
 * back: confirming takes only the six digits, and the server checks them
 * against the secret it already holds.
 */

type Phase = "idle" | "scanning" | "recovery" | "confirming-off";

interface TwoFactorSetupProps {
  /** Server-rendered truth, so the panel is right on first paint. */
  initialEnabled: boolean;
  label: string;
  enabledBody: string;
  disabledBody: string;
}

export default function TwoFactorSetup({
  initialEnabled,
  label,
  enabledBody,
  disabledBody,
}: TwoFactorSetupProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phase, setPhase] = useState<Phase>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);
  // Shown exactly once, straight from the action. Never refetched: the
  // server keeps only bcrypt hashes, so there is nothing to fetch.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const { update: refreshSession } = useSession();

  const reset = () => {
    setPhase("idle");
    setQr(null);
    setSecret(null);
    setCode("");
  };

  const begin = () =>
    startTransition(async () => {
      const setup = await generateTwoFactorSecret();
      if (!setup.ok) {
        toast.error(setup.message ?? "Could not start setup.");
        return;
      }
      setQr(setup.qrDataUrl ?? null);
      setSecret(setup.secret ?? null);
      setPhase("scanning");
    });

  const confirm = () =>
    startTransition(async () => {
      const result = await enableTwoFactor({ code });
      if (!result.ok) {
        toast.error(result.message);
        setCode("");
        return;
      }
      setEnabled(true);
      setCode("");
      setQr(null);
      setSecret(null);
      setRecoveryCodes(result.recoveryCodes ?? null);
      setPhase(result.recoveryCodes?.length ? "recovery" : "idle");
      // The admin gate reads a session claim; without this refresh an admin
      // who just enabled 2FA would still be bounced until their next sign-in.
      await refreshSession();
      toast.success(result.message);
    });

  const turnOff = () =>
    startTransition(async () => {
      const result = await disableTwoFactor({ code });
      if (!result.ok) {
        toast.error(result.message);
        setCode("");
        return;
      }
      setEnabled(false);
      setRecoveryCodes(null);
      reset();
      await refreshSession();
      toast.success(result.message);
    });

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCodesCopied(true);
      window.setTimeout(() => setCodesCopied(false), 2200);
    } catch {
      // Clipboard blocked; they are on screen and selectable.
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; the secret is on screen and selectable anyway.
    }
  };

  const codeInput = (onSubmit: () => void, cta: string) => (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && code.length === 6) onSubmit();
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label="6-digit code from your authenticator app"
        data-totp-input
        className="h-12 w-[132px] rounded-[13px] border border-slate-900/[.14] bg-white/80 text-center font-mono text-[18px] tracking-[.28em] tabular-nums outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/20 dark:border-white/[.14] dark:bg-white/[.06]"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || code.length !== 6}
        data-totp-confirm
        className="flex h-12 items-center justify-center gap-2 rounded-[13px] bg-blue-700 px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
      >
        {pending && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
        {cta}
      </button>
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className="h-12 px-3 text-[13px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div data-two-factor className="border-b border-slate-900/[.07] pb-[18px] dark:border-hairline">
      <div className="flex items-start justify-between gap-5">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-.025em]">
            {label}
            <span
              data-2fa-state={enabled ? "on" : "off"}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold ${
                enabled
                  ? "border-emerald-500/30 bg-emerald-500/[.1] text-emerald-700 dark:text-emerald-400"
                  : "border-slate-900/[.12] bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[.06] dark:text-slate-400"
              }`}
            >
              {enabled ? <ShieldCheck size={11} strokeWidth={2.4} /> : <ShieldOff size={11} strokeWidth={2.4} />}
              {enabled ? "On" : "Off"}
            </span>
          </span>
          <span className="mt-[5px] block max-w-[360px] text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">
            {enabled ? enabledBody : disabledBody}
          </span>
        </span>

        {phase === "idle" && (
          <button
            type="button"
            onClick={() => (enabled ? setPhase("confirming-off") : begin())}
            disabled={pending}
            data-2fa-toggle
            className={`flex h-10 flex-none items-center justify-center gap-2 rounded-[12px] px-4 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
              enabled
                ? "border border-slate-900/[.16] text-slate-700 hover:bg-slate-900/[.05] dark:border-white/[.16] dark:text-slate-200"
                : "bg-blue-700 text-white hover:bg-blue-800"
            }`}
          >
            {pending && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
            {enabled ? "Turn off" : "Enable 2FA"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {phase === "scanning" && (
          <motion.div
            key="scan"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            data-2fa-enrol
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-[18px] border border-slate-900/[.08] bg-white/60 p-4 backdrop-blur-xl dark:border-white/[.08] dark:bg-white/[.04]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {qr && (
                  <span className="flex-none self-center rounded-[14px] border border-slate-900/[.08] bg-white p-2 sm:self-start dark:border-white/10">
                    {/* A data: URI generated server-side; next/image would
                        only get in the way. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="Scan this QR code with your authenticator app" width={168} height={168} />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[.06em] text-slate-500 uppercase dark:text-slate-400">
                    <Smartphone size={13} strokeWidth={2.2} />
                    Scan, then confirm
                  </div>
                  <p className="m-0 mt-1.5 text-[12.5px] leading-[1.6] text-slate-600 dark:text-slate-300">
                    Open Google Authenticator, 1Password, or any TOTP app and scan the code. Then type the six digits it
                    shows to prove it worked — 2FA only turns on once that matches.
                  </p>

                  {secret && (
                    <div className="mt-3">
                      <div className="text-[10.5px] font-semibold tracking-[.07em] text-slate-400 uppercase dark:text-slate-500">
                        Or enter this key by hand
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <code
                          data-2fa-secret
                          className="min-w-0 flex-1 rounded-[10px] bg-slate-900/[.05] px-2.5 py-2 font-mono text-[12px] break-all dark:bg-white/[.07]"
                        >
                          {secret}
                        </code>
                        <button
                          type="button"
                          onClick={copySecret}
                          aria-label="Copy the setup key"
                          className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border border-slate-900/[.12] text-slate-500 hover:text-slate-800 dark:border-white/10 dark:text-slate-400"
                        >
                          {copied ? <Check size={14} strokeWidth={2.6} className="text-emerald-600" /> : <Copy size={14} strokeWidth={2.2} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {codeInput(confirm, "Confirm & enable")}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "recovery" && recoveryCodes && (
          <motion.div
            key="recovery"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            data-recovery-codes
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-[18px] border border-amber-500/40 bg-amber-500/[.08] p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={17} strokeWidth={2.2} className="mt-px flex-none text-amber-600 dark:text-amber-400" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-amber-900 dark:text-amber-200">
                    Save these backup codes in a secure place
                  </div>
                  <p className="m-0 mt-1 text-[12.5px] leading-[1.6] text-amber-800/90 dark:text-amber-200/80">
                    They will only be shown once. Each one works a single time, in place of your authenticator. If you
                    lose them and your device, you will be permanently locked out of this account.
                  </p>
                </div>
              </div>

              <ul
                data-recovery-list
                className="m-0 mt-3.5 grid list-none grid-cols-2 gap-1.5 rounded-[14px] bg-white/70 p-3 sm:grid-cols-5 dark:bg-black/25"
              >
                {recoveryCodes.map((rc) => (
                  <li key={rc} className="text-center font-mono text-[13px] tracking-[.06em] tabular-nums select-all">
                    {rc}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copyCodes}
                  data-copy-codes
                  className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-amber-600/40 bg-white/70 px-4 text-[13px] font-semibold text-amber-900 dark:bg-black/20 dark:text-amber-200"
                >
                  {codesCopied ? <Check size={15} strokeWidth={2.6} /> : <Copy size={15} strokeWidth={2.2} />}
                  {codesCopied ? "Copied" : "Copy all 10"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryCodes(null);
                    setPhase("idle");
                  }}
                  data-codes-saved
                  className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-amber-600 px-4 text-[13px] font-semibold text-white hover:bg-amber-700"
                >
                  <KeyRound size={15} strokeWidth={2.2} />
                  I have saved them
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "confirming-off" && (
          <motion.div
            key="off"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            data-2fa-disable
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-[18px] border border-amber-500/30 bg-amber-500/[.07] p-4">
              <p className="m-0 text-[12.5px] leading-[1.6] text-amber-900 dark:text-amber-200">
                Enter a current code to turn two-factor off. It is asked for on purpose: without it, anyone holding a
                stolen session could quietly remove your second factor.
              </p>
              {codeInput(turnOff, "Turn off 2FA")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
