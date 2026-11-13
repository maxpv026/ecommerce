import "server-only";

import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";

/**
 * The storefront announcement banner (SiteAnnouncement), posted from the
 * Telegram bot (📢 Оголошення). Read on every page through the cache below and
 * invalidated by tag when it changes; a database error shows no banner
 * rather than breaking the page.
 */

export const ANNOUNCEMENT_TAG = "site-announcement";

const read = unstable_cache(
  async () => {
    const row = await prisma.siteAnnouncement.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" }, select: { text: true } });
    return row?.text ?? null;
  },
  ["site-announcement-v1"],
  { tags: [ANNOUNCEMENT_TAG], revalidate: 300 }
);

export async function getActiveAnnouncement(): Promise<string | null> {
  try {
    return await read();
  } catch (error) {
    console.error("[announcement] could not read the banner:", error);
    return null;
  }
}
