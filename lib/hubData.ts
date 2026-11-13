import "server-only";

import prisma from "@/lib/prisma";
import { getCustomerComplianceSummary } from "@/lib/compliance";
import { getMarketInsights, prioritiseForRefrigerants, refrigerantsMentioned } from "@/lib/marketInsights";
import { getGasIndex, getPriceHistory, labelForMark, type GasIndex, type PricePoint } from "@/lib/priceHistory";
import { getUserSpendTrend } from "@/lib/user/analytics";
import { tallyFor, type VoteChoice, type VoteTally } from "@/lib/hubVotes";

/**
 * Everything /hub renders, read once on the server. Every figure is a row:
 * catalog prices (the index), recorded price snapshots (the chart), the
 * buyer's supplied-gas ledger and orders (the portfolio), the industry feed
 * and curated insights (the digest), and the buyer's own alerts, votes and
 * bookmarks.
 */

export interface HubInsight {
  id: string;
  title: string;
  content: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "REGULATION" | "PRICE_TREND" | "SUPPLY" | "INDUSTRY_NEWS";
  equipment: boolean;
  /** Refrigerants the story names ("R-404A"). */
  gases: string[];
  /** Names a gas this buyer has been supplied. */
  inPortfolio: boolean;
  publishedAt: string | null;
  origin: "curated" | "feed";
  link: string | null;
  source: string | null;
  tally: VoteTally;
  myVote: VoteChoice | null;
  saved: boolean;
}

export interface PortfolioGas {
  gas: string;
  massKg: number;
  co2eTonnes: number;
  gwp: number | null;
}

export interface HubPortfolio {
  gases: PortfolioGas[];
  massKg: number;
  co2eTonnes: number;
  /** Gross spend over the last 12 months, EUR (goods + deposit + freight + VAT). */
  spend12m: number;
  orders12m: number;
  /** Lines in the buyer's F-Gas ledger (all time). */
  lines: number;
}

export interface HubAlert {
  mark: string;
  targetPerKg: number;
  triggeredAt: string | null;
}

export interface HubData {
  signedIn: boolean;
  index: GasIndex[];
  history: Record<string, PricePoint[]>;
  historyStart: string | null;
  insights: HubInsight[];
  /** Saved stories no longer in the live feed — still listed under "Saved". */
  savedArchive: Array<{ id: string; title: string; link: string | null; source: string | null; savedAt: string }>;
  portfolio: HubPortfolio | null;
  alerts: HubAlert[];
}

export async function getHubData(userId: string | null): Promise<HubData> {
  const [index, { series, firstDay }, insights] = await Promise.all([getGasIndex(), getPriceHistory(), getMarketInsights(30)]);

  const [summary, spend, alerts, votes, bookmarks] = userId
    ? await Promise.all([
        getCustomerComplianceSummary(userId, { period: "all" }),
        getUserSpendTrend(12),
        prisma.priceAlert.findMany({ where: { userId }, select: { mark: true, targetPerKg: true, triggeredAt: true } }),
        prisma.insightVote.findMany({ where: { userId }, select: { insightId: true, choice: true } }),
        prisma.insightBookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { insightId: true, title: true, link: true, source: true, createdAt: true } }),
      ])
    : [null, [], [], [], []];

  const owned = summary?.byRefrigerant.map((r) => r.refrigerant) ?? [];
  const ordered = prioritiseForRefrigerants(insights, owned, 30);
  const tallies = await tallyFor(ordered.map((i) => i.id));
  const myVotes = new Map(votes.map((v) => [v.insightId, v.choice as VoteChoice]));
  const savedIds = new Set(bookmarks.map((b) => b.insightId));
  const ownedSet = new Set(owned);

  const hubInsights: HubInsight[] = ordered.map((i) => {
    const gases = i.tags.length ? i.tags : refrigerantsMentioned(`${i.title} ${i.content}`);
    return {
      id: i.id,
      title: i.title,
      content: i.content,
      severity: i.severity,
      category: i.category,
      equipment: i.equipment,
      gases,
      inPortfolio: gases.some((g) => ownedSet.has(g)),
      publishedAt: i.publishedAt,
      origin: i.origin,
      link: i.link ?? null,
      source: i.source ?? null,
      tally: tallies[i.id] ?? { UP: 0, DOWN: 0, FLAT: 0 },
      myVote: myVotes.get(i.id) ?? null,
      saved: savedIds.has(i.id),
    };
  });
  const live = new Set(hubInsights.map((i) => i.id));

  return {
    signedIn: Boolean(userId),
    index,
    history: series,
    historyStart: firstDay,
    insights: hubInsights,
    savedArchive: bookmarks.filter((b) => !live.has(b.insightId)).map((b) => ({ id: b.insightId, title: b.title, link: b.link, source: b.source, savedAt: b.createdAt.toISOString() })),
    portfolio: summary
      ? {
          gases: summary.byRefrigerant.map((r) => ({ gas: r.refrigerant, massKg: r.massKg, co2eTonnes: r.co2eTonnes, gwp: r.gwp })),
          massKg: summary.allTime.massKg,
          co2eTonnes: summary.allTime.co2eTonnes,
          spend12m: Math.round(spend.reduce((s, p) => s + p.spend, 0) * 100) / 100,
          orders12m: spend.reduce((s, p) => s + p.orders, 0),
          lines: summary.record.lines,
        }
      : null,
    alerts: alerts.map((a) => ({ mark: a.mark, targetPerKg: Number(a.targetPerKg), triggeredAt: a.triggeredAt?.toISOString() ?? null })),
  };
}

export { labelForMark };
