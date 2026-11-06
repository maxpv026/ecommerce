"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { ThemePreference } from "@/lib/generated/prisma/client";

export type UpdateThemeResult = { ok: true } | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "FAILED" };

const THEMES = Object.values(ThemePreference) as string[];

/**
 * Saves the signed-in user's colour scheme so every device they sign in on
 * picks it up (auth.ts mirrors it into the session; ThemeSync applies it).
 *
 * Called in the background after the UI has already switched — the caller
 * rolls the switch back on a failure result. Signed-out visitors never reach
 * this: their choice stays on the device.
 */
export async function updateThemePreference(theme: string): Promise<UpdateThemeResult> {
  // A server action is a public endpoint; the argument is untrusted.
  if (!THEMES.includes(theme)) return { ok: false, code: "INVALID_INPUT" };

  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: "UNAUTHENTICATED" };

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { themePreference: theme as ThemePreference },
    });
    return { ok: true };
  } catch (error) {
    console.error("updateThemePreference failed:", error);
    return { ok: false, code: "FAILED" };
  }
}
