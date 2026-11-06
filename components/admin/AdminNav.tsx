"use client";

import { ArrowLeft, BarChart3, Boxes, Headset, LayoutDashboard, Megaphone, ShieldCheck, ShoppingBag, Store, Users } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The admin area's own navigation — always dark, in both themes, so the
 * founder area reads as a different, elevated place from the storefront.
 *
 * Purely navigation. Every admin page still runs guardAdmin and every admin
 * action requireAdmin; nothing here grants or hides access.
 */

type NavItem =
  | { label: string; href: "/admin" | "/admin/dashboard" | "/admin/inventory" | "/admin/broadcast" | "/admin/users" | "/admin/orders" | "/admin/support"; icon: typeof Users }
  | { label: string; href?: undefined; icon: typeof Users };

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Analytics", href: "/admin/dashboard", icon: BarChart3 },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Inventory", href: "/admin/inventory", icon: Boxes },
      { label: "Broadcasts", href: "/admin/broadcast", icon: Megaphone },
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Support", href: "/admin/support", icon: Headset },
    ],
  },
];

/** /admin must match exactly, or it would light up on every admin page. */
function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

const ITEM =
  "group relative flex h-10 flex-none items-center gap-2.5 rounded-[11px] px-3 text-[13px] font-medium tracking-[-.01em] transition-colors";

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin"
      data-admin-nav
      className="flex flex-col bg-[#0B1020] text-slate-300 md:sticky md:top-0 md:h-[100dvh] md:w-[248px] md:flex-none md:border-r md:border-white/[.06]"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 md:px-5 md:pb-5 md:pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[linear-gradient(140deg,var(--glow-700),#0891b2)] text-white shadow-[0_8px_20px_-8px_rgba(29,78,216,.9)]">
          <ShieldCheck size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold tracking-[-.02em] text-white">My Energy</span>
          <span className="block text-[10.5px] font-semibold uppercase tracking-[.1em] text-blue-300/80">Secure admin</span>
        </span>
        {/* Phones: the way out lives up here (the footer link is md+ only). */}
        <Link
          href="/"
          aria-label="Back to storefront"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-400 hover:bg-white/[.06] hover:text-white md:hidden"
        >
          <Store size={16} strokeWidth={1.9} />
        </Link>
      </div>

      {/* Sections — a horizontal scroller on phones, a column from md up. */}
      <div className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-1 md:flex-col md:gap-5 md:overflow-visible md:px-3 md:pb-0">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex gap-1 md:flex-col md:gap-0.5">
            <div className="hidden px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 md:block">
              {section.title}
            </div>
            {section.items.map(({ label, href, icon: Icon }) => {
              if (!href) {
                return (
                  <span
                    key={label}
                    aria-disabled="true"
                    title="Coming soon"
                    data-admin-nav-item={label}
                    className={`${ITEM} cursor-not-allowed text-slate-500`}
                  >
                    <Icon size={16} strokeWidth={1.9} className="flex-none" />
                    <span className="flex-1 whitespace-nowrap">{label}</span>
                    <span className="rounded-full border border-white/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[.08em] text-slate-500">
                      Soon
                    </span>
                  </span>
                );
              }
              const active = isActive(pathname, href);
              return (
                <Link
                  key={label}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  data-admin-nav-item={label}
                  className={`${ITEM} ${
                    active ? "bg-white/[.09] text-white" : "text-slate-300 hover:bg-white/[.05] hover:text-white"
                  }`}
                >
                  {/* Active marker: a bar on the left in the column layout. */}
                  <span
                    aria-hidden
                    className={`absolute bottom-2 left-0 top-2 hidden w-[3px] rounded-full bg-[linear-gradient(180deg,#3b82f6,#22d3ee)] md:block ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <Icon size={16} strokeWidth={1.9} className={`flex-none ${active ? "text-blue-300" : "text-slate-400 group-hover:text-slate-200"}`} />
                  <span className="whitespace-nowrap">{label}</span>
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
          Back to storefront
        </Link>
      </div>
    </nav>
  );
}
