"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { BellRing, X } from "lucide-react";
import { OutOfStockNotice, WaitlistForm } from "./StockNotifyBlock";

// Back-in-stock sign-up lifted out of the product card and into a dialog,
// so a listing grid row stays a uniform height whatever its stock mix.
// Same open/close contract as AuthModal and FgasVerificationModal: escape
// closes, the backdrop closes, body scroll is locked while open.

interface StockNotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Prisma Product.id the subscription is filed against. */
  productId: string;
  /** Shown in the dialog heading so the buyer knows what they're subscribing to. */
  productName: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export default function StockNotifyModal({ isOpen, ...dialog }: StockNotifyModalProps) {
  // The body mounts only while open, so every opening starts from a fresh
  // form; AnimatePresence keeps it around for the exit animation.
  return <AnimatePresence>{isOpen && <StockNotifyDialog key="stock-notify" {...dialog} />}</AnimatePresence>;
}

function StockNotifyDialog({ onClose, productId, productName }: Omit<StockNotifyModalProps, "isOpen">) {
  const t = useTranslations("Products");

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#090A0C]/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.2 } }}
        transition={{ duration: 0.45, ease: EASE }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-notify-title"
        data-stock-notify-modal
        onClick={(e) => e.stopPropagation()}
        className="relative w-[420px] max-w-full rounded-[26px] p-[1.5px] shadow-[0_40px_120px_-30px_rgba(4,10,25,.75),0_0_60px_-20px_rgba(109,40,217,.55)]"
        style={{ background: "linear-gradient(140deg,rgba(124,58,237,.5),rgba(239,68,68,.35))" }}
      >
        <div className="relative overflow-hidden rounded-[24.5px] bg-white/[.88] p-[26px] backdrop-blur-2xl backdrop-saturate-150 dark:bg-[#141518]/[.92]">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,#7c3aed,transparent_68%)] opacity-40 blur-[62px] [animation:hc-breathe_7s_ease-in-out_infinite]"
          />

          <button
            type="button"
            onClick={onClose}
            aria-label={t("notifyModalClose")}
            data-stock-notify-close
            className="absolute right-4 top-4 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-900/5 text-slate-600 transition-colors hover:bg-slate-900/[.11] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <X size={14} strokeWidth={2} />
          </button>

          <div className="relative flex items-start gap-3 pr-8">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#4f46e5,#7c3aed)] text-white shadow-[0_14px_30px_-14px_rgba(109,40,217,.95)]">
              <BellRing size={19} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 id="stock-notify-title" className="m-0 text-[18px] font-semibold leading-[1.25] tracking-[-.03em]">
                {t("notifyModalTitle")}
              </h2>
              <p className="mb-0 mt-1 truncate text-[12.5px] text-slate-500 dark:text-ink-muted">{productName}</p>
            </div>
          </div>

          <div className="relative mt-5 flex flex-col gap-3">
            <OutOfStockNotice />
            <p className="m-0 text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">{t("notifyModalSubtitle")}</p>
            <WaitlistForm productId={productId} autoFocus />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
