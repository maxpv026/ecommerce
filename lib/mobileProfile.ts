import type { LucideIcon } from "lucide-react";
import { Briefcase, FileText, Lock, LogOut, MapPin, Package } from "lucide-react";

// Mobile-only profile mock data, independent of the desktop account's
// ACCOUNT_PROFILE (lib/account.ts) — same divergence precedent as the rest
// of the mobile app shell (EU pricing, separate mock cart, etc.).
export const MOBILE_PROFILE = {
  initials: "MP",
  name: "Maxim Pivovarov",
  company: "Appexoft HVAC",
  epaVerified: true,
};

export interface MobileProfileWidget {
  id: "totalOrders" | "activeShipments";
  valueKey: string;
  labelKey: string;
  href: string;
}

// `valueKey`/`labelKey` are keys into the "Profile" messages namespace; the
// `count` each fills its {count} placeholder with comes from real
// Order-model data (see lib/data.ts's getProfileDashboardData), matched to
// this meta by `id` in MobileProfileLayout.
export const MOBILE_PROFILE_WIDGETS: MobileProfileWidget[] = [
  { id: "totalOrders", valueKey: "totalOrders", labelKey: "totalOrdersLabel", href: "/profile/orders" },
  { id: "activeShipments", valueKey: "activeShipments", labelKey: "activeShipmentsLabel", href: "/profile/orders?tab=active" },
];

export interface MobileProfileMenuItem {
  id: string;
  labelKey: string;
  noteKey?: string;
  icon: LucideIcon;
  href?: string;
  danger?: boolean;
}

export interface MobileProfileGroup {
  labelKey: string;
  items: MobileProfileMenuItem[];
}

// `labelKey`/`noteKey` are keys into the "Profile" messages namespace,
// translated at render time in MobileProfileLayout.
export const MOBILE_PROFILE_GROUPS: MobileProfileGroup[] = [
  {
    labelKey: "groupOperations",
    items: [
      {
        id: "orders",
        labelKey: "ordersLabel",
        noteKey: "ordersNote",
        icon: Package,
        href: "/profile/orders",
      },
      {
        id: "addresses",
        labelKey: "addressesLabel",
        noteKey: "addressesNote",
        icon: MapPin,
        href: "/profile/addresses",
      },
    ],
  },
  {
    labelKey: "groupCompliance",
    items: [
      {
        id: "sds",
        labelKey: "sdsLabel",
        noteKey: "sdsNote",
        icon: FileText,
        href: "/profile/docs",
      },
      {
        id: "company",
        labelKey: "companyLabel",
        noteKey: "companyNote",
        icon: Briefcase,
        href: "/profile/company",
      },
    ],
  },
  {
    labelKey: "groupAccount",
    items: [
      {
        id: "security",
        labelKey: "securityLabel",
        noteKey: "securityNote",
        icon: Lock,
        href: "/profile/security",
      },
      {
        id: "logout",
        labelKey: "logout",
        icon: LogOut,
        danger: true,
      },
    ],
  },
];
