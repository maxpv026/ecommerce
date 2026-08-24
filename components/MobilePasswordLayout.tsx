"use client";

import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import MobileSubPageHeader from "./MobileSubPageHeader";

const inputClasses =
  "h-[50px] w-full rounded-2xl border border-slate-900/[.12] bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500";

export default function MobilePasswordLayout() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    router.back();
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title="Change Password" />

      <form onSubmit={handleSave} className="pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              <KeyRound size={17} strokeWidth={1.8} />
            </span>
            <span className="text-[14px] font-semibold tracking-[-.02em]">Update your password</span>
          </div>

          <div className="flex flex-col gap-3.5">
            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                CURRENT PASSWORD
              </label>
              <input
                required
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                NEW PASSWORD
              </label>
              <input
                required
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="••••••••"
                className={inputClasses}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                CONFIRM NEW PASSWORD
              </label>
              <input
                required
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={inputClasses}
              />
            </div>
          </div>

          <p className="mt-4 text-[11.5px] leading-[1.5] text-slate-400 dark:text-slate-500">
            Use at least 8 characters with a mix of letters, numbers, and symbols.
          </p>
        </div>

        <div className="fixed bottom-0 left-0 z-[100] w-full border-t border-white/40 bg-white/78 px-4 pb-[env(safe-area-inset-bottom)] pt-3.5 shadow-[0_-16px_40px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/78">
          <button
            type="submit"
            className="mb-3.5 flex h-[52px] w-full items-center justify-center rounded-2xl bg-blue-700 text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800"
          >
            Update Password
          </button>
        </div>
      </form>
    </div>
  );
}
