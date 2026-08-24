"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
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
  } catch (error) {
    console.error("updateUserLocale failed:", error);
  }
}
