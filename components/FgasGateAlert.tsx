"use client";

import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Clock, Lock, LogIn, ShieldAlert, ShieldCheck, ShieldX, Upload } from "lucide-react";
import type { FgasSummary } from "@/lib/fgas";

/**
 * Why checkout is locked by the F-Gas rule — shown only when the basket holds
 * a fluorinated gas (lib/fgasSubstances). Five states, each with its own
 * words and action:
 *
 *   guest       sign in (a certificate is verified against an account)
 *   unverified  no certificate yet → upload
 *   pending     with a compliance specialist → wait (or upload another)
 *   rejected    refused, with the reason → upload another
 *   expired     lapsed on <date> → upload the renewed one
 *
 * Mount inside <AnimatePresence>.
 */
export type FgasGate = "guest" | "unverified" | "pending" | "rejected" | "expired";

export function fgasGateFor(signedIn: boolean | null, fgas: FgasSummary | null): FgasGate | null {
  if (signedIn === null) return null;
  if (!signedIn) return "guest";
  switch (fgas?.status ?? "NONE") {
    case "VERIFIED":
      return null;
    case "PENDING_REVIEW":
      return "pending";
    case "REJECTED":
      return "rejected";
    case "EXPIRED":
      return "expired";
    default:
      return "unverified";
  }
}

const RISE = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const } },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
};

const STYLE: Record<FgasGate, { shell: string; tile: string; Icon: typeof Lock }> = {
  guest: { shell: "border-blue-500/30 bg-blue-500/[.07]", tile: "bg-blue-700", Icon: Lock },
  unverified: { shell: "border-amber-500/30 bg-amber-500/10", tile: "bg-amber-500", Icon: ShieldAlert },
  pending: { shell: "border-[#3b6fd8]/30 bg-[#3b6fd8]/[.07]", tile: "bg-[#3b6fd8]", Icon: Clock },
  rejected: { shell: "border-red-500/30 bg-red-500/[.07]", tile: "bg-red-600", Icon: ShieldX },
  expired: { shell: "border-orange-500/35 bg-orange-500/[.08]", tile: "bg-orange-600", Icon: ShieldAlert },
};

export default function FgasGateAlert({
  gate,
  fgas = null,
  compact = false,
  onLogIn,
  onUpload,
}: {
  gate: FgasGate;
  fgas?: FgasSummary | null;
  /** Tighter spacing for the mobile sticky bar. */
  compact?: boolean;
  onLogIn: () => void;
  onUpload: () => void;
}) {
  const t = useTranslations("FgasGate");
  const format = useFormatter();
  const { shell, tile, Icon } = STYLE[gate];
  const expiry = fgas?.expiresAt ? format.dateTime(new Date(fgas.expiresAt), { dateStyle: "long", timeZone: "UTC" }) : "—";
  const body = gate === "expired" ? t("expiredBody", { date: expiry }) : t(`${gate}Body`);
  const btn = `inline-flex flex-none items-center justify-center gap-2 rounded-[12px] font-semibold tracking-[-.015em] transition-colors ${compact ? "h-9 px-3.5 text-[12px]" : "h-10 px-4 text-[12.5px]"}`;

  return (
    <motion.div {...RISE} role="alert" data-fgas-gate={gate} className={`relative overflow-hidden rounded-[20px] border ${shell} ${compact ? "p-3" : "p-4"}`}>
      <div className={`flex items-start ${compact ? "gap-2.5" : "gap-3"}`}>
        <span className={`flex flex-none items-center justify-center rounded-[12px] text-white ${tile} ${compact ? "h-[34px] w-[34px]" : "h-10 w-10"}`}>
          <Icon size={compact ? 16 : 18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`m-0 font-semibold leading-[1.35] tracking-[-.02em] ${compact ? "text-[12.5px]" : "text-[13.5px]"}`}>{t(`${gate}Title`)}</p>
          {!compact && <p className="mb-0 mt-1 text-[12px] leading-[1.55] text-slate-600 dark:text-ink-muted">{body}</p>}
          {!compact && (gate === "rejected" || gate === "pending") && fgas?.reason && (
            <p className="mb-0 mt-2 rounded-[10px] bg-white/60 px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-slate-700 dark:bg-white/[.05] dark:text-slate-200" data-fgas-gate-reason>
              {fgas.reason}
            </p>
          )}
          <div className={`flex flex-wrap ${compact ? "mt-2.5 gap-1.5" : "mt-3 gap-2"}`}>
            {gate === "guest" ? (
              <button type="button" onClick={onLogIn} data-fgas-login className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>
                <LogIn size={14} strokeWidth={2.2} />
                {t("signIn")}
              </button>
            ) : (
              <button
                type="button"
                onClick={onUpload}
                data-fgas-upload
                className={`${btn} ${gate === "pending" ? "border border-slate-900/[.14] bg-white/70 text-slate-800 hover:bg-white dark:border-white/[.14] dark:bg-white/[.05] dark:text-slate-100 dark:hover:bg-white/[.1]" : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"}`}
              >
                <Upload size={14} strokeWidth={2.2} />
                {t(gate === "expired" ? "uploadRenewed" : gate === "unverified" ? "upload" : "uploadAnother")}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Emerald confirmation in the alert's slot once F-Gas checkout is unlocked. */
export function FgasVerifiedLine({ fgas, compact = false }: { fgas?: FgasSummary | null; compact?: boolean }) {
  const t = useTranslations("FgasGate");
  const format = useFormatter();
  const number = fgas?.certificateNumber;
  const until = fgas?.expiresAt ? format.dateTime(new Date(fgas.expiresAt), { dateStyle: "medium", timeZone: "UTC" }) : null;
  const label = number && until ? t("verifiedLineUntil", { certId: number, date: until }) : number ? t("verifiedLineId", { certId: number }) : t("verifiedLine");
  return (
    <motion.div
      {...RISE}
      role="status"
      data-fgas-verified
      className={`flex w-full items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 font-semibold leading-[1.45] text-emerald-700 dark:text-emerald-300 ${compact ? "px-3 py-2 text-[11px]" : "py-2.5 pl-3 pr-3.5 text-[11.5px]"}`}
    >
      <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
      <span className="min-w-0 flex-1">{label}</span>
    </motion.div>
  );
}
