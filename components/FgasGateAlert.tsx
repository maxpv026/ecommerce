"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Lock, LogIn, ShieldAlert, ShieldCheck, Upload } from "lucide-react";

export type FgasGate = "guest" | "unverified";

interface FgasGateAlertProps {
  gate: FgasGate;
  /** Tighter spacing for the mobile sticky bar. */
  compact?: boolean;
  onLogIn: () => void;
  onUpload: () => void;
}

const RISE = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const } },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
};

/**
 * Blocking notice rendered under the order total whenever checkout is
 * locked by the F-Gas rule. Guests get the sign-in / guest-upload pair on a
 * brand-blue glow; signed-in buyers without a verified certificate get the
 * amber "confirm your certificate" prompt.
 *
 * Two states, because the gate is binary: the certificate is verified or it
 * is not. There is no "with the reviewer" state to sit in — the upload comes
 * back decided. Mount inside <AnimatePresence>.
 */
export default function FgasGateAlert({ gate, compact = false, onLogIn, onUpload }: FgasGateAlertProps) {
  const t = useTranslations("Cart");
  const guest = gate === "guest";

  const shell = guest
    ? "border-blue-500/30 bg-blue-500/[.08] shadow-[0_0_38px_-12px_rgba(59,130,246,.62)] dark:bg-blue-500/10"
    : "border-amber-500/30 bg-amber-500/10 shadow-[0_0_38px_-12px_rgba(245,158,11,.7)]";
  const aura = guest ? "#60a5fa" : "#fbbf24";
  const tile = guest
    ? "bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_10px_22px_-10px_rgba(37,99,235,.85)]"
    : "bg-[linear-gradient(140deg,#f59e0b,#f97316)] shadow-[0_10px_22px_-10px_rgba(245,158,11,.85)]";
  const Icon = guest ? Lock : ShieldAlert;

  const btnBase = `inline-flex flex-none items-center justify-center gap-2 rounded-[12px] font-semibold tracking-[-.015em] transition-[background-color,box-shadow,transform] duration-200 ${
    compact ? "h-9 px-3.5 text-[12px]" : "h-10 px-4 text-[12.5px]"
  }`;

  return (
    <motion.div
      {...RISE}
      role="alert"
      data-fgas-gate={gate}
      className={`relative overflow-hidden rounded-[20px] border backdrop-blur-xl backdrop-saturate-150 ${shell} ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full opacity-40 blur-[42px] [animation:hc-breathe_6s_ease-in-out_infinite]"
        style={{ background: `radial-gradient(circle,${aura},transparent 68%)` }}
      />

      <div className={`relative flex items-start ${compact ? "gap-2.5" : "gap-3"}`}>
        <span
          className={`flex flex-none items-center justify-center rounded-[13px] text-white ${tile} ${
            compact ? "h-[34px] w-[34px]" : "h-10 w-10"
          }`}
        >
          <Icon size={compact ? 16 : 18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`m-0 font-semibold leading-[1.35] tracking-[-.02em] ${compact ? "text-[12.5px]" : "text-[13.5px]"}`}>
            {guest ? t("fgasGuestTitle") : t("fgasUnverifiedTitle")}
          </p>
          {!compact && (
            <p
              className={`mb-0 mt-1 text-[12px] leading-[1.55] ${
                guest ? "text-slate-600 dark:text-ink-muted" : "text-amber-900/75 dark:text-amber-200/70"
              }`}
            >
              {guest ? t("fgasGuestBody") : t("fgasUnverifiedBody")}
            </p>
          )}

          <div className={`flex flex-wrap ${compact ? "mt-2.5 gap-1.5" : "mt-3 gap-2"}`}>
            {guest ? (
              <>
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onLogIn}
                  data-fgas-login
                  className={`${btnBase} bg-blue-700 text-white shadow-[0_14px_28px_-14px_#1d4ed8] hover:bg-blue-800 hover:shadow-[0_18px_34px_-14px_#1d4ed8,0_0_24px_-8px_#1d4ed8]`}
                >
                  <LogIn size={14} strokeWidth={2.2} />
                  {t("fgasLogIn")}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onUpload}
                  data-fgas-upload
                  className={`${btnBase} border border-slate-900/[.14] bg-white/70 text-slate-800 hover:bg-white dark:border-hairline-strong dark:bg-white/[.05] dark:text-slate-100 dark:hover:bg-white/10`}
                >
                  <Upload size={14} strokeWidth={2.2} />
                  {t("fgasUploadGuest")}
                </motion.button>
              </>
            ) : (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={onUpload}
                data-fgas-upload
                className={`${btnBase} bg-amber-500 text-slate-950 shadow-[0_14px_28px_-14px_rgba(245,158,11,.95)] hover:bg-amber-400 hover:shadow-[0_18px_34px_-14px_rgba(245,158,11,.95),0_0_24px_-8px_#f59e0b]`}
              >
                <Upload size={14} strokeWidth={2.2} />
                {t("fgasUploadCertificate")}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface FgasVerifiedLineProps {
  certificateId?: string | null;
  /** Verified in this browser only — the buyer still has to sign in. */
  guest?: boolean;
  compact?: boolean;
}

/** Emerald confirmation shown in the alert's slot once checkout is unlocked. */
export function FgasVerifiedLine({ certificateId, guest = false, compact = false }: FgasVerifiedLineProps) {
  const t = useTranslations("Cart");
  const label = certificateId
    ? guest
      ? t("fgasGuestVerifiedLine", { certId: certificateId })
      : t("fgasVerifiedLineId", { certId: certificateId })
    : t("fgasVerifiedLine");

  return (
    <motion.div
      {...RISE}
      role="status"
      data-fgas-verified
      className={`flex w-full items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 font-semibold leading-[1.45] text-emerald-700 shadow-[0_0_24px_-8px_#34d399] backdrop-blur-xl dark:text-emerald-300 ${
        compact ? "py-2 pl-3 pr-3 text-[11px]" : "py-2.5 pl-3 pr-3.5 text-[11.5px]"
      }`}
    >
      <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-emerald-400 shadow-[0_0_8px_1px_#34d399]" />
      <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
      <span className="min-w-0 flex-1">{label}</span>
    </motion.div>
  );
}
