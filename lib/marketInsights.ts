import "server-only";

import { cache } from "react";
import prisma from "@/lib/prisma";
import { getMarketAlerts } from "@/lib/data";
import { classifyHeadline, type MarketAlertTag } from "@/lib/services/newsFetcher";

/**
 * The hub's market intelligence, from two sources merged into one shape.
 *
 *   1. `MarketInsight` rows — curated in-house, with a severity attached.
 *   2. the live industry feed (lib/services/newsFetcher.ts) — real RSS from
 *      trade publications, already cached for an hour.
 *
 * Both, deliberately. A hub built only on the table would be blank until
 * somebody authored a row, and one built only on the feed could never carry a
 * judgement like "this quota date matters to you". Curated rows sort first at
 * equal severity because a human chose to put them there.
 */

export type InsightSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface InsightItem {
  id: string;
  title: string;
  content: string;
  severity: InsightSeverity;
  tags: string[];
  /** ISO string, or null where the feed gave no usable date. */
  publishedAt: string | null;
  /** "curated" rows are ours; "feed" rows link out to the publisher. */
  origin: "curated" | "feed";
  /** Present on feed rows only — every one is a link out. */
  link?: string;
  source?: string;
  /** REGULATION / PRICE_TREND / SUPPLY / INDUSTRY_NEWS — the feed's headline category (curated rows: the same rule). */
  category: MarketAlertTag;
  /** The story is about equipment (compressors, heat pumps, chillers…) — the hub's "Equipment" filter. */
  equipment: boolean;
}

const EQUIPMENT = /compressor|heat[-\s]?pumps?|chiller|condens(er|ing unit)|evaporator|\bvalves?\b|refrigerat(ed|ion) (cabinet|display|unit)s?|\bVRF\b|split (system|unit)|monobloc|air[-\s]?condition(er|ing) unit|launch(es|ed)?\b|new range|unveil/i;
export const isEquipmentStory = (text: string) => EQUIPMENT.test(text);

/**
 * Feed category → severity.
 *
 * A guess, and labelled as one: the RSS feed has no severity field, so this
 * maps intent. Regulation and supply stories are the ones that change what a
 * buyer should do this quarter; general industry news is context. Curated
 * rows carry a real, human-assigned severity and never come through here.
 */
const FEED_SEVERITY: Record<MarketAlertTag, InsightSeverity> = {
  REGULATION: "HIGH",
  SUPPLY: "HIGH",
  PRICE_TREND: "MEDIUM",
  INDUSTRY_NEWS: "LOW",
};

const RANK: Record<InsightSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Refrigerant designations mentioned in free text, normalised: "r404a" → "R-404A". */
export function refrigerantsMentioned(text: string): string[] {
  const found = new Set<string>();
  for (const raw of text.matchAll(/\bR[-\s]?(\d{2,4})([A-Za-z]?)\b/g)) {
    found.add(`R-${raw[1]}${raw[2] ? raw[2].toUpperCase() : ""}`);
  }
  return [...found];
}

/**
 * Latest insights, newest and most severe first.
 *
 * The MarketInsight read is wrapped: the table is new, and an environment that
 * has not run `db push` yet would otherwise take the whole hub down with a
 * Postgres "relation does not exist". Exactly the situation the pgvector table
 * was in — the schema was committed long before the database had it. The feed
 * alone is a perfectly good hub in the meantime.
 *
 * `cache()`-wrapped: the hub page renders the insight column AND the briefing
 * action reads the same rows to personalise from. Without request-level dedupe
 * that is two identical queries per view, and the two could disagree if a row
 * landed between them — the panel would cite an insight the briefing had never
 * seen.
 */
export const getMarketInsights = cache(async function getMarketInsights(
  limit = 8
): Promise<InsightItem[]> {
  const take = Math.min(Math.max(1, Math.trunc(limit)), 40);

  const [curated, alerts] = await Promise.all([
    prisma.marketInsight
      .findMany({
        orderBy: { publishedAt: "desc" },
        take,
        select: { id: true, title: true, content: true, severity: true, tags: true, publishedAt: true },
      })
      .catch((error: unknown) => {
        console.error("[hub] MarketInsight unavailable, falling back to the live feed:", error);
        return [] as Array<{
          id: string;
          title: string;
          content: string;
          severity: InsightSeverity;
          tags: string[];
          publishedAt: Date;
        }>;
      }),
    getMarketAlerts(),
  ]);

  const items: InsightItem[] = [
    ...curated.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      severity: row.severity as InsightSeverity,
      // A curated row may not list the gases it concerns; read them out of the
      // text so personalisation still matches.
      tags: row.tags.length > 0 ? row.tags : refrigerantsMentioned(`${row.title} ${row.content}`),
      publishedAt: row.publishedAt.toISOString(),
      origin: "curated" as const,
      category: classifyHeadline(row.title).tag,
      equipment: isEquipmentStory(`${row.title} ${row.content}`),
    })),
    ...alerts.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.body,
      severity: FEED_SEVERITY[a.tag],
      tags: refrigerantsMentioned(`${a.title} ${a.body}`),
      publishedAt: a.publishedAt,
      origin: "feed" as const,
      link: a.link,
      source: a.source,
      category: a.tag,
      equipment: isEquipmentStory(`${a.title} ${a.body}`),
    })),
  ];

  return items
    .sort((a, b) => {
      if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
      if (a.origin !== b.origin) return a.origin === "curated" ? -1 : 1;
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    })
    .slice(0, take);
});

/**
 * Re-orders insights around the gases an account actually buys: the ones that
 * name a held refrigerant first, then whatever else is HIGH.
 *
 * Shared by the insight column and the briefing action so the two agree. They
 * had drifted apart once already — the panel would happily list a story the
 * briefing had never been shown, which reads as the AI having missed it.
 */
export function prioritiseForRefrigerants(
  insights: InsightItem[],
  refrigerants: string[],
  limit = 6
): InsightItem[] {
  const marks = new Set(refrigerants);
  const matched = insights.filter((i) => i.tags.some((t) => marks.has(t)));
  const matchedIds = new Set(matched.map((i) => i.id));
  return [
    ...matched,
    ...insights.filter((i) => !matchedIds.has(i.id) && i.severity === "HIGH"),
    // Everything else, so a buyer with no matches still gets a full column
    // rather than a panel that looks broken.
    ...insights.filter((i) => !matchedIds.has(i.id) && i.severity !== "HIGH"),
  ].slice(0, limit);
}
