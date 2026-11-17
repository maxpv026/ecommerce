"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, ScanFace, ShieldCheck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { getAdminUnlockOptions, unlockAdmin, type AdminUnlockOptions } from "@/lib/actions/adminUnlock";
import { passkeysSupported, runPasskeyAssertion } from "@/lib/passkeyClient";

/**
 * "Confirm it's you" before /admin, for a staff session that signed in with
 * a weak second factor (lib/authStrength). Face ID / Touch ID is the primary
 * action, its challenge prepared on mount so one scan unlocks; the
 * authenticator code below submits itself on the sixth digit.
 */
export default function AdminUnlock({ destination }: { destination: string }) {
  const t = useTranslations("AdminUnlock");
  const tPasskey = useTranslations("Passkeys");
  const router = useRouter();
  const [options, setOptions] = useState<AdminUnlockOptions | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    let alive = true;
    void getAdminUnlockOptions()
      .catch(() => null)
      .then((o) => alive && setOptions(o));
    return () => {
      alive = false;
    };
  }, [round]);

  const done = () => {
    router.replace(destination);
    router.refresh();
  };

  const withPasskey = async () => {
    if (!options?.passkey || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const outcome = await runPasskeyAssertion(options.passkey);
    if (!outcome.ok) {
      lock.current = false;
      setBusy(false);
      setError(outcome.cancelled ? tPasskey("cancelled") : t("invalid"));
      setRound((n) => n + 1);
      return;
    }
    const result = await unlockAdmin({ method: "passkey", secret: outcome.json }).catch(() => null);
    lock.current = false;
    if (result?.ok) return done();
    setBusy(false);
    setError(t("invalid"));
    setRound((n) => n + 1);
  };

  const withCode = async (typed: string) => {
    if (lock.current || typed.length !== 6) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const result = await unlockAdmin({ method: "totp", secret: typed }).catch(() => null);
    lock.current = false;
    if (result?.ok) return done();
    setBusy(false);
    setCode("");
    setError(result && !result.ok && result.code === "LOCKED" ? t("locked", { minutes: result.retryAfterMinutes ?? 15 }) : t("invalid"));
    window.setTimeout(() => codeRef.current?.focus(), 50);
  };

  const passkeyHere = Boolean(options?.passkey) && passkeysSupported();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-10 dark:bg-canvas" data-admin-unlock>
      <div className="w-full max-w-[400px] rounded-[24px] border border-slate-900/[.08] bg-white p-7 shadow-[0_30px_70px_-34px_rgba(15,23,42,.45)] dark:border-white/[.08] dark:bg-slate-900">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B1020] text-white dark:bg-white dark:text-slate-900">
          <ShieldCheck size={21} strokeWidth={1.9} />
        </span>
        <h1 className="m-0 text-[22px] font-semibold tracking-[-.03em] text-slate-900 dark:text-white">{t("title")}</h1>
        <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-slate-600 dark:text-slate-400">{t("body")}</p>

        {!options ? (
          <div className="flex h-28 items-center justify-center text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {passkeyHere && (
              <button
                type="button"
                onClick={withPasskey}
                disabled={busy}
                data-admin-unlock-passkey
                className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 px-4 py-2 text-[15px] leading-tight font-semibold text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,.7)] transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {busy ? <Loader2 size={18} className="flex-none animate-spin" /> : <ScanFace size={19} strokeWidth={1.9} className="flex-none" />}
                {/* Wraps rather than truncating: "…Face ID / Touch ID" is long in most languages. */}
                <span className="text-center">{t("passkeyButton")}</span>
              </button>
            )}
            {passkeyHere && options.totp && (
              <div className="flex items-center gap-3 text-[11.5px] font-medium text-slate-500 dark:text-slate-400" aria-hidden>
                <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
                {t("or")}
                <span className="h-px flex-1 bg-slate-900/10 dark:bg-white/10" />
              </div>
            )}
            {options.totp && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">{t("codeLabel")}</span>
                <input
                  ref={codeRef}
                  value={code}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(next);
                    if (error) setError(null);
                    if (next.length === 6) void withCode(next);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={busy}
                  aria-invalid={error ? true : undefined}
                  placeholder="000000"
                  data-admin-unlock-code
                  className={`h-12 rounded-xl border bg-white text-center font-mono text-[20px] tracking-[.3em] text-slate-900 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 disabled:opacity-60 dark:bg-slate-950 dark:text-slate-50 ${
                    error ? "border-red-500/70" : "border-slate-900/[.16] focus:border-blue-600 dark:border-white/[.16]"
                  }`}
                />
              </label>
            )}
            {!passkeyHere && !options.totp && (
              <p className="m-0 rounded-xl border border-amber-500/30 bg-amber-500/[.07] px-3.5 py-3 text-[12.5px] leading-[1.5] text-amber-900 dark:text-amber-200" data-admin-unlock-elsewhere>
                {t("elsewhere")}
              </p>
            )}
            {error && (
              <p role="alert" className="m-0 text-[12.5px] font-medium text-red-600 dark:text-red-400" data-admin-unlock-error>
                {error}
              </p>
            )}
          </div>
        )}

        <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft size={14} />
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
