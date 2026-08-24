"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { signIn, useSession } from "next-auth/react";
import { ChevronRight, KeyRound, Laptop, ShieldCheck, Smartphone } from "lucide-react";
import GoogleGlyph from "./GoogleGlyph";
import MobileSubPageHeader from "./MobileSubPageHeader";

interface Session {
  id: string;
  device: string;
  location: string;
  time: string;
  current: boolean;
  icon: typeof Smartphone;
}

const INITIAL_SESSIONS: Session[] = [
  { id: "s1", device: "iPhone 15 Pro", location: "Lviv, UA", time: "Current session", current: true, icon: Smartphone },
  { id: "s2", device: "MacBook Pro", location: "Lviv, UA", time: "2 days ago", current: false, icon: Laptop },
  { id: "s3", device: "iPad Air", location: "Warsaw, PL", time: "3 weeks ago", current: false, icon: Smartphone },
];

export default function MobileSecurityLayout() {
  const { data: session } = useSession();
  const googleLinked = session?.user?.provider === "google";
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);

  const signOutSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title="Security & 2FA" />

      <div className="flex flex-col gap-3.5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                <ShieldCheck size={17} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-[14px] font-semibold tracking-[-.02em]">Two-Factor Authentication</span>
                <span className="mt-[2px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                  2FA is tied to your Google account
                </span>
              </span>
            </span>
            {googleLinked && (
              <span className="flex-none rounded-full border border-emerald-600/20 bg-emerald-50 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
                Enabled
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3.5 border-t border-slate-900/[.07] pt-4 dark:border-white/[.07]">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-50 dark:bg-white/[.06]">
              <GoogleGlyph size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold tracking-[-.02em]">Google Account</span>
              <span className="mt-[2px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                {googleLinked ? `Connected · ${session?.user?.email}` : "Not connected"}
              </span>
            </span>
            {!googleLinked && (
              <button
                type="button"
                onClick={() => void signIn("google")}
                className="flex-none rounded-xl border-[1.5px] border-blue-700/35 bg-white px-3.5 py-2 text-[12px] font-semibold text-blue-700 transition-colors hover:border-blue-700/60 dark:bg-transparent dark:text-blue-400"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        <Link
          href="/profile/settings/password"
          className="mx-4 flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-white/[.03]"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <KeyRound size={17} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold tracking-[-.02em]">Change Password</span>
            <span className="mt-[2px] block text-[11.5px] text-slate-400 dark:text-slate-500">Last changed 4 months ago</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className="flex-none text-slate-300 dark:text-slate-600" />
        </Link>

        <div className="px-4">
          <div className="mb-2.5 px-1.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
            ACTIVE SESSIONS
          </div>
          <div className="flex flex-col gap-2.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3.5 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/[.07] dark:text-slate-300">
                  <session.icon size={17} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold tracking-[-.02em]">{session.device}</span>
                    {session.current && (
                      <span className="rounded-full border border-emerald-600/20 bg-emerald-50 px-2 py-[2px] text-[10px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
                        This device
                      </span>
                    )}
                  </span>
                  <span className="mt-[3px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                    {session.location} · {session.time}
                  </span>
                </span>
                {!session.current && (
                  <button
                    type="button"
                    onClick={() => signOutSession(session.id)}
                    className="flex-none rounded-xl border border-slate-900/[.12] bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 transition-colors hover:border-red-600/30 hover:text-red-600 dark:border-white/[.14] dark:bg-transparent dark:text-slate-300"
                  >
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
