"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Laptop, Loader2, Monitor, Smartphone, Tablet } from "lucide-react";
import { revokeDeviceSession, revokeOtherDeviceSessions, type SecurityState } from "@/lib/actions/security";
import type { DeviceSessionView } from "@/lib/deviceSessions";
import { useStepUp } from "./StepUp";

/**
 * The account's real signed-in devices (UserSession), as rows inside the
 * settings list. Ending a session goes through step-up; the server answers
 * with the fresh list, so the row disappears the moment it is revoked.
 */

const ROW_BTN =
  "inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-900/[.12] bg-white/70 px-3 text-[12.5px] font-semibold text-slate-800 transition-colors hover:border-red-500/40 hover:text-red-600 disabled:opacity-50 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:text-red-400";
const CHIP_OK = "inline-flex items-center rounded-full border border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] px-2 py-px text-[10.5px] font-semibold whitespace-nowrap text-[#047857] dark:text-[#34d399]";

const ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

export default function DeviceSessions({ sessions, now, onChange }: { sessions: DeviceSessionView[]; now: number; onChange: (s: SecurityState) => void }) {
  const t = useTranslations("SecurityCenter");
  const format = useFormatter();
  const { run, dialog } = useStepUp();
  const [busy, setBusy] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;

  const end = async (id: string | "others") => {
    setBusy(id);
    const result = await run(() => (id === "others" ? revokeOtherDeviceSessions() : revokeDeviceSession(id)));
    setBusy(null);
    if (!result) return;
    if (!result.ok) return void toast.error(t("errGeneric"));
    onChange(result.state);
    toast.success(id === "others" ? t("endedOthers") : t("endedOne"));
  };

  const label = (s: DeviceSessionView) => (s.browser && s.os ? t("deviceOn", { browser: s.browser, os: s.os }) : s.browser ?? s.os ?? t("unknownDevice"));
  const place = (s: DeviceSessionView) => [s.city, s.country].filter(Boolean).join(", ");

  return (
    <div data-device-sessions>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-900/[.08] bg-slate-50 text-slate-400 dark:border-white/[.08] dark:bg-white/[.03] dark:text-slate-500">
          <Laptop size={17} strokeWidth={2} />
        </span>
        <div className="min-w-[150px] flex-1">
          <span className="text-[13.5px] font-semibold tracking-[-.015em]">{t("sessionsTitle")}</span>
          <p className="m-0 mt-0.5 text-[12px] text-slate-500 dark:text-ink-muted">{t("sessionsCount", { count: sessions.length })}</p>
        </div>
        {others > 0 && (
          <button type="button" onClick={() => end("others")} disabled={busy !== null} data-sign-out-others className={ROW_BTN}>
            {busy === "others" && <Loader2 size={12} className="animate-spin" />}
            {t("endAllOthers")}
          </button>
        )}
      </div>
      <ul className="m-0 list-none p-0 pb-1.5 pl-[76px] pr-5">
        {sessions.map((s) => {
          const Icon = ICON[(s.deviceType as keyof typeof ICON) ?? "desktop"] ?? Monitor;
          return (
            <li key={s.id} data-session-row={s.id} data-current={s.current ? "1" : "0"} className="flex items-center gap-3 border-t border-slate-900/[.05] py-2 first:border-t-0 dark:border-white/[.05]">
              <Icon size={15} strokeWidth={2} className="flex-none text-slate-400 dark:text-slate-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100" data-session-name>
                    {label(s)}
                  </span>
                  {s.current && (
                    <span className={CHIP_OK} data-session-current>
                      {t("thisDevice")}
                    </span>
                  )}
                </div>
                <p className="m-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-ink-muted" data-session-meta>
                  {[s.ipAddress, place(s), s.current ? t("activeNow") : t("lastActive", { when: format.relativeTime(new Date(s.lastActiveAt), now) })].filter(Boolean).join(" · ")}
                </p>
              </div>
              {!s.current && (
                <button type="button" onClick={() => end(s.id)} disabled={busy !== null} data-session-end={s.id} className={ROW_BTN}>
                  {busy === s.id && <Loader2 size={12} className="animate-spin" />}
                  {t("end")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {dialog}
    </div>
  );
}
