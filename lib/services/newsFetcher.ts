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
// Per feed, all fetched in parallel. Only ever paid by a cache refresh: the
// page is static (ISR) and unstable_cache serves the previous batch while it
// re-fetches, so no visitor waits on a slow feed — but a regeneration does.
const FEED_TIMEOUT_MS = 3500;

/**
 * How many items the widget can hold. The desktop card shows ~3 and scrolls
 * the rest; when the charge calculator beside it opens a result, the card
 * grows with it and fills with the extra items instead of leaving a gap.
 */
export const NEWS_ITEM_LIMIT = 8;

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

/**
 * Relevance to a refrigerant / HVAC buyer.
 *
 * Even a trade feed carries the odd story whose HEADLINE is geopolitics —
 * Cooling Post's "Iran says French claims are baseless and malicious" is about
 * cyber attacks on refrigeration systems, but nothing in the card says so, and
 * a buyer reads it as off-topic world news. So:
 *
 *   - an HVAC/refrigerant term in the headline     → keep
 *   - otherwise, a term in the body or the feed's
 *     categories, AND a headline that is not
 *     politics / conflict / cyber                   → keep
 *   - anything else                                 → drop
 *
 * Headline-only matching would be far too strict for trade press, whose
 * headlines name companies and people ("Daikin Applied buys German
 * contractor Ganter", "IOR extends training outreach programme") — measured
 * on the live feed it kept 1 item in 10. The body is where the trade context
 * lives; the headline is what decides whether it reads as industry news.
 */
const INDUSTRY_TERMS =
  /\b(refrigera\w*|refrigerants?|f[-\s]?gas(es)?|hfcs?|hfos?|hcfcs?|r-?\d{2,4}[a-z]?|gwp|co2|carbon dioxide|ammonia|propane|isobutane|a2l|natural refrigerants?|heat[-\s]?pumps?|chillers?|cooling|air[-\s]?condition\w*|hvacr?|ahri|compressors?|cylinders?|quotas?|pfas|cold[-\s]?(chain|store|room)s?|condens\w+|evaporat\w+|leak[-\s]?(check|test|detect)\w*|ventilation|heating)\b/i;

const OFF_TOPIC_HEADLINE =
  /\b(iran\w*|israel\w*|gaza|hamas|hezbollah|russia\w*|kremlin|putin|war|wars|warfare|military|missiles?|troops|army|sanctions?|election\w*|president(ial)?|prime minister|parliament|minister|diplomat\w*|cyber\w*|hack(er|ers|ed|ing)?|ransomware|terror\w*|accus\w+|baseless|malicious|protests?|coup)\b/i;

export function isIndustryRelevant(item: { title: string; body?: string; categories?: readonly string[] }): boolean {
  if (INDUSTRY_TERMS.test(item.title)) return true;
  if (OFF_TOPIC_HEADLINE.test(item.title)) return false;
  return INDUSTRY_TERMS.test(item.body ?? "") || (item.categories ?? []).some((category) => INDUSTRY_TERMS.test(category));
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

  const fullText = stripFeedBoilerplate(toPlainText(item.contentSnippet ?? item.content ?? ""));
  // Judged on the whole snippet, not the 100-character card excerpt.
  if (!isIndustryRelevant({ title, body: fullText, categories: item.categories })) return null;

  const { tag, tone } = classifyHeadline(title, item.categories ?? []);
  const snippet = truncate(fullText);

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

/** One retry: the feed host answers in ~0.5s, but drops the odd request entirely. */
async function parseWithRetry(url: string) {
  try {
    return await parser.parseURL(url);
  } catch {
    return await parser.parseURL(url);
  }
}

/**
 * Pulls every configured feed, newest first. A feed that is slow, down or
 * malformed is skipped rather than failing the batch — the dashboard shows
 * the sources that did answer.
 *
 * If NO feed answers, this throws instead of returning []. That difference
 * is the whole fix for the widget sticking on "No market alerts right now":
 * the caller wraps this in a one-hour unstable_cache, and an empty array is
 * a successful result — so a single timed-out request used to be cached as
 * "there is no news" for an hour, and re-cached by every revalidation that
 * hit the same blip. A throw is not cached: the previous good batch keeps
 * being served (stale) and the next request tries again.
 */
export async function fetchIndustryNews(limit = NEWS_ITEM_LIMIT): Promise<MarketAlertData[]> {
  const feeds = configuredFeeds();

  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      const parsed = await parseWithRetry(feed.url);
      return (parsed.items ?? []).map((item) => toMarketAlert(item, feed.source));
    })
  );

  if (settled.every((outcome) => outcome.status === "rejected")) {
    throw new AggregateError(
      settled.map((outcome) => (outcome as PromiseRejectedResult).reason),
      `all ${feeds.length} news feed(s) failed`
    );
  }

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
