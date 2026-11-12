import "server-only";

import prisma from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveCountry, type CountryResolution, type CountrySource } from "@/lib/country";

/**
 * Keeps User.countryCode / countryCity / countrySource current (lib/country
 * holds the rules). Called whenever a signal changes — a sign-in, a session
 * seen from a new place, an address or profile save — and by the admin
 * directory for the rows it shows, so a missed write heals on first view.
 */

/** What resolveCountry needs, as a nested select on User. */
export const COUNTRY_SIGNALS_SELECT = {
  vatNumber: true,
  phone: true,
  locale: true,
  countryCode: true,
  countryCity: true,
  countrySource: true,
  deviceSessions: { where: { country: { not: null } }, orderBy: { lastActiveAt: "desc" }, take: 3, select: { country: true, city: true } },
  addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 5, select: { country: true, city: true, fullAddress: true } },
} satisfies Prisma.UserSelect;

export interface CountrySignalRow {
  vatNumber: string | null;
  phone: string | null;
  locale: string;
  countryCode: string | null;
  countryCity: string | null;
  countrySource: string | null;
  deviceSessions: Array<{ country: string | null; city: string | null }>;
  addresses: Array<{ country: string | null; city: string | null; fullAddress: string }>;
}

export const resolveFromRow = (row: CountrySignalRow): CountryResolution | null =>
  resolveCountry({ sessions: row.deviceSessions, addresses: row.addresses, vatNumber: row.vatNumber, phone: row.phone, locale: row.locale });

export const storedCountry = (row: Pick<CountrySignalRow, "countryCode" | "countryCity" | "countrySource">): CountryResolution | null =>
  row.countryCode ? { code: row.countryCode, city: row.countryCity, source: (row.countrySource ?? "ip") as CountrySource } : null;

const same = (a: CountryResolution | null, b: CountryResolution | null) => a?.code === b?.code && (a?.city ?? null) === (b?.city ?? null) && a?.source === b?.source;

/** Writes the resolution if it differs from what is stored. Returns whether it wrote. */
export async function persistCountry(userId: string, row: CountrySignalRow, resolved = resolveFromRow(row)): Promise<boolean> {
  if (same(resolved, storedCountry(row))) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { countryCode: resolved?.code ?? null, countryCity: resolved?.city ?? null, countrySource: resolved?.source ?? null, countryUpdatedAt: new Date() },
  });
  return true;
}

/** Re-reads every signal for one user and stores the result. */
export async function refreshUserCountry(userId: string): Promise<CountryResolution | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: COUNTRY_SIGNALS_SELECT });
  if (!row) return null;
  const resolved = resolveFromRow(row);
  await persistCountry(userId, row, resolved);
  return resolved;
}

/** Fire-and-forget form for actions: a failure is logged, never surfaced to the user. */
export const refreshUserCountryQuietly = (userId: string) =>
  refreshUserCountry(userId).catch((error) => console.error("userCountry: refresh failed:", error));
