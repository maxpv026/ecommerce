/**
 * The /profile views, in tab order. A plain module (not "use client"): the
 * server page reads it to validate ?tab=, and a value exported from a client
 * module reaches a server component as a client reference, not as the array.
 */
export const PROFILE_TABS = ["overview", "orders", "cylinders", "addresses", "fgas", "quotes", "favorites", "security"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];
