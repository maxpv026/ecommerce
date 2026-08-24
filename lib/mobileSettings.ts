import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CreditCard,
  Euro,
  FileText,
  Globe,
  HelpCircle,
  KeyRound,
  Mail,
  MessageCircle,
  Receipt,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export type SettingsToggleKey = "push" | "sms";

export interface SettingsItem {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  /** Literal, non-translated value (e.g. an email address or VAT number). */
  value?: string;
  /** Key into the "Settings" namespace for a translated value (e.g. "Verified"). */
  valueKey?: string;
  valueGreen?: boolean;
  toggleKey?: SettingsToggleKey;
  /** Tailwind background class for the toggle's "on" state. Defaults to the site accent. */
  toggleActiveClassName?: string;
  danger?: boolean;
  href?: string;
}

export interface SettingsGroup {
  labelKey: string;
  items: SettingsItem[];
}

// `labelKey`/`valueKey` are keys into the "Settings" messages namespace,
// translated at render time in MobileSettingsLayout.
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    labelKey: "groupAccountSecurity",
    items: [
      {
        id: "email",
        labelKey: "email",
        icon: Mail,
        value: "m.pivovarov@appexoft.com",
        href: "/profile/settings/email",
      },
      { id: "password", labelKey: "changePassword", icon: KeyRound, href: "/profile/settings/password" },
      {
        id: "twofa",
        labelKey: "twoFactor",
        icon: ShieldCheck,
        valueKey: "twoFactorValue",
        href: "/profile/security",
      },
    ],
  },
  {
    labelKey: "groupPreferences",
    items: [
      // `lang`'s value is overridden at render time with the active locale's native name.
      { id: "lang", labelKey: "language", icon: Globe, href: "/profile/settings/language" },
      { id: "currency", labelKey: "currency", icon: Euro, value: "EUR (€)", href: "/profile/settings/currency" },
      { id: "push", labelKey: "pushNotifications", icon: Bell, toggleKey: "push" },
      { id: "sms", labelKey: "smsUpdates", icon: MessageCircle, toggleKey: "sms" },
    ],
  },
  {
    labelKey: "groupB2bBilling",
    items: [
      {
        id: "vat",
        labelKey: "vatTaxId",
        icon: Receipt,
        valueKey: "vatTaxIdValue",
        valueGreen: true,
        href: "/profile/settings/tax",
      },
      {
        id: "pay",
        labelKey: "managePayments",
        icon: CreditCard,
        href: "/profile/settings/payments",
      },
    ],
  },
  {
    labelKey: "groupAboutSupport",
    items: [
      { id: "help", labelKey: "helpCenter", icon: HelpCircle, href: "/profile/support" },
      { id: "terms", labelKey: "terms", icon: FileText, href: "/legal/terms" },
    ],
  },
  {
    labelKey: "groupDangerZone",
    items: [{ id: "delete", labelKey: "deleteAccount", icon: Trash2, danger: true }],
  },
];

export const DEFAULT_TOGGLE_STATE: Record<SettingsToggleKey, boolean> = {
  push: true,
  sms: false,
};
