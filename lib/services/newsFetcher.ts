import "server-only";

import Parser from "rss-parser";
import { isValid, parseISO } from "date-fns";

/**
 * Live industry news for the dashboard's Market Alerts widget.
 *
 * Replaces the model-generated blurbs this widget used to show: those read
 * like trade press but were invented, which is the wrong thing to put in
 * front of a buyer making a purchasing decision. Every item here is a real
 * article from a real publication, and links back to it.
 *
 * rss-parser talks to the feed over Node's http stack rather than `fetch`,
 * so Next's fetch cache never sees it — the revalidation window lives in the
 * `unstable_cache` wrapper in lib/data.ts (1 hour), which is also what keeps
 * us from hammering the publisher on every page load.
 */

/** Where the widget's news comes from. Override with NEWS_FEED_URLS. */
const DEFAULT_FEEDS = [
  { url: "https://www.coolingpost.com/feed/", source: "Cooling Post" },
] as const;

/** Give up on a slow feed rather than hold the dashboard render open. */
const FEED_TIMEOUT_MS = 6000;

/** How many items the widget can show at most. */
export const NEWS_ITEM_LIMIT = 4;

/** ~100 characters, as a snippet not an article. */
const SNIPPET_MAX = 100;

export type MarketAlertTag = "REGULATION" | "PRICE_TREND" | "SUPPLY" | "INDUSTRY_NEWS";

/**
 * One widget row. `tag` / `body` / `link` are the spec's tag / description /
 * link; `tone` drives the existing colour treatment, and `eyebrow` is kept
 * as the English fallback label for any surface that doesn't translate.
 */
export interface MarketAlertData {
  id: string;
  tone: "warning" | "success";
  tag: MarketAlertTag;
  title: string;
  /** Trimmed contentSnippet from the feed. */
  body: string;
  /** Canonical article URL — every row is a link out. */
  link: string;
  /** ISO timestamp, or null when the feed omits a usable date. */
  publishedAt: string | null;
  /** Publication name, shown next to the timestamp. */
  source: string;
}

/**
 * Headline → category. Order matters: regulation wins over price, because
 * "F-Gas quota drives prices up" is first and foremost a regulation story.
 */
const TAG_RULES: Array<{ tag: MarketAlertTag; test: RegExp }> = [
  {
    tag: "REGULATION",
    test: /\bf[-\s]?gas(es)?\b|regulation|directive|legislat|quota|phase[-\s]?(down|out)|\bban(s|ned|ning)?\b|complian|\bEPA\b|kigali|montreal protocol|\bEU\b.*\brules?\b/i,
  },
  {
    tag: "PRICE_TREND",
    test: /\bprices?\b|pricing|\bcosts?\b|tariff|levy|surcharge|inflation|\bmarket rate/i,
  },
  {
    tag: "SUPPLY",
    test: /shortage|supply|stocks?\b|availability|disrupt|capacity|\bimports?\b|lead[-\s]?time/i,
  },
];

/** Price news that reads as relief rather than pressure. */
const GOOD_NEWS = /\b(fall|falls|fell|drop|drops|dropped|decline|declines|cut|cuts|lower|ease|eases|down)\b/i;

/**
 * Categorises an item from its headline, falling back to the feed's own
 * categories when the headline is neutral ("TectoCore sets new standards").
 *
 * The snippet is deliberately NOT consulted: body text mentions prices and
 * regulations in passing constantly, and mislabelling a product launch as a
 * price alert is worse than leaving it as general industry news.
 */
export function classifyHeadline(
  title: string,
  categories: readonly string[] = []
): { tag: MarketAlertTag; tone: "warning" | "success" } {
  const tag =
    TAG_RULES.find((rule) => rule.test.test(title))?.tag ??
    TAG_RULES.find((rule) => categories.some((category) => rule.test.test(category)))?.tag ??
    "INDUSTRY_NEWS";
  if (tag === "INDUSTRY_NEWS") return { tag, tone: "success" };
  // A price coming down is not a warning.
  if (tag === "PRICE_TREND" && GOOD_NEWS.test(title)) return { tag, tone: "success" };
  return { tag, tone: "warning" };
}

/** English fallback labels, mirrored by the Dashboard.tag* message keys. */
const TAG_LABEL: Record<MarketAlertTag, string> = {
  REGULATION: "REGULATION",
  PRICE_TREND: "PRICE TREND",
  SUPPLY: "SUPPLY",
  INDUSTRY_NEWS: "INDUSTRY NEWS",
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/**
 * WordPress feeds (Cooling Post included) append a fixed tail to every
 * snippet: "Read More… The post <title> appeared first on <site>." Left in,
 * a short article's description would be mostly boilerplate.
 */
const BOILERPLATE = [
  /\bThe post\b[\s\S]*?\bappeared first on\b[^.]*\.?/gi,
  /\bRead More\b\s*\.{0,3}/gi,
  /\bContinue reading\b[^.]*\.?/gi,
  /\[…\]|\[\.\.\.\]/g,
];

export function stripFeedBoilerplate(text: string): string {
  return BOILERPLATE.reduce((acc, pattern) => acc.replace(pattern, " "), text)
    // The tail often leaves a run of dots behind ("to Tesco....").
    .replace(/\.{2,}/g, "…")
    .replace(/\s+/g, " ")
    .trim();
}

/** Feeds ship half-escaped HTML; flatten it to the plain text the card shows. */
export function toPlainText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuts to `max` characters on a word boundary, adding an ellipsis. */
export function truncate(text: string, max = SNIPPET_MAX): string {
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only honour the word boundary if it isn't cutting the snippet in half.
  return `${(lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** RFC-822 (`Tue, 09 Sep 2026 10:00:00 +0000`) or ISO → ISO, or null. */
export function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const iso = parseISO(raw);
  if (isValid(iso)) return iso.toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

interface FeedSource {
  url: string;
  source: string;
}

/** NEWS_FEED_URLS="https://a/feed|Name A,https://b/feed|Name B" */
function configuredFeeds(): readonly FeedSource[] {
  const raw = process.env.NEWS_FEED_URLS?.trim();
  if (!raw) return DEFAULT_FEEDS;

  const parsed = raw
    .split(",")
    .map((entry) => {
      const [url, name] = entry.split("|").map((part) => part.trim());
      if (!url || !/^https?:\/\//i.test(url)) return null;
      return { url, source: name || new URL(url).hostname.replace(/^www\./, "") };
    })
    .filter((feed): feed is FeedSource => feed !== null);

  return parsed.length > 0 ? parsed : DEFAULT_FEEDS;
}

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: { "User-Agent": "MyEnergyStorefront/1.0 (+https://myenergy.example; industry news widget)" },
});

/** Shape the widget needs out of one feed entry. */
export function toMarketAlert(
  item: {
    title?: string;
    link?: string;
    contentSnippet?: string;
    content?: string;
    isoDate?: string;
    pubDate?: string;
    categories?: string[];
  },
  source: string
): MarketAlertData | null {
  const title = toPlainText(item.title ?? "");
  const link = (item.link ?? "").trim();
  // Both are load-bearing: a row with no headline says nothing, and a row
  // with no link is a dead end the hover state would be lying about.
  if (!title || !/^https?:\/\//i.test(link)) return null;

  const { tag, tone } = classifyHeadline(title, item.categories ?? []);
  const snippet = truncate(stripFeedBoilerplate(toPlainText(item.contentSnippet ?? item.content ?? "")));

  return {
    id: link,
    tone,
    tag,
    title,
    // Falling back to the headline would just repeat it; an empty body lets
    // the card drop the line instead.
    body: snippet,
    link,
    publishedAt: toIsoDate(item.isoDate ?? item.pubDate),
    source,
  };
}

/** English label for a tag — the fallback when no translation is at hand. */
export function tagLabel(tag: MarketAlertTag): string {
  return TAG_LABEL[tag];
}

/**
 * Pulls every configured feed, newest first. A feed that is slow, down or
 * malformed is skipped rather than failing the batch — the dashboard shows
 * the sources that did answer, and its empty state if none did.
 */
export async function fetchIndustryNews(limit = NEWS_ITEM_LIMIT): Promise<MarketAlertData[]> {
  const feeds = configuredFeeds();

  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items ?? []).map((item) => toMarketAlert(item, feed.source));
    })
  );

  const alerts: MarketAlertData[] = [];
  const seen = new Set<string>();

  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(`news feed ${feeds[index].url} failed:`, outcome.reason);
      continue;
    }
    for (const alert of outcome.value) {
      if (!alert) continue;
      // Syndicated stories repeat across feeds; the link is the identity.
      const key = alert.link.replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      alerts.push(alert);
    }
  }

  return alerts
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, Math.max(1, limit));
}
