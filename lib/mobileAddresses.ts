import type { LucideIcon } from "lucide-react";
import { Briefcase, Home } from "lucide-react";

export interface MobileAddress {
  id: string;
  label: string;
  icon: LucideIcon;
  recipient: string;
  company: string;
  address: string;
  phone: string;
}

// Mobile-only saved addresses — independent of any desktop shipping-address
// data, same per-page divergence precedent as the rest of the mobile shell.
export const MOBILE_ADDRESSES: MobileAddress[] = [
  {
    id: "office",
    label: "Office / Workspace",
    icon: Briefcase,
    recipient: "Пивоваров Максим Романович",
    company: "Appexoft",
    address: "Lviv, Ukraine",
    phone: "+380 67 412 88 04",
  },
  {
    id: "dorm",
    label: "University Dormitory",
    icon: Home,
    recipient: "Пивоваров Максим Романович",
    company: "",
    address: "Room 322, Lviv, Ukraine",
    phone: "+380 67 412 88 04",
  },
];

export const DEFAULT_ADDRESS_ID = "office";
