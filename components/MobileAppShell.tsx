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
  // Trailing slashes: hide on detail pages (/product/x, /products/x) while
  // the /products browser itself keeps the tab bar.
  "/product/",
  "/products/",
  "/profile/orders",
  "/profile/addresses",
  "/profile/docs",
  "/profile/settings",
  "/profile/company",
  "/profile/security",
  "/profile/support",
  "/notifications",
  "/search",
  "/legal",
];

interface MobileAppShellProps {
  children: ReactNode;
}

export default function MobileAppShell({ children }: MobileAppShellProps) {
  const pathname = usePathname();
  const { cartCount } = useCartCount();
  const navVisible = !NAV_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <>
      <main
        className={`flex flex-1 flex-col ${
          navVisible ? "pb-[calc(90px+env(safe-area-inset-bottom))] md:pb-0" : ""
        }`}
      >
        {children}
      </main>
      {navVisible && <MobileBottomNav cartCount={cartCount} />}
    </>
  );
}
