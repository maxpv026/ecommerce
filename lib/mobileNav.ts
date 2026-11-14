import type { MobileTab } from "./types";

// The phone dock (components/MobileBottomNav). Each `id` doubles as the
// translation key into the "Nav" messages namespace; `also` lists the other
// routes that light the tab up (the catalog tab covers the category explorer).
export const MOBILE_TABS: MobileTab[] = [
  { id: "home", href: "/", icon: "home" },
  { id: "catalog", href: "/products", icon: "layout-grid", also: ["/categories"] },
  { id: "hub", href: "/hub", icon: "hub" },
  { id: "cart", href: "/cart", icon: "shopping-cart" },
  { id: "profile", href: "/profile", icon: "user", also: ["/notifications"] },
];

/** Whether this tab is the current one for `pathname` (locale already stripped). */
export function isTabActive(tab: MobileTab, pathname: string): boolean {
  if (tab.href === "/") return pathname === "/";
  return [tab.href, ...(tab.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
