"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Download, Eye, EyeOff, KeyRound, Loader2, ScrollText, ShieldCheck, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { enableTwoFactor, generateTwoFactorSecret } from "@/lib/actions/twoFactor";
import { disableTwoFactorWithStepUp, removeRecoveryPhrase, setRecoveryPhrase, type SecurityState } from "@/lib/actions/security";
import { useStepUp } from "./StepUp";

/**
 * Settings → "Manage 2FA": the authenticator app and the recovery phrase.
 *
 * Turning 2FA on needs only a code from the new authenticator (as before);
 * turning it off, re-configuring it, and setting or removing the recovery
 * phrase go through step-up (components/security/StepUp) — the server
 * decides, and asks for a strong method when 2FA is on.
 */

const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10.5px] font-semibold whitespace-nowrap";
const CHIP_OK = "border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] text-[#047857] dark:text-[#34d399]";
const CHIP_WARN = "border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.14)] text-[#b45309] dark:text-[#fbbf24]";
const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 text-[13px] font-semibold text-slate-800 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]";
const PRIMARY = "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50";
const INPUT =
  "h-10 w-full rounded-[12px] border border-slate-900/[.1] bg-white px-3 text-[13px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600/50 focus:ring-2 focus:ring-blue-600/10 dark:border-white/[.1] dark:bg-white/[.03] dark:text-slate-100 dark:placeholder:text-slate-600";

type Setup = { qr: string; secret: string } | null;

export default function TwoFactorManager({ state, email, onClose, onChange }: { state: SecurityState; email: string; onClose: () => void; onChange: (s: SecurityState) => void }) {
  const t = useTranslations("SecurityCenter");
  const format = useFormatter();
  const router = useRouter();
  const { update } = useSession();
  const { run, dialog } = useStepUp();

  const [setup, setSetup] = useState<Setup>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phraseMode, setPhraseMode] = useState<"idle" | "custom">("idle");
  const [words, setWords] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [custom, setCustom] = useState({ phrase: "", confirm: "", hint: "" });
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !dialog && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dialog]);

  const after = (next: SecurityState) => {
    onChange(next);
    void update({});
    router.refresh();
  };

  // ── Authenticator ──
  const startSetup = async () => {
    setBusy("setup");
    setError(null);
    const result = await generateTwoFactorSecret().catch(() => null);
    setBusy(null);
    if (result?.ok && result.qrDataUrl && result.secret) setSetup({ qr: result.qrDataUrl, secret: result.secret });
    else setError(t("errGeneric"));
  };

  const confirmSetup = async () => {
    setBusy("enable");
    setError(null);
    const result = await enableTwoFactor({ code }).catch(() => null);
    setBusy(null);
    if (!result?.ok) {
      setError(result?.code === "LOCKED" ? t("errLocked", { minutes: 15 }) : t("errInvalid"));
      return;
    }
    setSetup(null);
    setCode("");
    setCodes(result.recoveryCodes ?? []);
    after({ ...state, twoFactor: true, recoveryCodesLeft: result.recoveryCodes?.length ?? 0 });
    toast.success(t("twoFaEnabled"));
  };

  const disable = async (thenSetup: boolean) => {
    setBusy(thenSetup ? "rotate" : "disable");
    const result = await run(() => disableTwoFactorWithStepUp());
    setBusy(null);
    if (!result) return;
    if (!result.ok) return void toast.error(t("errGeneric"));
    after(result.state);
    toast.success(thenSetup ? t("twoFaRotating") : t("twoFaDisabled"));
    if (thenSetup) await startSetup();
  };

  // ── Recovery phrase ──
  const generate = async () => {
    setBusy("generate");
    const result = await run(() => setRecoveryPhrase({ mode: "generate" }));
    setBusy(null);
    if (!result) return;
    if (!result.ok || !result.phrase) return void toast.error(t("errGeneric"));
    setWords(result.phrase);
    setSaved(false);
    onChange(result.state);
  };

  const customError =
    custom.phrase.length > 0 && custom.phrase.trim().length < 12
      ? t("errPhraseShort")
      : custom.confirm.length > 0 && custom.confirm !== custom.phrase
        ? t("errPhraseMismatch")
        : null;

  const saveCustom = async () => {
    if (customError || custom.phrase.trim().length < 12 || custom.confirm !== custom.phrase) return;
    setBusy("custom");
    const result = await run(() => setRecoveryPhrase({ mode: "custom", phrase: custom.phrase, hint: custom.hint }));
    setBusy(null);
    if (!result) return;
    if (!result.ok) return void toast.error(result.code === "HINT_REVEALS" ? t("errHintReveals") : result.code === "INVALID" ? t("errPhraseShape") : t("errGeneric"));
    setCustom({ phrase: "", confirm: "", hint: "" });
    setPhraseMode("idle");
    onChange(result.state);
    toast.success(t("phraseSaved"));
  };

  const remove = async () => {
    setBusy("remove");
    const result = await run(() => removeRecoveryPhrase());
    setBusy(null);
    if (!result) return;
    if (!result.ok) return void toast.error(t("errGeneric"));
    onChange(result.state);
    toast.success(t("phraseRemoved"));
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast.success(t("copied")));
  };
  const download = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="twofa-title"
        data-2fa-modal
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[22px] border border-slate-900/[.1] bg-white shadow-2xl dark:border-white/[.1] dark:bg-[#0E1116]"
      >
        <div className="flex items-start gap-3 border-b border-slate-900/[.08] px-5 py-4 dark:border-white/[.08]">
          <div className="min-w-0 flex-1">
            <h2 id="twofa-title" className="m-0 text-[16px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
              {t("managerTitle")}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("managerBody")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} data-2fa-close className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/[.06] dark:hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-slate-900/[.06] overflow-y-auto dark:divide-white/[.06]">
          {/* ── Authenticator app ── */}
          <Section icon={KeyRound} title={t("appTitle")} badge={<span className={`${CHIP} ${state.twoFactor ? CHIP_OK : CHIP_WARN}`} data-2fa-state={state.twoFactor ? "on" : "off"}>{state.twoFactor ? t("on") : t("off")}</span>}>
            {codes ? (
              <div data-recovery-codes>
                <p className="m-0 text-[12.5px] text-slate-600 dark:text-ink-muted">{t("codesBody")}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-900/[.08] bg-slate-50 p-3 font-mono text-[13px] sm:grid-cols-5 dark:border-white/[.08] dark:bg-white/[.03]">
                  {codes.map((c) => (
                    <span key={c} data-recovery-code>{c}</span>
                  ))}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" className={BTN} onClick={() => copy(codes.join("\n"))}>
                    <Copy size={13} /> {t("copy")}
                  </button>
                  <button type="button" className={BTN} onClick={() => download(codes.join("\n"), "my-energy-recovery-codes.txt")}>
                    <Download size={13} /> {t("download")}
                  </button>
                  <button type="button" className={BTN} onClick={() => setCodes(null)} data-codes-done>
                    <Check size={13} /> {t("done")}
                  </button>
                </div>
              </div>
            ) : setup ? (
              <div className="flex flex-col gap-3 sm:flex-row" data-2fa-setup>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL QR, nothing to optimise */}
                <img src={setup.qr} alt={t("qrAlt")} width={148} height={148} className="h-[148px] w-[148px] flex-none rounded-xl border border-slate-900/[.08] bg-white p-1.5" data-2fa-qr />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[12.5px] leading-[1.5] text-slate-600 dark:text-ink-muted">{t("setupBody")}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-900/[.08] bg-slate-50 px-2.5 py-1.5 font-mono text-[12px] tracking-wide dark:border-white/[.08] dark:bg-white/[.03]" data-2fa-secret>
                      {setup.secret}
                    </code>
                    <button type="button" className={BTN} onClick={() => copy(setup.secret)} aria-label={t("copy")}>
                      <Copy size={13} />
                    </button>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" aria-label={t("totpLabel")} data-2fa-code className={`${INPUT} max-w-[140px] font-mono tracking-[.3em]`} />
                    <button type="button" onClick={confirmSetup} disabled={code.length !== 6 || busy !== null} className={PRIMARY} data-2fa-enable>
                      {busy === "enable" && <Loader2 size={14} className="animate-spin" />}
                      {t("enable")}
                    </button>
                  </div>
                  {error && <p className="m-0 mt-1.5 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
                </div>
              </div>
            ) : state.twoFactor ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-[12.5px] text-slate-600 dark:text-ink-muted">{t("appOnBody", { count: state.recoveryCodesLeft })}</p>
                <div className="flex gap-2">
                  <button type="button" className={BTN} onClick={() => disable(true)} disabled={busy !== null} data-2fa-rotate>
                    {busy === "rotate" && <Loader2 size={13} className="animate-spin" />}
                    {t("rotate")}
                  </button>
                  <button type="button" className={`${BTN} text-red-600 dark:text-red-400`} onClick={() => disable(false)} disabled={busy !== null} data-2fa-disable>
                    {busy === "disable" && <Loader2 size={13} className="animate-spin" />}
                    {t("disable")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-[12.5px] text-slate-600 dark:text-ink-muted">{t("appOffBody")}</p>
                <button type="button" className={PRIMARY} onClick={startSetup} disabled={busy !== null} data-2fa-start>
                  {busy === "setup" && <Loader2 size={14} className="animate-spin" />}
                  {t("setUp")}
                </button>
              </div>
            )}
          </Section>

          {/* ── Recovery phrase ── */}
          <Section
            icon={ScrollText}
            title={t("phraseTitle")}
            badge={<span className={`${CHIP} ${state.phrase.set ? CHIP_OK : CHIP_WARN}`} data-phrase-state={state.phrase.set ? "set" : "none"}>{state.phrase.set ? t("phraseActive") : t("phraseMissing")}</span>}
          >
            {words ? (
              <div data-phrase-words>
                <p className="m-0 text-[12.5px] text-slate-600 dark:text-ink-muted">{t("wordsBody")}</p>
                <ol className="m-0 mt-2.5 grid list-none grid-cols-3 gap-1.5 rounded-xl border border-slate-900/[.08] bg-slate-50 p-3 font-mono text-[13px] sm:grid-cols-4 dark:border-white/[.08] dark:bg-white/[.03]">
                  {words.split(" ").map((w, i) => (
                    <li key={i} data-phrase-word>
                      <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                      {w}
                    </li>
                  ))}
                </ol>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button type="button" className={BTN} onClick={() => copy(words)}>
                    <Copy size={13} /> {t("copy")}
                  </button>
                  <button type="button" className={BTN} onClick={() => download(words, "my-energy-recovery-phrase.txt")}>
                    <Download size={13} /> {t("download")}
                  </button>
                  <label className="ml-auto inline-flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-ink-muted">
                    <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-phrase-saved />
                    {t("wordsSaved")}
                  </label>
                  <button type="button" className={PRIMARY} disabled={!saved} onClick={() => setWords(null)} data-phrase-done>
                    {t("done")}
                  </button>
                </div>
              </div>
            ) : phraseMode === "custom" ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" data-phrase-custom>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[11.5px] font-medium text-slate-500 dark:text-ink-muted">{t("customPhrase")}</span>
                  <span className="relative block">
                    <input type={show ? "text" : "password"} value={custom.phrase} onChange={(e) => setCustom((c) => ({ ...c, phrase: e.target.value }))} autoComplete="new-password" spellCheck={false} data-phrase-input className={`${INPUT} pr-10 font-mono`} />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={t("showPhrase")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400">
                      {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-slate-500 dark:text-ink-muted">{t("confirmPhrase")}</span>
                  <input type={show ? "text" : "password"} value={custom.confirm} onChange={(e) => setCustom((c) => ({ ...c, confirm: e.target.value }))} autoComplete="new-password" spellCheck={false} data-phrase-confirm className={`${INPUT} font-mono`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-slate-500 dark:text-ink-muted">{t("hintLabel")}</span>
                  <input value={custom.hint} onChange={(e) => setCustom((c) => ({ ...c, hint: e.target.value.slice(0, 80) }))} placeholder={t("hintPlaceholder")} data-phrase-hint className={INPUT} />
                </label>
                {customError && <p className="m-0 text-[12px] text-red-600 sm:col-span-2 dark:text-red-400">{customError}</p>}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="button" className={PRIMARY} onClick={saveCustom} disabled={busy !== null || Boolean(customError) || custom.phrase.trim().length < 12 || custom.confirm !== custom.phrase} data-phrase-save>
                    {busy === "custom" && <Loader2 size={14} className="animate-spin" />}
                    {t("savePhrase")}
                  </button>
                  <button type="button" className={BTN} onClick={() => setPhraseMode("idle")}>
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="m-0 text-[12.5px] leading-[1.5] text-slate-600 dark:text-ink-muted">
                  {state.phrase.set
                    ? t("phraseSetBody", { date: state.phrase.setAt ? format.dateTime(new Date(state.phrase.setAt), { dateStyle: "medium" }) : "—" })
                    : t("phraseNoneBody")}
                </p>
                {state.phrase.set && state.phrase.hint && (
                  <p className="m-0 mt-1 text-[12px] text-slate-500 dark:text-ink-muted" data-phrase-hint-shown>
                    {t("hintShown", { hint: state.phrase.hint })}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" className={PRIMARY} onClick={generate} disabled={busy !== null} data-phrase-generate>
                    {busy === "generate" && <Loader2 size={14} className="animate-spin" />}
                    {state.phrase.set ? t("regenerate") : t("generate")}
                  </button>
                  <button type="button" className={BTN} onClick={() => setPhraseMode("custom")} disabled={busy !== null} data-phrase-custom-open>
                    {t("useOwn")}
                  </button>
                  {state.phrase.set && (
                    <button type="button" className={`${BTN} text-red-600 dark:text-red-400`} onClick={remove} disabled={busy !== null} data-phrase-remove>
                      {t("removePhrase")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Section>

          <p className="m-0 flex items-start gap-2 px-5 py-3 text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">
            <ShieldCheck size={13} className="mt-[2px] flex-none" />
            {t("managerFoot", { email })}
          </p>
        </div>
      </motion.div>
      {dialog}
    </div>
  );
}

function Section({ icon: Icon, title, badge, children }: { icon: typeof KeyRound; title: string; badge: ReactNode; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-slate-900/[.08] bg-slate-50 text-slate-600 dark:border-white/[.08] dark:bg-white/[.03] dark:text-slate-300">
          <Icon size={15} />
        </span>
        <h3 className="m-0 text-[14px] font-semibold tracking-[-.015em] text-slate-900 dark:text-white">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}
