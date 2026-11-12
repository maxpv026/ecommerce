"use server";

import { auth } from "@/auth";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { refreshUserCountryQuietly } from "@/lib/userCountry";
import { routing } from "@/i18n/routing";

/**
 * Persists the signed-in user's language choice so their next login can
 * redirect them straight to it (see auth.ts's jwt/session callbacks). A
 * no-op for signed-out visitors — callers fire this without blocking the
 * locale switch itself.
 */
export async function updateUserLocale(locale: string): Promise<void> {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return;

  const session = await auth();
  if (!session?.user?.id) return;

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
    // The language is the last-resort country signal (lib/userCountry).
    const userId = session.user.id;
    after(() => refreshUserCountryQuietly(userId));
  } catch (error) {
    console.error("updateUserLocale failed:", error);
  }
}
