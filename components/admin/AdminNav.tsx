"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, BarChart3, Boxes, Headset, LayoutDashboard, Megaphone, Send, ShieldCheck, ShoppingBag, Store, Users } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { can, type AppRole, type Permission } from "@/lib/rbac";

/**
 * The admin area's own navigation — always dark, in both themes.
 *
 * Shows the signed-in staff member's role and only the sections that role
 * may open (lib/rbac). That is presentation: proxy.ts, every page's
 * guardAdmin and every action's requirePermission are the enforcement.
 */

type Href = "/admin" | "/admin/analytics" | "/admin/inventory" | "/admin/broadcast" | "/admin/users" | "/admin/orders" | "/admin/support" | "/admin/telegram";
type NavItem = { key: string; href: Href; icon: typeof Users; permission: Permission };

const SECTIONS: Array<{ key: "sectionOverview" | "sectionManage"; items: NavItem[] }> = [
  {
    key: "sectionOverview",
    items: [
      { key: "navDashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard.view" },
      { key: "navAnalytics", href: "/admin/analytics", icon: BarChart3, permission: "analytics.view" },
    ],
  },
  {
    key: "sectionManage",
    items: [
      { key: "navInventory", href: "/admin/inventory", icon: Boxes, permission: "inventory.view" },
      { key: "navBroadcasts", href: "/admin/broadcast", icon: Megaphone, permission: "broadcasts" },
      { key: "navOrders", href: "/admin/orders", icon: ShoppingBag, permission: "orders.view" },
      { key: "navUsers", href: "/admin/users", icon: Users, permission: "users.view" },
      { key: "navSupport", href: "/admin/support", icon: Headset, permission: "support" },
      { key: "navTelegram", href: "/admin/telegram", icon: Send, permission: "telegram.link" },
    ],
  },
];

/** /admin must match exactly, or it would light up on every admin page. */
function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

const ITEM = "group relative flex h-10 flex-none items-center gap-2.5 rounded-[11px] px-3 text-[13px] font-medium tracking-[-.01em] transition-colors";

export const ROLE_BADGE: Record<AppRole, string> = {
  SUPER_ADMIN: "border-amber-300/30 bg-amber-300/[.12] text-amber-200",
  ADMIN: "border-blue-300/30 bg-blue-300/[.12] text-blue-200",
  ACCOUNTANT: "border-emerald-300/30 bg-emerald-300/[.12] text-emerald-200",
  USER: "border-white/15 bg-white/[.06] text-slate-300",
};

export default function AdminNav({ role }: { role: AppRole }) {
  const t = useTranslations("AdminRbac");
  const pathname = usePathname();
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(role, i.permission)) })).filter((s) => s.items.length > 0);

  return (
    <nav
      aria-label="Admin"
      data-admin-nav
      data-admin-role={role}
      className="flex flex-col bg-[#0B1020] text-slate-300 md:sticky md:top-0 md:h-[100dvh] md:w-[248px] md:flex-none md:border-r md:border-white/[.06]"
    >
      {/* Brand + who is signed in, as what */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 md:px-5 md:pb-5 md:pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[linear-gradient(140deg,var(--glow-700),#0891b2)] text-white shadow-[0_8px_20px_-8px_rgba(29,78,216,.9)]">
          <ShieldCheck size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold tracking-[-.02em] text-white">My Energy</span>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-px text-[9.5px] font-bold uppercase tracking-[.1em] ${ROLE_BADGE[role]}`} data-admin-role-badge>
            {t(`badge_${role}`)}
          </span>
        </span>
        {/* Phones: the way out lives up here (the footer link is md+ only). */}
        <Link
          href="/"
          aria-label={t("backToStore")}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-400 hover:bg-white/[.06] hover:text-white md:hidden"
        >
          <Store size={16} strokeWidth={1.9} />
        </Link>
      </div>

      {/* Sections — a horizontal scroller on phones, a column from md up. */}
      <div className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-1 md:flex-col md:gap-5 md:overflow-visible md:px-3 md:pb-0">
        {sections.map((section) => (
          <div key={section.key} className="flex gap-1 md:flex-col md:gap-0.5">
            <div className="hidden px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 md:block">{t(section.key)}</div>
            {section.items.map(({ key, href, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  data-admin-nav-item={href}
                  className={`${ITEM} ${active ? "bg-white/[.09] text-white" : "text-slate-300 hover:bg-white/[.05] hover:text-white"}`}
                >
                  <span
                    aria-hidden
                    className={`absolute bottom-2 left-0 top-2 hidden w-[3px] rounded-full bg-[linear-gradient(180deg,#3b82f6,#22d3ee)] md:block ${active ? "opacity-100" : "opacity-0"}`}
                  />
                  <Icon size={16} strokeWidth={1.9} className={`flex-none ${active ? "text-blue-300" : "text-slate-400 group-hover:text-slate-200"}`} />
                  <span className="whitespace-nowrap">{t(key)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Way out */}
      <div className="hidden border-t border-white/[.06] p-3 md:block">
        <Link href="/" className={`${ITEM} text-slate-400 hover:bg-white/[.05] hover:text-white`}>
          <ArrowLeft size={16} strokeWidth={1.9} />
          {t("backToStore")}
        </Link>
      </div>
    </nav>
  );
}
