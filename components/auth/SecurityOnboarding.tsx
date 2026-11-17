"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Loader2, ScanFace, ShieldCheck } from "lucide-react";
import { enableTwoFactor, generateTwoFactorSecret } from "@/lib/actions/twoFactor";
import { finishPasskeyEnrolment, startPasskeyEnrolment } from "@/lib/actions/security";
import { platformPasskeyAvailable, runPasskeyRegistration } from "@/lib/passkeyClient";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

/**
 * "Secure your account" — shown right after registration, in place of
 * closing the modal (useAuthFlow step "secure"). Two optional cards and a
 * way out; nothing here blocks shopping.
 *
 * - Face ID / Touch ID: the account is minutes old with no passkey, so the
 *   server issues enrolment options without an identity check
 *   (lib/actions/security freshAccountFirstPasskey). They're fetched on
 *   mount, so the tap goes straight to the system prompt (Safari needs that).
 * - Authenticator app: QR + key, a code field that submits itself on the
 *   sixth digit, then the recovery codes — the same actions as Settings.
 */
export default function SecurityOnboarding({ onDone }: { onDone: () => void }) {
  const t = useTranslations("SecurityOnboarding");
  const tPasskey = useTranslations("Passkeys");
  const { update } = useSession();

  // ── Face ID / Touch ID ──
  const [platform, setPlatform] = useState<boolean | null>(null);
  const [passkeyOptions, setPasskeyOptions] = useState<PublicKeyCredentialCreationOptionsJSON | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyOn, setPasskeyOn] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyRound, setPasskeyRound] = useState(0);

  useEffect(() => {
    let alive = true;
    void platformPasskeyAvailable().then(async (ok) => {
      if (!alive) return;
      setPlatform(ok);
      if (!ok) return;
      const start = await startPasskeyEnrolment().catch(() => null);
      if (alive && start?.ok) setPasskeyOptions(start.options);
    });
    return () => {
      alive = false;
    };
  }, [passkeyRound]);

  const enablePasskey = async () => {
    if (!passkeyOptions || passkeyBusy) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    const reg = await runPasskeyRegistration(passkeyOptions);
    setPasskeyOptions(null);
    if (!reg.ok) {
      setPasskeyBusy(false);
      setPasskeyError(reg.duplicate ? tPasskey("duplicate") : reg.cancelled ? tPasskey("cancelled") : t("failed"));
      setPasskeyRound((n) => n + 1);
      return;
    }
    const done = await finishPasskeyEnrolment(reg.response).catch(() => null);
    setPasskeyBusy(false);
    if (!done?.ok) {
      setPasskeyError(t("failed"));
      setPasskeyRound((n) => n + 1);
      return;
    }
    setPasskeyOn(true);
    void update({});
  };

  // ── Authenticator app ──
  const [totpOpen, setTotpOpen] = useState(false);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [totpOn, setTotpOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const lock = useRef(false);

  const openTotp = async () => {
    setTotpOpen(true);
    if (setup) return;
    setTotpBusy(true);
    const result = await generateTwoFactorSecret().catch(() => null);
    setTotpBusy(false);
    if (result?.ok && result.qrDataUrl && result.secret) setSetup({ qr: result.qrDataUrl, secret: result.secret });
    else setTotpError(t("failed"));
  };

  const submitCode = async (typed: string) => {
    if (lock.current || typed.length !== 6) return;
    lock.current = true;
    setTotpBusy(true);
    setTotpError(null);
    const result = await enableTwoFactor({ code: typed }).catch(() => null);
    lock.current = false;
    setTotpBusy(false);
    if (!result?.ok) {
      setTotpError(t("totpInvalid"));
      setCode("");
      window.setTimeout(() => codeRef.current?.focus(), 50);
      return;
    }
    setTotpOn(true);
    setRecovery(result.recoveryCodes ?? []);
    void update({});
  };

  const copyCodes = async () => {
    if (!recovery) return;
    try {
      await navigator.clipboard.writeText(recovery.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the codes are on screen and selectable.
    }
  };

  const anyOn = passkeyOn || totpOn;
  const CARD = "rounded-[18px] border p-4 text-left";
  const DONE = "inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300";

  return (
    <div className="flex flex-col gap-4" data-security-onboarding>
      <div className="text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300">
          <ShieldCheck size={22} strokeWidth={1.9} />
        </span>
        <h2 className="m-0 text-[22px] font-semibold tracking-[-.03em]">{t("title")}</h2>
        <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-slate-600 dark:text-slate-400">{t("subtitle")}</p>
      </div>

      {/* Face ID / Touch ID — the recommended card */}
      <div className={`${CARD} border-blue-600/30 bg-blue-600/[.04] dark:border-blue-400/30 dark:bg-blue-400/[.06]`} data-onboarding-passkey>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <ScanFace size={18} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14.5px] font-semibold tracking-[-.015em]">{t("passkeyTitle")}</span>
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.06em] text-white dark:bg-blue-500">{t("recommended")}</span>
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-slate-600 dark:text-slate-400">{t("passkeyBody")}</p>
          </div>
        </div>
        <div className="mt-3">
          {passkeyOn ? (
            <span className={DONE} data-onboarding-passkey-on>
              <Check size={13} strokeWidth={2.6} />
              {t("passkeyDone")}
            </span>
          ) : platform === false ? (
            <p className="m-0 text-[12px] text-slate-500 dark:text-slate-400">{t("passkeyUnsupported")}</p>
          ) : (
            <button
              type="button"
              onClick={enablePasskey}
              disabled={passkeyBusy || !passkeyOptions}
              data-onboarding-passkey-button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[14px] leading-tight font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {passkeyBusy || !passkeyOptions ? <Loader2 size={16} className="flex-none animate-spin" /> : <ScanFace size={17} className="flex-none" />}
              <span className="text-center">{t("passkeyButton")}</span>
            </button>
          )}
          {passkeyError && <p className="m-0 mt-2 text-[12px] font-medium text-red-600 dark:text-red-400">{passkeyError}</p>}
        </div>
      </div>

      {/* Authenticator app */}
      <div className={`${CARD} border-slate-900/[.1] dark:border-white/[.12]`} data-onboarding-totp>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-900/[.1] text-slate-700 dark:border-white/[.14] dark:text-slate-200">
            <KeyRound size={17} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold tracking-[-.015em]">{t("totpTitle")}</div>
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-slate-600 dark:text-slate-400">{t("totpBody")}</p>
          </div>
        </div>
        <div className="mt-3">
          {totpOn ? (
            <div className="flex flex-col gap-2.5">
              <span className={`${DONE} self-start`} data-onboarding-totp-on>
                <Check size={13} strokeWidth={2.6} />
                {t("totpDone")}
              </span>
              {recovery && recovery.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-3" data-onboarding-recovery>
                  <div className="text-[12.5px] font-semibold">{t("recoveryTitle")}</div>
                  <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-slate-600 dark:text-slate-400">{t("recoveryBody")}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[12.5px] tabular-nums">
                    {recovery.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                  <button type="button" onClick={copyCodes} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-700 hover:underline dark:text-blue-300">
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? t("copied") : t("copy")}
                  </button>
                </div>
              )}
            </div>
          ) : !totpOpen ? (
            <button
              type="button"
              onClick={openTotp}
              data-onboarding-totp-button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-900/[.14] px-4 py-2 text-center text-[13.5px] font-semibold text-slate-800 transition-colors hover:bg-slate-900/[.04] dark:border-white/[.16] dark:text-slate-100 dark:hover:bg-white/[.06]"
            >
              <KeyRound size={15} className="flex-none" />
              <span>{t("totpButton")}</span>
            </button>
          ) : !setup ? (
            <div className="flex h-24 items-center justify-center text-slate-400">{totpBusy ? <Loader2 size={18} className="animate-spin" /> : null}</div>
          ) : (
            <div className="flex flex-col items-center gap-2.5" data-onboarding-totp-setup>
              <p className="m-0 text-center text-[12.5px] leading-[1.45] text-slate-600 dark:text-slate-400">{t("totpScan")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL QR, nothing to optimise */}
              <img src={setup.qr} alt="" width={168} height={168} className="rounded-xl border border-slate-900/[.08] bg-white p-1.5" />
              <div className="w-full text-center">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{t("totpManual")}</div>
                <code className="mt-0.5 block break-all font-mono text-[12px] text-slate-800 dark:text-slate-200" data-onboarding-totp-secret>
                  {setup.secret}
                </code>
              </div>
              <label className="flex w-full flex-col items-center gap-1.5">
                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">{t("totpCodeLabel")}</span>
                <input
                  ref={codeRef}
                  value={code}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(next);
                    if (totpError) setTotpError(null);
                    // The sixth digit submits — no button.
                    if (next.length === 6) void submitCode(next);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={totpBusy}
                  aria-invalid={totpError ? true : undefined}
                  placeholder="000000"
                  data-onboarding-totp-code
                  className={`h-12 w-[168px] rounded-xl border bg-white text-center font-mono text-[20px] tracking-[.3em] text-slate-900 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-50 ${
                    totpError ? "border-red-500/70" : "border-slate-900/[.16] focus:border-blue-600 dark:border-white/[.16]"
                  }`}
                />
              </label>
            </div>
          )}
          {totpError && <p className="m-0 mt-2 text-center text-[12px] font-medium text-red-600 dark:text-red-400">{totpError}</p>}
        </div>
      </div>

      {anyOn && (
        <button
          type="button"
          onClick={onDone}
          data-onboarding-continue
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-700 text-[15px] font-semibold text-white shadow-[0_18px_38px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800"
        >
          {t("continue")}
        </button>
      )}
      <button type="button" onClick={onDone} data-onboarding-skip className="mx-auto px-2 py-1 text-center text-[12.5px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100">
        {t("skip")}
      </button>
    </div>
  );
}
