"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { BellRing, Check, Loader2, PackageX } from "lucide-react";
import { isValidEmail, type WaitlistResponse } from "@/lib/waitlist";

// Back-in-stock waitlist pieces, split so the grid card stays uniform.
//
//   OutOfStockNotice — the crimson unavailability banner
//   WaitlistForm     — the subscribe form (one-tap when signed in)
//   StockNotifyBlock — notice + form together
//
// The product LIST cards deliberately render none of this inline: an
// out-of-stock card there is structurally identical to an in-stock one and
// opens StockNotifyModal instead. The full inline treatment is reserved for
// the product detail page, where there is no grid row to keep square.

type Phase = "idle" | "saving" | "done" | "error";

const EASE = [0.16, 1, 0.3, 1] as const;

interface SizedProps {
  /** Tighter type and controls, for constrained surfaces. */
  compact?: boolean;
  className?: string;
}

/** Crimson glass banner: this product simply cannot be bought right now. */
export function OutOfStockNotice({ compact = false, className = "" }: SizedProps) {
  const t = useTranslations("Products");
  return (
    <div
      role="status"
      data-oos-notice
      className={`relative overflow-hidden rounded-[14px] border border-red-500/35 bg-red-500/[.10] shadow-[0_0_28px_-12px_rgba(239,68,68,.75)] backdrop-blur-xl backdrop-saturate-150 ${
        compact ? "px-2.5 py-2" : "px-3.5 py-3"
      } ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[radial-gradient(circle,#f87171,transparent_68%)] opacity-40 blur-[34px]"
      />
      <div className={`relative flex items-start ${compact ? "gap-1.5" : "gap-2"}`}>
        <PackageX size={compact ? 13 : 15} strokeWidth={2.2} className="mt-[1px] flex-none text-red-600 dark:text-red-400" />
        <p className={`m-0 font-semibold leading-[1.4] text-red-700 dark:text-red-300 ${compact ? "text-[10.5px]" : "text-[12.5px]"}`}>
          {t("outOfStockNotice")}
        </p>
      </div>
    </div>
  );
}

interface WaitlistFormProps extends SizedProps {
  /** Prisma Product.id — what /api/waitlist files the subscription against. */
  productId: string;
  /** Called once the subscription is saved (the modal uses it to auto-close). */
  onSubscribed?: () => void;
  /** Focus the address field on mount — the modal wants this, the page doesn't. */
  autoFocus?: boolean;
}

/**
 * The subscribe form itself: one tap for a signed-in buyer, a compact
 * address field for a guest, an emerald confirmation on success.
 */
export function WaitlistForm({
  productId,
  compact = false,
  className = "",
  onSubscribed,
  autoFocus = false,
}: WaitlistFormProps) {
  const locale = useLocale();
  const t = useTranslations("Products");
  const { data: session, status: sessionStatus } = useSession();
  const sessionEmail = session?.user?.email ?? null;

  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState("");
  const [errorKey, setErrorKey] = useState("notifyErrorGeneric");

  // One tap for a signed-in buyer; guests (and sessions with no address on
  // file) type one in.
  const oneClick = sessionStatus === "authenticated" && Boolean(sessionEmail);

  const subscribe = async (address: string | null) => {
    if (phase === "saving") return;
    if (address !== null && !isValidEmail(address)) {
      setErrorKey("notifyErrorEmail");
      setPhase("error");
      return;
    }

    setPhase("saving");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Omitting the address tells the route to use the session's own.
        // The locale goes with the request so the eventual back-in-stock
        // mail links to this page in the language they are reading it in.
        body: JSON.stringify({ productId, locale, ...(address ? { email: address } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as WaitlistResponse | null;

      if (!response.ok || !payload?.ok) {
        const code = payload && !payload.ok ? payload.code : "FAILED";
        setErrorKey(
          code === "INVALID_EMAIL"
            ? "notifyErrorEmail"
            : code === "ALREADY_IN_STOCK"
              ? "notifyErrorInStock"
              : "notifyErrorGeneric"
        );
        setPhase("error");
        return;
      }
      setPhase("done");
      onSubscribed?.();
    } catch {
      setErrorKey("notifyErrorGeneric");
      setPhase("error");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void subscribe(oneClick ? null : email);
  };

  const saving = phase === "saving";
  const done = phase === "done";

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          data-notify-done
          className={`flex items-center justify-center gap-2 rounded-[13px] border border-emerald-500/40 bg-emerald-500/[.14] font-semibold text-emerald-700 shadow-[0_0_26px_-10px_#34d399] dark:text-emerald-300 ${
            compact ? "h-9 text-[11.5px]" : "h-[46px] text-[13.5px]"
          } ${className}`}
        >
          <motion.span
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.06 }}
            className="flex"
          >
            <Check size={compact ? 14 : 16} strokeWidth={2.8} />
          </motion.span>
          {t("notifyDone")}
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
          transition={{ duration: 0.35, ease: EASE }}
          className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"} ${className}`}
        >
          {!oneClick && (
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (phase === "error") setPhase("idle");
              }}
              required
              // Inside the dialog the field is the reason it opened.
              autoFocus={autoFocus}
              placeholder={t("notifyEmailPlaceholder")}
              aria-label={t("notifyEmailPlaceholder")}
              data-notify-email
              className={`w-full rounded-[13px] border border-slate-900/[.12] bg-white/70 px-3 text-slate-900 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-[3px] focus:ring-violet-500/20 dark:border-hairline-strong dark:bg-white/[.06] dark:text-slate-50 dark:placeholder:text-ink-muted ${
                compact ? "h-9 text-[11.5px]" : "h-[46px] text-[13px]"
              }`}
            />
          )}

          <motion.button
            type="submit"
            disabled={saving}
            whileHover={saving ? undefined : { y: -1 }}
            whileTap={saving ? undefined : { scale: 0.97 }}
            data-notify-submit
            className={`flex w-full items-center justify-center gap-2 rounded-[13px] bg-[linear-gradient(140deg,#4f46e5,#7c3aed)] font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-14px_rgba(109,40,217,.9)] transition-[filter,box-shadow] duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${
              compact ? "h-9 text-[11.5px]" : "h-[46px] text-[13.5px]"
            }`}
          >
            {saving ? (
              <Loader2 size={compact ? 13 : 15} strokeWidth={2.2} className="animate-spin" />
            ) : (
              <BellRing size={compact ? 13 : 15} strokeWidth={2.2} />
            )}
            {t("notifyCta")}
          </motion.button>

          {phase === "error" && (
            <motion.p
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              data-notify-error
              className={`m-0 text-red-600 dark:text-red-400 ${compact ? "text-[10px]" : "text-[11.5px]"}`}
            >
              {t(errorKey)}
            </motion.p>
          )}
        </motion.form>
      )}
    </AnimatePresence>
  );
}

interface StockNotifyBlockProps extends SizedProps {
  productId: string;
}

/**
 * Notice + form, stacked. Used on the product detail page, where there is
 * room for it; the listing grid uses StockNotifyModal instead so its cards
 * stay a uniform height.
 */
export default function StockNotifyBlock({ productId, compact = false, className = "" }: StockNotifyBlockProps) {
  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"} ${className}`} data-stock-notify>
      <OutOfStockNotice compact={compact} />
      <WaitlistForm productId={productId} compact={compact} />
    </div>
  );
}
