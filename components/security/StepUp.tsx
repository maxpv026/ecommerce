"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2, Lock, Mail, ShieldCheck, X } from "lucide-react";
import { getStepUpOptions, getStepUpPhraseChallenge, sendStepUpEmailCode, verifyStepUp, type StepUpOptions } from "@/lib/actions/stepUp";
import { recoveryAnswer, type RecoveryChallenge } from "@/lib/recoveryPhraseFormat";
import RecoveryPhraseInput from "./RecoveryPhraseInput";
import type { StepUpMethod } from "@/lib/stepUp";

/**
 * Step-up verification dialog + the hook that drives it.
 *
 * `run(action)` calls a protected server action; when the server answers
 * STEP_UP_REQUIRED (or _STRONG_REQUIRED) the dialog opens, and once the
 * person verifies, the action is called again. The server decides when a
 * check is due — the page never skips it.
 */

type Gated = { ok: boolean; code?: string };

export function useStepUp() {
  const [pending, setPending] = useState<{ strong: boolean; resolve: (verified: boolean) => void } | null>(null);

  const run = async <T extends Gated>(action: () => Promise<T>): Promise<T | null> => {
    const first = await action().catch(() => null);
    if (!first) return null;
    if (first.ok || (first.code !== "STEP_UP_REQUIRED" && first.code !== "STEP_UP_STRONG_REQUIRED")) return first;
    const verified = await new Promise<boolean>((resolve) => setPending({ strong: first.code === "STEP_UP_STRONG_REQUIRED", resolve }));
    if (!verified) return null;
    return action().catch(() => null);
  };

  const dialog = pending ? (
    <StepUpDialog
      strong={pending.strong}
      onClose={() => {
        pending.resolve(false);
        setPending(null);
      }}
      onVerified={() => {
        pending.resolve(true);
        setPending(null);
      }}
    />
  ) : null;

  return { run, dialog };
}

type Tab = "totp" | "email" | "secret";

const INPUT =
  "h-11 w-full rounded-[12px] border border-slate-900/[.1] bg-white px-3.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600/50 focus:ring-2 focus:ring-blue-600/10 dark:border-white/[.1] dark:bg-white/[.03] dark:text-slate-100 dark:placeholder:text-slate-600";

export function StepUpDialog({ strong, onClose, onVerified }: { strong: boolean; onClose: () => void; onVerified: () => void }) {
  const t = useTranslations("SecurityCenter");
  const [options, setOptions] = useState<StepUpOptions | null>(null);
  const [tab, setTab] = useState<Tab>("email");
  const [secretKind, setSecretKind] = useState<"password" | "phrase">("password");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [phraseChallenge, setPhraseChallenge] = useState<RecoveryChallenge | null>(null);
  const [phraseWords, setPhraseWords] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    getStepUpOptions().then((o) => {
      if (!alive || !o) return;
      setOptions(o);
      // Strong checks offer only the factors that prove the second factor.
      setTab(o.totp ? "totp" : strong ? "secret" : "email");
      setSecretKind(strong || !o.password ? "phrase" : "password");
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [strong, onClose]);

  // Focus follows the method; the input itself is cleared by the switch below.
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [tab, secretKind, sent]);

  const usingPhrase = tab === "secret" && secretKind === "phrase" && Boolean(options?.phrase);
  // The phrase tab asks the server what to ask: word positions (a signed,
  // single-use challenge) or the passphrase with its hint.
  useEffect(() => {
    if (!usingPhrase || phraseChallenge) return;
    let alive = true;
    getStepUpPhraseChallenge()
      .catch(() => null)
      .then((c) => alive && setPhraseChallenge(c ?? { type: "NONE" }));
    return () => {
      alive = false;
    };
  }, [usingPhrase, phraseChallenge]);

  const switchTo = (next: { tab?: Tab; kind?: "password" | "phrase" }) => {
    setValue("");
    setPhraseWords([]);
    setError(null);
    if (next.tab) setTab(next.tab);
    if (next.kind) setSecretKind(next.kind);
  };

  const tabs: Array<{ key: Tab; label: string; icon: typeof Mail; show: boolean }> = [
    { key: "totp", label: t("tabTotp"), icon: KeyRound, show: Boolean(options?.totp) },
    { key: "email", label: t("tabEmail"), icon: Mail, show: Boolean(options?.email) && !strong },
    { key: "secret", label: strong ? t("tabPhrase") : t("tabSecret"), icon: Lock, show: Boolean(options && ((options.password && !strong) || options.phrase)) },
  ];
  const visible = tabs.filter((x) => x.show);

  const method: StepUpMethod = tab === "totp" ? "totp" : tab === "email" ? "email" : secretKind;

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const result = await sendStepUpEmailCode().catch(() => null);
    setBusy(false);
    if (result?.ok) setSent(true);
    else setError(t("errSend"));
  };

  const secret = method === "phrase" ? recoveryAnswer(phraseChallenge, phraseWords, value) : value.trim() ? value : null;

  const submit = async () => {
    if (!secret || busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyStepUp({ method, secret }).catch(() => null);
    setBusy(false);
    if (result?.ok) return onVerified();
    setError(
      result?.code === "LOCKED"
        ? t("errLocked", { minutes: result.retryAfterMinutes ?? 15 })
        : result?.code === "RATE_LIMITED"
          ? t("errRateLimited")
          : t("errInvalid")
    );
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        // Rendered inside other dialogs: a backdrop click must not reach theirs.
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-up-title"
        data-step-up-dialog
        data-strong={strong ? "1" : "0"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[22px] border border-slate-900/[.1] bg-white p-5 shadow-2xl dark:border-white/[.1] dark:bg-[#0E1116]"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-blue-600/20 bg-blue-600/[.07] text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/[.1] dark:text-blue-300">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="step-up-title" className="m-0 text-[16px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
              {t("stepUpTitle")}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{strong ? t("stepUpStrongBody") : t("stepUpBody")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/[.06] dark:hover:text-white">
            <X size={16} />
          </button>
        </div>

        {!options ? (
          <div className="flex h-32 items-center justify-center text-slate-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="m-0 mt-5 text-[13px] text-slate-600 dark:text-ink-muted" data-step-up-none>
            {t("stepUpNoMethod")}
          </p>
        ) : (
          <>
            <div role="tablist" className="mt-4 grid gap-1 rounded-full border border-slate-900/[.1] bg-slate-50 p-0.5 dark:border-white/[.12] dark:bg-white/[.05]" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
              {visible.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  data-step-up-tab={key}
                  onClick={() => switchTo({ tab: key })}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2 text-[12px] font-semibold transition-colors ${
                    tab === key ? "bg-white text-slate-900 shadow-sm dark:bg-white/[.14] dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-ink-muted dark:hover:text-slate-100"
                  }`}
                >
                  <Icon size={12} strokeWidth={2.2} className="flex-none" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            <form
              className="mt-4 flex flex-col gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {tab === "totp" && (
                <Field label={t("totpLabel")} hint={t("totpHint")}>
                  <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value.replace(/\s/g, "").slice(0, 8))} inputMode="text" autoComplete="one-time-code" placeholder="123 456" data-step-up-input className={`${INPUT} font-mono tracking-[.3em]`} />
                </Field>
              )}
              {tab === "email" && (
                <>
                  <button type="button" onClick={sendCode} disabled={busy} data-step-up-send-email className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-900/[.12] text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]">
                    <Mail size={14} />
                    {sent ? t("emailResend") : t("emailSend", { email: options.email ?? "" })}
                  </button>
                  {sent && (
                    <Field label={t("emailCodeLabel")} hint={t("emailSentTo", { email: options.email ?? "" })}>
                      <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" data-step-up-input className={`${INPUT} font-mono tracking-[.3em]`} />
                    </Field>
                  )}
                </>
              )}
              {tab === "secret" && (
                <>
                  {options.password && options.phrase && !strong && (
                    <div className="inline-flex gap-1 self-start rounded-full border border-slate-900/[.1] bg-slate-50 p-0.5 dark:border-white/[.12] dark:bg-white/[.05]">
                      {(["password", "phrase"] as const).map((k) => (
                        <button key={k} type="button" data-step-up-secret={k} onClick={() => switchTo({ kind: k })} className={`h-7 rounded-full px-2.5 text-[12px] font-semibold ${secretKind === k ? "bg-white text-slate-900 shadow-sm dark:bg-white/[.14] dark:text-white" : "text-slate-500 dark:text-ink-muted"}`}>
                          {k === "password" ? t("secretPassword") : t("secretPhrase")}
                        </button>
                      ))}
                    </div>
                  )}
                  {secretKind === "phrase" ? (
                    <RecoveryPhraseInput challenge={phraseChallenge} words={phraseWords} onWords={setPhraseWords} phrase={value} onPhrase={setValue} />
                  ) : (
                    <Field label={t("passwordLabel")}>
                      <input ref={inputRef} type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="current-password" data-step-up-input className={INPUT} />
                    </Field>
                  )}
                </>
              )}

              {error && (
                <p className="m-0 text-[12px] font-medium text-red-600 dark:text-red-400" data-step-up-error>
                  {error}
                </p>
              )}

              {(tab !== "email" || sent) && (
                <button type="submit" disabled={busy || !secret} data-step-up-submit className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {t("verify")}
                </button>
              )}
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-slate-500 dark:text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-[1.45] text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

