/**
 * Email notification topics, shared by the settings toggles, the server
 * action, the unsubscribe link and the senders — one list, so a topic can't
 * exist in the UI without a column, or in an email without an opt-out.
 *
 * Client-safe: no Prisma import, only the column names as strings.
 */

export const NOTIFICATION_TOPICS = ["backInStock", "priceDrops", "regulatory", "restockReminders"] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export type NotificationPreferences = Record<NotificationTopic, boolean>;

/** The User column behind each topic. */
export const NOTIFICATION_COLUMNS = {
  backInStock: "notifyBackInStock",
  priceDrops: "notifyPriceDrops",
  regulatory: "notifyRegulatoryUpdates",
  restockReminders: "notifyRestockReminders",
} as const satisfies Record<NotificationTopic, string>;

/** Same defaults as schema.prisma — used where there is no row yet (signed out). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  backInStock: true,
  priceDrops: false,
  regulatory: false,
  restockReminders: true,
};

export function isNotificationTopic(value: unknown): value is NotificationTopic {
  return typeof value === "string" && (NOTIFICATION_TOPICS as readonly string[]).includes(value);
}
