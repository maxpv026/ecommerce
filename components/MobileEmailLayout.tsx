"use client";

import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { Mail } from "lucide-react";
import MobileSubPageHeader from "./MobileSubPageHeader";

const inputClasses =
  "h-[50px] w-full rounded-2xl border border-slate-900/[.12] bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500";

export default function MobileEmailLayout() {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    router.back();
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title="Email Address" />

      <form onSubmit={handleSave} className="pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              <Mail size={17} strokeWidth={1.8} />
            </span>
            <span>
              <span className="block text-[14px] font-semibold tracking-[-.02em]">Current email</span>
              <span className="mt-[2px] block text-[12px] text-slate-400 dark:text-slate-500">m.pivovarov@appexoft.com</span>
            </span>
          </div>

          <div className="flex flex-col gap-3.5 border-t border-slate-900/[.07] pt-4 dark:border-white/[.07]">
            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                NEW EMAIL ADDRESS
              </label>
              <input
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@appexoft.com"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                CONFIRM NEW EMAIL
              </label>
              <input
                required
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="new@appexoft.com"
                className={inputClasses}
              />
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 z-[100] w-full border-t border-white/40 bg-white/78 px-4 pb-[env(safe-area-inset-bottom)] pt-3.5 shadow-[0_-16px_40px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/78">
          <button
            type="submit"
            className="mb-3.5 flex h-[52px] w-full items-center justify-center rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
          >
            Update Email
          </button>
        </div>
      </form>
    </div>
  );
}
