"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Package, ShieldCheck, Users } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";

interface AdminVaultProps {
  adminName: string;
  adminEmail: string;
  userCount: number;
  orderCount: number;
}

export default function AdminVault({ adminName, adminEmail, userCount, orderCount }: AdminVaultProps) {
  const t = useTranslations("Admin");
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <section className="relative mx-auto max-w-[760px] px-6 pb-[110px] pt-16 md:px-8">
        <div className="pointer-events-none absolute -left-[8%] top-[4%] aspect-square w-[64%] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.22] blur-[110px] [animation:hc-float_24s_ease-in-out_infinite] dark:opacity-[.34]" />
        <div className="pointer-events-none absolute -right-[10%] bottom-[8%] aspect-square w-[58%] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.2] blur-[110px] [animation:hc-float_30s_ease-in-out_infinite_reverse] dark:opacity-[.3]" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative rounded-[26px] border border-white/75 bg-white/68 p-8 shadow-[0_30px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-md backdrop-saturate-150 md:p-10 dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_30px_70px_-28px_rgba(0,0,0,0.65)]"
        >
          <div className="flex flex-col items-center text-center">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
              className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-blue-700/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400"
            >
              <ShieldCheck size={30} strokeWidth={2.2} />
            </motion.span>

            <div className="mt-5 text-xs tracking-[.09em] text-slate-400 dark:text-slate-500">{t("eyebrow")}</div>
            <h1 className="m-0 mt-2 text-[30px] font-semibold tracking-[-.04em]">{t("title")}</h1>
            <p className="mt-2.5 max-w-[420px] text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
              {t("subtitle")}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full border border-blue-700/20 bg-blue-50 px-3.5 py-2 text-[12px] font-semibold tracking-[-.01em] text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-400">
                {t("welcome", { name: adminName })}
              </span>
              <span className="rounded-full border border-slate-900/[.12] bg-white/80 px-3.5 py-2 font-mono text-[11.5px] text-slate-500 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-400">
                {adminEmail}
              </span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[18px] border border-slate-900/[.08] bg-white/60 p-4.5 dark:border-white/[.08] dark:bg-white/[.03]">
              <div className="flex items-center gap-2 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
                <Users size={13} strokeWidth={2} />
                {t("statUsers")}
              </div>
              <div className="mt-2 text-[26px] font-semibold tracking-[-.035em]">{userCount}</div>
            </div>
            <div className="rounded-[18px] border border-slate-900/[.08] bg-white/60 p-4.5 dark:border-white/[.08] dark:bg-white/[.03]">
              <div className="flex items-center gap-2 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
                <Package size={13} strokeWidth={2} />
                {t("statOrders")}
              </div>
              <div className="mt-2 text-[26px] font-semibold tracking-[-.035em]">{orderCount}</div>
            </div>
          </div>
        </motion.div>
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
