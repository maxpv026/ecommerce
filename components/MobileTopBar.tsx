"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ThemeToggle from "./ThemeToggle";
import HeaderLanguageSwitcher from "./HeaderLanguageSwitcher";
import { Avatar } from "./AvatarUploader";
import { initialsFrom } from "@/lib/initials";

/**
 * The phone app bar (below md; the desktop Header takes over above it):
 * logo · search · language · theme · account. Frosted like the bottom dock
 * (components/MobileBottomNav) so the two read as one frame.
 *
 * No notification bell: the old one carried a permanent red dot whether or
 * not there was anything to read. Notifications stay one tap away in /profile.
 */

const ICON_BTN =
  "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-slate-900/[.1] bg-white/80 text-slate-600 transition-colors active:scale-95 dark:border-white/[.12] dark:bg-white/[.05] dark:text-slate-300";

export default function MobileTopBar() {
  const t = useTranslations("Nav");
  const tm = useTranslations("HomeMobile");
  const { data: session, status } = useSession();
  const user = session?.user;

  return (
    <header
      className="sticky top-0 z-[80] border-b border-slate-200/70 bg-white/85 px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] backdrop-blur-xl backdrop-saturate-150 md:hidden dark:border-slate-800/70 dark:bg-slate-950/85"
      data-mobile-topbar
    >
      <div className="flex items-center gap-1.5">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2" data-topbar-logo>
          <span aria-hidden className="block h-[13px] w-[13px] flex-none rounded-full border-[3px] border-slate-900 dark:border-slate-50" />
          <span className="truncate text-[17px] font-semibold tracking-[-.035em]">My Energy</span>
        </Link>
        <Link href="/search" aria-label={t("search")} title={t("search")} className={ICON_BTN} data-topbar-search>
          <Search size={17} strokeWidth={2} />
        </Link>
        {/* No transform on this wrapper: it would re-anchor the switcher's fixed bottom sheet. */}
        <div className="flex flex-none" data-header-lang>
          <HeaderLanguageSwitcher />
        </div>
        <div className="flex flex-none" data-header-theme>
          <ThemeToggle iconSize={16} className={ICON_BTN} />
        </div>
        {status === "authenticated" && user ? (
          <Link href="/profile" aria-label={tm("profileAria")} className="flex flex-none rounded-full active:scale-95" data-header-avatar>
            <Avatar
              avatarUrl={user.image ?? null}
              initials={initialsFrom(user.name ?? user.email ?? "") || "•"}
              size={38}
              tone={user.avatarTone}
              fallbackClassName="bg-blue-600 text-white"
              className="text-[12.5px]"
            />
          </Link>
        ) : status === "unauthenticated" ? (
          <Link href="/auth" className="flex h-[38px] flex-none items-center rounded-full bg-blue-600 px-4 text-[12.5px] font-semibold text-white" data-topbar-signin>
            {tm("signIn")}
          </Link>
        ) : (
          // Session still loading: hold the avatar's place so nothing shifts.
          <span aria-hidden className="h-[38px] w-[38px] flex-none rounded-full bg-slate-900/[.06] dark:bg-white/[.08]" />
        )}
      </div>
    </header>
  );
}
