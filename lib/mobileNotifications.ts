import type { LucideIcon } from "lucide-react";
import { CreditCard, FileText, Package, ShieldCheck, Tag, Truck } from "lucide-react";

export interface MobileNotification {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

// Mobile-only mock notification feed — same independent-mock-data
// precedent as the rest of the mobile app shell.
export const MOBILE_NOTIFICATIONS: MobileNotification[] = [
  {
    id: "n1",
    icon: Truck,
    title: "Shipment #ORD-8472-EU delayed",
    body: "Your Rotterdam delivery is now expected Aug 22 due to customs clearance.",
    time: "2h ago",
    unread: true,
  },
  {
    id: "n2",
    icon: CreditCard,
    title: "Payment method expiring soon",
    body: "Visa ending in 4242 expires 11/26. Update it to avoid interrupted orders.",
    time: "6h ago",
    unread: true,
  },
  {
    id: "n3",
    icon: ShieldCheck,
    title: "F-Gas certification renewal reminder",
    body: "Your Universal certification renews in 45 days — renew early to keep purchasing uninterrupted.",
    time: "Yesterday",
    unread: true,
  },
  {
    id: "n4",
    icon: Package,
    title: "Order #ORD-8341-EU delivered",
    body: "Signed for by warehouse staff at 14:32, Rotterdam hub.",
    time: "2 days ago",
    unread: false,
  },
  {
    id: "n5",
    icon: FileText,
    title: "New SDS revision available",
    body: "R-32 Safety Data Sheet updated to rev 2.2 — previous revision archived.",
    time: "4 days ago",
    unread: false,
  },
  {
    id: "n6",
    icon: Tag,
    title: "Pricing update: R-410A Premium",
    body: "New EU pricing takes effect September 1. Existing quotes are unaffected.",
    time: "1 week ago",
    unread: false,
  },
];
