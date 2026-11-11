/**
 * Email notification topics, shared by the settings toggles, the server
 * action, the unsubscribe link and the senders — one list, so a topic can't
 * exist in the UI without a column, or in an email without an opt-out.
 *
 * Client-safe: no Prisma import, only the column names as strings.
 */

export const NOTIFICATION_TOPICS = [
  "abandonedCart",
  "restockReminders",
  "priceDrops",
  "backInStock",
  "fgasExpiry",
  "regulatory",
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export type NotificationPreferences = Record<NotificationTopic, boolean>;

/** The User column behind each topic. */
export const NOTIFICATION_COLUMNS = {
  backInStock: "notifyBackInStock",
  priceDrops: "notifyPriceDrops",
  regulatory: "notifyRegulatoryUpdates",
  restockReminders: "notifyRestockReminders",
  abandonedCart: "notifyAbandonedCart",
  fgasExpiry: "notifyFgasExpiry",
} as const satisfies Record<NotificationTopic, string>;

/** Same defaults as schema.prisma — used where there is no row yet (signed out). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  backInStock: true,
  priceDrops: false,
  regulatory: false,
  restockReminders: true,
  abandonedCart: true,
  fgasExpiry: true,
};

/**
 * Restock reminder cadence. `null` (auto) = the customer's own reorder
 * rhythm, learned from at least two purchases of a product; a number = a
 * fixed reminder that many days after their last purchase of it.
 */
export const REORDER_CADENCES = [null, 14, 30, 60] as const;
export type ReorderCadence = (typeof REORDER_CADENCES)[number];

export function isReorderCadence(value: unknown): value is ReorderCadence {
  return (REORDER_CADENCES as readonly unknown[]).includes(value);
}

/** The topics whose mail is about the buyer's own account, orders or compliance. */
export const ESSENTIAL_TOPICS: readonly NotificationTopic[] = ["abandonedCart", "restockReminders", "backInStock", "fgasExpiry"];

export function isNotificationTopic(value: unknown): value is NotificationTopic {
  return typeof value === "string" && (NOTIFICATION_TOPICS as readonly string[]).includes(value);
}
