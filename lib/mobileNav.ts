import type { MobileTab } from "./types";

// Shared across every mobile app-shell screen (home, catalog, ...). Each
// `id` doubles as the translation key into the "Nav" messages namespace.
export const MOBILE_TABS: MobileTab[] = [
  { id: "home", href: "/", icon: "home" },
  { id: "catalog", href: "/cylinders", icon: "layout-grid" },
  { id: "cart", href: "/cart", icon: "shopping-cart" },
  { id: "profile", href: "/profile", icon: "user" },
];
