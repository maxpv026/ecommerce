import type { Leaf } from "lucide-react";

/**
 * The "Records & Compliance" destinations, in one place.
 *
 * Three surfaces render this list — the header's account menu, the desktop
 * dashboard and the mobile profile — and it has no dependencies beyond a
 * lucide type import, so importing it never drags a component graph along
 * (the lesson from lib/aiChatEvents.ts).
 *
 * Down to one entry. /profile/invoices and /profile/cylinders were deleted
 * (invoice PDFs hang off the Orders flow, where a buyer actually looks for
 * them, and the cylinder balance is a figure on the carbon record rather than
 * a page of its own), and the group now points only at the consolidated
 * /profile/compliance.
 *
 * /profile/docs is NOT orphaned by leaving this group — it is still reached
 * from the desktop dashboard's Documents tab, the mobile profile, the mobile
 * app shell, mobile search and the mobile home shortcuts. Only this one
 * account-menu row is gone. Worth keeping in mind before deleting the route:
 * unlike /product/[id], it has six live entry points.
 *
 * The entry is gated by name in proxy.ts's PROTECTED_SEGMENTS. Do not put the
 * public /compliance/sds library here: that is product safety documentation
 * any visitor may read, and it is reached from the footer, the categories grid
 * and every PDP. Sharing the word "compliance" is exactly what made the old
 * header confusing — one label pointed at public datasheets, the other at a
 * customer's own audit figures.
 */
export type RecordsIconKey = "carbon";

export interface RecordsLink {
  id: string;
  /** Key into the "Records" messages namespace. */
  labelKey: string;
  href: "/profile/compliance";
  icon: RecordsIconKey;
}

export const RECORDS_LINKS: RecordsLink[] = [
  { id: "compliance", labelKey: "carbon", href: "/profile/compliance", icon: "carbon" },
];

/** Icon lookup kept beside the list so both renderers resolve it identically. */
export type RecordsIconMap = Record<RecordsIconKey, typeof Leaf>;
