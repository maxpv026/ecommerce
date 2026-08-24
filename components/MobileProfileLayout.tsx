"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { signOut } from "next-auth/react";
import { ChevronRight, Loader2, Settings, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { MOBILE_PROFILE_GROUPS, MOBILE_PROFILE_WIDGETS } from "@/lib/mobileProfile";
import { initialsFrom } from "@/lib/initials";
import type { ProfileDashboardData } from "@/lib/data";

const WIDGET_ICONS = { totalOrders: ShoppingBag, activeShipments: Truck } as const;

interface MobileProfileLayoutProps {
  dashboardData: ProfileDashboardData | null;
}

export default function MobileProfileLayout({ dashboardData }: MobileProfileLayoutProps) {
  const t = useTranslations("Profile");
  const { data: session } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  const name = session?.user?.name ?? "";
  const company = session?.user?.companyName ?? "";
  const epaVerified = Boolean(session?.user?.epaVerified);

  const handleLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // Brief visible loading state before the real session teardown + redirect.
    setTimeout(() => {
      void signOut({ callbackUrl: "/auth" });
    }, 600);
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Identity section: ambient mesh gradient strictly at the top, fading
          into the solid background before the menu lists begin. */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[170px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-60 blur-[85px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.5]" />
          <div className="absolute -right-[110px] -top-[130px] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.55] blur-[85px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.44]" />
          <div className="absolute -top-[110px] left-[30%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-60 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.16]" />
        </div>

        <div className="relative px-5 pt-14">
          <div className="flex justify-end">
            <Link
              href="/profile/settings"
              aria-label={t("settingsAria")}
              className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Settings size={20} strokeWidth={1.8} />
            </Link>
          </div>

          <div className="flex flex-col items-center pt-1 text-center">
            <span className="flex h-[82px] w-[82px] items-center justify-center rounded-full border-[3px] border-white/85 bg-white text-[26px] font-semibold tracking-[-.03em] text-slate-900 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-900 dark:text-slate-50">
              {initialsFrom(name)}
            </span>
            <h1 className="m-0 mt-4 text-[23px] font-semibold tracking-[-.035em]">{name}</h1>
            {company && (
              <div className="mt-[5px] text-[13.5px] text-slate-600 dark:text-slate-400">{company}</div>
            )}
            {epaVerified && (
              <span className="mt-3.5 flex items-center gap-[7px] rounded-full border border-emerald-600/[.28] bg-emerald-50/90 px-3.5 py-[7px] text-xs font-semibold text-emerald-700 shadow-[0_10px_26px_-12px_rgba(22,163,74,0.55)] dark:border-emerald-400/25 dark:bg-emerald-950/90 dark:text-emerald-400">
                <ShieldCheck size={14} strokeWidth={2} />
                {t("epaVerifiedBadge")}
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {MOBILE_PROFILE_WIDGETS.map((widget) => {
              const Icon = WIDGET_ICONS[widget.id];
              const count = dashboardData?.[widget.id] ?? 0;
              return (
                <Link
                  key={widget.id}
                  href={widget.href}
                  className="rounded-[18px] border border-white/80 bg-white/66 p-3.5 pb-3.5 text-left shadow-[0_16px_34px_-26px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 transition-colors hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-900/80"
                >
                  <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-[11px] border border-slate-900/[.06] bg-white text-blue-700 dark:border-white/10 dark:bg-slate-950 dark:text-blue-400">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <div className="text-[19px] font-semibold tracking-[-.035em]">
                    {t(widget.valueKey, { count })}
                  </div>
                  <div className="mt-1 text-[11px] leading-[1.4] text-slate-500 dark:text-slate-400">
                    {t(widget.labelKey)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Menu lists — the global <main> wrapper already clears the persistent bottom nav */}
      <div className="pb-8">
        {MOBILE_PROFILE_GROUPS.map((group) => (
          <div key={group.labelKey} className="mt-6 px-4">
            <div className="mb-2.5 px-1.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
              {t(group.labelKey)}
            </div>
            <div className="overflow-hidden rounded-[18px] border border-slate-900/[.05] bg-white shadow-[0_8px_22px_-20px_rgba(15,23,42,0.4)] dark:border-white/[.06] dark:bg-slate-900">
              {group.items.map((item, idx) => {
                const isLast = idx === group.items.length - 1;
                const isLogout = item.id === "logout";
                const color = item.danger
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-900 dark:text-slate-50";
                const rowClasses = `flex w-full min-h-[60px] items-center gap-3.5 px-3.5 py-3 text-left transition-colors hover:bg-slate-900/[.02] dark:hover:bg-white/[.03] ${
                  isLast ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"
                } ${isLogout && loggingOut ? "opacity-60" : ""}`;
                const content = (
                  <>
                    <span
                      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] ${
                        item.danger
                          ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                      }`}
                    >
                      {isLogout && loggingOut ? (
                        <Loader2 size={17} strokeWidth={1.8} className="animate-spin" />
                      ) : (
                        <item.icon size={17} strokeWidth={1.8} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className={`block text-sm font-semibold tracking-[-.02em] ${color}`}>
                        {isLogout && loggingOut ? t("loggingOut") : t(item.labelKey)}
                      </span>
                      {item.noteKey && (
                        <span className="mt-[3px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                          {t(item.noteKey)}
                        </span>
                      )}
                    </span>
                    <span
                      className={`flex flex-none items-center justify-center ${
                        item.danger ? "text-red-600/55 dark:text-red-400/55" : "text-slate-300 dark:text-slate-600"
                      }`}
                    >
                      <ChevronRight size={16} strokeWidth={2} />
                    </span>
                  </>
                );

                if (isLogout) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className={rowClasses}
                    >
                      {content}
                    </button>
                  );
                }

                return item.href ? (
                  <Link key={item.id} href={item.href} className={rowClasses}>
                    {content}
                  </Link>
                ) : (
                  <button key={item.id} type="button" className={rowClasses}>
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
