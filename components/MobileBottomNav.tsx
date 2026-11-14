"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { ChartLine, House, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { MOBILE_TABS, isTabActive } from "@/lib/mobileNav";
import type { MobileTabIconKey } from "@/lib/types";

/**
 * The phone dock: five destinations, one tap each — Головна · Каталог · Хаб ·
 * Кошик · Профіль. Frosted glass over the page, a hairline on top, and the
 * device's safe area added below the 64 px bar (nothing sits under the home
 * indicator, and nothing is clipped at the corners).
 *
 * Height is part of a contract: MobileAppShell pads <main> by it, the chat
 * button (AIChatWidget) and the mobile cart's checkout bar sit on top of it.
 * Change MOBILE_NAV_HEIGHT and those move with it.
 */

export const MOBILE_NAV_HEIGHT = 64;

const TAB_ICONS: Record<MobileTabIconKey, typeof House> = {
  home: House,
  "layout-grid": LayoutGrid,
  hub: ChartLine,
  "shopping-cart": ShoppingCart,
  user: UserRound,
};

export default function MobileBottomNav({ cartCount }: { cartCount: number }) {
  const pathname = usePathname();
  const t = useTranslations("Nav");

  return (
    <nav
      aria-label={t("ariaLabel")}
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200/80 bg-white/[.88] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden dark:border-slate-800/80 dark:bg-slate-950/[.88]"
      data-mobile-nav
    >
      <ul className="m-0 grid h-16 list-none grid-cols-5 px-1.5 py-0">
        {MOBILE_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.icon];
          const active = isTabActive(tab, pathname);
          const badge = tab.id === "cart" && cartCount > 0 ? (cartCount > 99 ? "99+" : String(cartCount)) : null;
          return (
            <li key={tab.id} className="flex min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? t("cartWithCount", { count: cartCount }) : undefined}
                data-mobile-tab={tab.id}
                data-active={active ? "1" : "0"}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors active:scale-95 ${
                  active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <span
                  className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-blue-600/10 dark:bg-blue-400/15" : ""}`}
                  data-tab-pill={active ? "1" : undefined}
                >
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                  {badge && (
                    <span
                      className="absolute -top-1 right-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-white dark:bg-blue-500 dark:ring-slate-950"
                      data-nav-cart-badge={badge}
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className={`max-w-full truncate text-[11px] leading-none tracking-[-.01em] ${active ? "font-semibold" : "font-medium"}`}>{t(tab.id)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
