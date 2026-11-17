"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, ScanFace, Trash2 } from "lucide-react";
import { finishPasskeyEnrolment, removePasskey, startPasskeyEnrolment, type PasskeyEnrolStart, type SecurityResult, type SecurityState } from "@/lib/actions/security";
import { platformPasskeyAvailable, runPasskeyRegistration } from "@/lib/passkeyClient";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

type Run = <T extends { ok: boolean; code?: string }>(action: () => Promise<T>) => Promise<T | null>;

const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-900/[.12] px-3 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]";
const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200";

/** How long after the tap a browser still counts the prompt as user-initiated (Safari is the strictest). */
const GESTURE_WINDOW_MS = 1000;

/**
 * Face ID / Touch ID / Windows Hello passkeys in the 2FA manager.
 *
 * Adding one: a strong identity check (the server decides — useStepUp
 * retries), then the device's own biometric sheet, then the server verifies
 * and stores it (lib/passkeys). If the check and the round trip took longer
 * than the browser's gesture window, the prepared options are kept and the
 * button asks for one more tap instead of failing as "cancelled".
 */
export default function PasskeysSection({ state, run, onState }: { state: SecurityState; run: Run; onState: (next: SecurityState) => void }) {
  const t = useTranslations("Passkeys");
  const format = useFormatter();
  const [busy, setBusy] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const prepared = useRef<PublicKeyCredentialCreationOptionsJSON | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void platformPasskeyAvailable().then((ok) => alive && setSupported(ok));
    return () => {
      alive = false;
    };
  }, []);

  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });

  const register = async (options: PublicKeyCredentialCreationOptionsJSON) => {
    prepared.current = null;
    setReady(false);
    const reg = await runPasskeyRegistration(options);
    if (!reg.ok) {
      toast.error(reg.duplicate ? t("duplicate") : reg.cancelled ? t("cancelled") : t("failed"));
      return;
    }
    const done: SecurityResult = await finishPasskeyEnrolment(reg.response).catch(() => ({ ok: false, code: "FAILED" }) as const);
    if (!done.ok) {
      toast.error(done.code === "DUPLICATE" ? t("duplicate") : t("failed"));
      return;
    }
    onState(done.state);
    toast.success(t("added"));
  };

  const add = async () => {
    if (busy) return;
    setBusy("add");
    try {
      if (prepared.current) return await register(prepared.current);
      const clicked = Date.now();
      const start: PasskeyEnrolStart | null = await run(() => startPasskeyEnrolment());
      if (!start) return; // the identity check was dismissed
      if (!start.ok) {
        toast.error(start.code === "UNSUPPORTED_HOST" ? t("unsupported") : t("failed"));
        return;
      }
      if (Date.now() - clicked <= GESTURE_WINDOW_MS) return await register(start.options);
      // Too long since the tap for a strict browser: one more tap starts the prompt.
      prepared.current = start.options;
      setReady(true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(id);
    const result = await run(() => removePasskey(id));
    setBusy(null);
    if (!result) return;
    if (!result.ok) return void toast.error(t("failed"));
    onState(result.state);
    toast.success(t("removed"));
  };

  return (
    <section className="px-5 py-4" data-passkeys>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-slate-900/[.08] bg-slate-50 text-slate-600 dark:border-white/[.08] dark:bg-white/[.03] dark:text-slate-300">
          <ScanFace size={15} />
        </span>
        <h3 className="m-0 text-[14px] font-semibold tracking-[-.015em] text-slate-900 dark:text-white">{t("title")}</h3>
      </div>
      <p className="m-0 mb-3 text-[12.5px] leading-[1.5] text-slate-600 dark:text-ink-muted">{t("subtitle")}</p>

      {state.passkeys.length === 0 ? (
        <p className="m-0 mb-3 text-[12.5px] text-slate-500 dark:text-ink-muted" data-passkeys-empty>
          {t("empty")}
        </p>
      ) : (
        <ul className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
          {state.passkeys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 rounded-xl border border-slate-900/[.08] px-3 py-2.5 dark:border-white/[.1]" data-passkey-row={k.id} data-passkey-here={k.here ? "1" : "0"}>
              <ScanFace size={17} strokeWidth={1.8} className={`flex-none ${k.here ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{k.name}</div>
                <div className="mt-0.5 text-[11.5px] leading-[1.45] text-slate-500 dark:text-ink-muted">
                  {t("createdAt", { date: date(k.createdAt) })} · {k.lastUsedAt ? t("lastUsed", { date: date(k.lastUsedAt) }) : t("neverUsed")}
                  {!k.here && <span className="block">{t("otherDomain", { domain: k.rpId })}</span>}
                </div>
              </div>
              <button type="button" className={BTN} onClick={() => remove(k.id)} disabled={busy !== null} data-passkey-remove={k.id}>
                {busy === k.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported === false || !state.passkeyDomain ? (
        <p className="m-0 text-[12px] text-slate-500 dark:text-ink-muted" data-passkeys-unsupported>
          {t("unsupported")}
        </p>
      ) : (
        <>
          <button type="button" className={PRIMARY} onClick={add} disabled={busy !== null || supported === null} data-passkey-add data-ready={ready ? "1" : "0"}>
            {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : ready ? <ScanFace size={15} /> : <Plus size={15} />}
            {busy === "add" ? t("adding") : t("add")}
          </button>
          <p className="m-0 mt-2 text-[11.5px] leading-[1.45] text-slate-500 dark:text-ink-muted">{t("domainNote", { domain: state.passkeyDomain })}</p>
        </>
      )}
    </section>
  );
}
