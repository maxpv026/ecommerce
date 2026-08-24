"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import { MOBILE_TABS } from "@/lib/mobileNav";
import type { MobileTabIconKey } from "@/lib/types";

const TAB_ICONS: Record<MobileTabIconKey, typeof Home> = {
  home: Home,
  "layout-grid": LayoutGrid,
  "shopping-cart": ShoppingCart,
  user: User,
};

interface MobileBottomNavProps {
  cartCount: number;
}

export default function MobileBottomNav({ cartCount }: MobileBottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("Nav");

  return (
    <nav className="fixed bottom-0 left-0 z-[100] h-[calc(80px+env(safe-area-inset-bottom))] w-full border-t border-white/20 bg-white/72 backdrop-blur-xl backdrop-saturate-150 md:hidden dark:border-white/10 dark:bg-slate-950/80">
      <div className="flex h-[80px] flex-col px-4">
        <div className="grid flex-1 grid-cols-4">
          {MOBILE_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.icon];
            const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${
                  isActive ? "text-blue-700 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                <span className="relative flex items-center justify-center">
                  <Icon size={21} strokeWidth={isActive ? 2.1 : 1.8} />
                  {tab.id === "cart" && cartCount > 0 && (
                    <span className="absolute -right-2 -top-[5px] flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-white bg-blue-700 px-1 text-[9.5px] font-bold text-white dark:border-slate-950">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className="text-[10.5px] font-semibold tracking-[-.01em]">{t(tab.id)}</span>
              </Link>
            );
          })}
        </div>
        <div className="mx-auto mb-2 h-1 w-[110px] rounded-full bg-slate-900/[.18] dark:bg-white/20" />
      </div>
    </nav>
  );
}
