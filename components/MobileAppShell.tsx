"use client";

import { usePathname } from "@/i18n/navigation";
import type { ReactNode } from "react";
import MobileBottomNav from "./MobileBottomNav";
import { useCartCount } from "./CartCountProvider";

// Sub-pages that intentionally ship without the global nav so their own
// sticky action bar (Add to Cart, Add New Address, ...) is the only fixed
// bottom element — set by explicit "no global nav" requirements when each
// was built.
const NAV_HIDDEN_PREFIXES = [
  // (Product pages keep the dock now: the phone PDP is the responsive
  // desktop page, with no sticky add-to-cart bar of its own.)
  "/profile/orders",
  "/profile/addresses",
  "/profile/settings",
  "/profile/security",
  "/profile/support",
  // Checkout owns the bottom of the screen: it has its own fixed Place
  // Order bar, and the tab bar sat on top of it (z-[100] over z-50).
  // Hiding it is also the right call for a payment flow — one stray tap
  // on "Catalog" mid-checkout loses the sale.
  "/checkout",
  "/legal",
];

/** Whether a phone shows the bottom dock on this (locale-less) path. */
export const isMobileNavVisible = (pathname: string) => !NAV_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

interface MobileAppShellProps {
  children: ReactNode;
}

export default function MobileAppShell({ children }: MobileAppShellProps) {
  const pathname = usePathname();
  const { cartCount } = useCartCount();
  const navVisible = isMobileNavVisible(pathname);

  return (
    <>
      {/* No dock clearance here: wherever the dock shows, the footer follows
          <main> on phones and carries it (components/Footer). */}
      <main className="flex flex-1 flex-col">{children}</main>
      {navVisible && <MobileBottomNav cartCount={cartCount} />}
    </>
  );
}
