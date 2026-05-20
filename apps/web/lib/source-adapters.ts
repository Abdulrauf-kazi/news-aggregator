import Parser from "rss-parser";
import {
  createStoryGraphFromRecommendations,
  createStoryGraphFromStories,
  type StoryGraph,
  type StoryNode,
} from "./graph";
import {
  mergeAndStoreStories,
  storeIngestionReport,
  storeSourceMetrics,
  type SourceIngestionMetric,
} from "./story-db";
import { addEmbeddingsToStories } from "./embeddings";
import { SOURCE_DEFINITIONS, TOPICS, type SourceDefinition } from "./sources";
import { isSyntheticStory } from "./story-quality";
import { buildStoryRecommendations } from "./vector-store";

const REQUEST_TIMEOUT_MS = 8000;
const STORIES_PER_SOURCE = 10;
const VECTOR_SEARCH_TOP_K = Number(process.env.VECTOR_SEARCH_TOP_K ?? 5);
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;
const EIA_API_KEY = process.env.EIA_API_KEY;

const topicKeywords: Record<string, string[]> = {
  Macro: ["inflation", "fed", "rate", "yield", "economy"],
  Energy: ["energy", "oil", "gas", "power", "grid"],
  Cyber: ["cyber", "malware", "hack", "threat", "security"],
  Geopolitics: ["conflict", "war", "sanction", "border", "military"],
  Climate: ["climate", "storm", "flood", "wildfire", "weather"],
  Defense: ["defense", "airspace", "navy", "aircraft", "weapon"],
  AI: ["ai", "model", "machine learning", "automation", "neural"],
  Logistics: ["shipping", "port", "supply chain", "aviation", "cargo"],
};

const scoreFromText = (text: string, weight = 1) => {
  const base = text.length + weight * 13;
  return 48 + (base % 48);
};

const toTopic = (text: string) => {
  const lower = text.toLowerCase();
  for (const [topic, words] of Object.entries(topicKeywords)) {
    if (words.some((word) => lower.includes(word))) {
      return topic;
    }
  }
  const idx = Math.abs(text.length) % TOPICS.length;
  return TOPICS[idx] as string;
};

const cleanText = (value: string) =>
  value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const toIsoTimestamp = (value?: string | number) => {
  if (value == null) {
    return new Date().toISOString();
  }

  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return new Date().toISOString();
  }

  if (/^\d{14}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    const hour = Number(trimmed.slice(8, 10));
    const minute = Number(trimmed.slice(10, 12));
    const second = Number(trimmed.slice(12, 14));
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute, second),
    ).toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return new Date().toISOString();
  }
  return new Date(parsed).toISOString();
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

const requestText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.9",
      },
      signal: controller.signal,
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.text();
  } finally {
    clearTimeout(timeout);
  }
};

const createStory = (
  sourceId: string,
  externalId: string,
  title: string,
  timestamp?: string,
  extraSourceIds: string[] = [],
  content?: string,
  url?: string,
  publisherUrl?: string,
): StoryNode => {
  const normalizedTitle = cleanText(title || `Signal from ${sourceId}`);
  const cleanedContent = content ? cleanText(content) : undefined;
  
  return {
    id: `story:${sourceId}:${externalId}`,
    title: normalizedTitle,
    content: cleanedContent && cleanedContent !== normalizedTitle ? cleanedContent : undefined,
    topic: toTopic(normalizedTitle),
    score: scoreFromText(normalizedTitle, extraSourceIds.length + 1),
    sourceIds: [sourceId, ...extraSourceIds],
    timestamp: timestamp ?? new Date().toISOString(),
    url,
    publisherUrl,
  };
};

const GOOGLE_NEWS_LINK_PATTERN = /news\.google\.com\/rss\/articles\//i;

const extractXmlSourceUrls = (xml: string) => {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item")
    .toArray()
    .map((item) => {
      // Google News RSS puts the real publisher URL in the <source> element's url attribute
      const sourceUrl = $(item).find("source").attr("url");
      if (sourceUrl) return sourceUrl;
      
      // Also try to extract from the link text if it contains a redirect
      const linkText = $(item).find("link").text().trim();
      if (linkText && linkText.startsWith("http") && !linkText.includes("news.google.com")) {
        return linkText;
      }
      
      return undefined;
    });
};

const rssParser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});

const fetchRssStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  try {
    const xml = await requestText(source.endpoint);
    const feed = await rssParser.parseString(xml);
    const sourceUrls = extractXmlSourceUrls(xml);
    return (feed.items || [])
      .slice(0, STORIES_PER_SOURCE)
      .map((item, idx) => {
        const publisherUrl = sourceUrls[idx];
        // Use publisherUrl as primary if available, otherwise fall back to item link
        const url = publisherUrl || item.link || item.guid || (item as any).uri;
        const rawContent = item.contentSnippet || item.content || item.summary || (item as any).description || '';
        const content = cleanText(rawContent);
        const title = cleanText(item.title || "RSS item");
        
        return createStory(
          source.id,
          item.guid || item.link || `${idx}`,
          title,
          item.isoDate || item.pubDate,
          ["rss2json"],
          content && content !== title ? content : undefined,
          url,
          publisherUrl
        );
      });
  } catch (e) {
    console.warn(`RSS parse failed for ${source.id}:`, e);
    return [];
  }
};

const fetchGoogleNewsRssStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  try {
    const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(source.label || source.id)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await requestText(googleNewsUrl);
    const feed = await rssParser.parseString(xml);
    const sourceUrls = extractXmlSourceUrls(xml);
    return (feed.items || [])
      .slice(0, STORIES_PER_SOURCE)
      .map((item, idx) => {
        const publisherUrl = sourceUrls[idx];
        // Use publisherUrl as primary if available, otherwise fall back to item link
        const url = publisherUrl || item.link || item.guid || (item as any).uri;
        const rawContent = item.contentSnippet || item.content || item.summary || (item as any).description || '';
        const content = cleanText(rawContent);
        const title = cleanText(item.title || "Google News item");
        
        return createStory(
          source.id,
          item.guid || item.link || `gn-${idx}`,
          title,
          item.isoDate || item.pubDate,
          ["google-news", "rss-atom"],
          content && content !== title ? content : undefined,
          url,
          publisherUrl
        );
      });
  } catch (e) {
    console.warn(`Google News RSS failed for ${source.id}:`, e);
    return [];
  }
};

const fetchRss2JsonStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const payload = await requestJson<{
    items?: Array<{ title?: string; pubDate?: string; guid?: string; link?: string; description?: string; content?: string }>;
  }>(source.endpoint);
  return (payload.items ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((item, idx) =>
      createStory(
        source.id,
        item.guid ?? `${idx}`,
        item.title ?? "RSS2JSON item",
        item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
        ["rss-atom"],
        item.description || item.content,
        item.link,
        item.link
      ),
    );
};

const fetchGdeltStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const payload = await requestJson<{
    articles?: Array<{
      title?: string;
      url?: string;
      seendate?: string;
    }>;
  }>(source.endpoint);

  return (payload.articles ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((article, idx) =>
      createStory(
        source.id,
        article.url ?? `${idx}`,
        article.title ?? "GDELT event",
        toIsoTimestamp(article.seendate),
        ["rss-atom"],
        undefined,
        article.url,
        article.url
      ),
    );
};

const fetchFinnhubStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  if (!FINNHUB_API_KEY) {
    throw new Error("FINNHUB_API_KEY missing");
  }

  const endpoint = `${source.endpoint}${
    source.endpoint.includes("?") ? "&" : "?"
  }token=${encodeURIComponent(FINNHUB_API_KEY)}`;

  const payload = await requestJson<
    Array<{
      id?: number;
      datetime?: number;
      headline?: string;
      summary?: string;
      url?: string;
    }>
  >(endpoint, {
    headers: {
      "X-Finnhub-Token": FINNHUB_API_KEY,
    },
  });

  return payload
    .slice(0, STORIES_PER_SOURCE)
    .map((item, idx) =>
      createStory(
        source.id,
        `${item.id ?? idx}`,
        item.headline ?? "Finnhub market update",
        toIsoTimestamp(item.datetime),
        ["yahoo-finance", "fred"],
        item.summary || item.url,
        item.url,
        item.url
      ),
    );
};

const fetchFredStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  if (!FRED_API_KEY) {
    throw new Error("FRED_API_KEY missing");
  }
  const endpoint = `${source.endpoint}${
    source.endpoint.includes("?") ? "&" : "?"
  }api_key=${encodeURIComponent(FRED_API_KEY)}`;

  const payload = await requestJson<{
    releases?: Array<{ id?: string; name?: string; realtime_start?: string; link?: string }>;
  }>(endpoint);

  return (payload.releases ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((release, idx) =>
      createStory(
        source.id,
        release.id ?? `${idx}`,
        `FRED Release: ${release.name}`,
        release.realtime_start,
        ["finnhub", "yahoo-finance"],
        undefined,
        release.link || `https://fred.stlouisfed.org/release?rid=${release.id}`,
        release.link || `https://fred.stlouisfed.org/release?rid=${release.id}`
      ),
    );
};

const fetchEiaStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  if (!EIA_API_KEY) {
    throw new Error("EIA_API_KEY missing");
  }
  const endpoint = `${source.endpoint}${
    source.endpoint.includes("?") ? "&" : "?"
  }api_key=${encodeURIComponent(EIA_API_KEY)}`;

  const payload = await requestJson<{
    response?: {
      data?: Array<{ period?: string; value?: number; region?: string }>;
    };
  }>(endpoint);

  return (payload.response?.data ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((item, idx) =>
      createStory(
        source.id,
        `${item.period}-${idx}`,
        `EIA Energy Metric: ${item.region ?? "Global"} power output`,
        item.period,
        ["fred", "finnhub"],
        undefined,
        source.endpoint,
        source.endpoint
      ),
    );
};

const fetchHackerNewsStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const ids = await requestJson<number[]>(source.endpoint);
  const topIds = ids.slice(0, STORIES_PER_SOURCE);
  const items = await Promise.all(
    topIds.map((id) =>
      requestJson<{ title?: string; time?: number; url?: string }>(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      ).catch(() => null),
    ),
  );

  return items
    .map((item, idx) => {
      if (!item) {
        return null;
      }
      return createStory(
        source.id,
        `${topIds[idx]}`,
        item.title ?? `Hacker News ${topIds[idx]}`,
        item.time ? new Date(item.time * 1000).toISOString() : undefined,
        ["github"],
        undefined,
        item.url || `https://news.ycombinator.com/item?id=${topIds[idx]}`,
        item.url || `https://news.ycombinator.com/item?id=${topIds[idx]}`
      );
    })
    .filter((story): story is StoryNode => Boolean(story));
};

const fetchGithubStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const events = await requestJson<
    Array<{
      id: string;
      type: string;
      repo?: { name?: string; url?: string };
      created_at?: string;
    }>
  >(source.endpoint, {
    headers: { "User-Agent": "news-aggregator" },
  });

  return events
    .slice(0, STORIES_PER_SOURCE)
    .map((event, idx) =>
      createStory(
        source.id,
        event.id,
        `${event.type} on ${event.repo?.name ?? "unknown/repo"}`,
        event.created_at,
        idx % 2 === 0 ? ["hacker-news", "c2intelfeeds"] : ["hacker-news"],
        undefined,
        event.repo?.name ? `https://github.com/${event.repo.name}` : undefined,
        event.repo?.name ? `https://github.com/${event.repo.name}` : undefined
      ),
    );
};

const fetchArxivStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const xml = await requestText(source.endpoint);
  const entryRegex =
    /<entry>[\s\S]*?<id>(.*?)<\/id>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<published>(.*?)<\/published>[\s\S]*?<\/entry>/g;
  const entries: StoryNode[] = [];
  let match = entryRegex.exec(xml);
  while (match && entries.length < STORIES_PER_SOURCE) {
    const url = cleanText(match[1] ?? "");
    entries.push(
      createStory(
        source.id,
        url || "arxiv",
        cleanText(match[2] ?? "arXiv paper"),
        new Date(match[3] ?? Date.now()).toISOString(),
        ["hacker-news"],
        undefined,
        url,
        url
      ),
    );
    match = entryRegex.exec(xml);
  }
  return entries;
};

const fetchCoinGeckoStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const payload = await requestJson<{
    coins?: Array<{
      item?: { id?: string; name?: string; market_cap_rank?: number };
    }>;
  }>(source.endpoint);

  return (payload.coins ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((coin, idx) =>
      createStory(
        source.id,
        coin.item?.id ?? `${idx}`,
        `${coin.item?.name ?? "Asset"} trending in crypto markets`,
        new Date().toISOString(),
        ["yahoo-finance", "finnhub"],
        undefined,
        coin.item?.id ? `https://www.coingecko.com/en/coins/${coin.item.id}` : undefined,
        coin.item?.id ? `https://www.coingecko.com/en/coins/${coin.item.id}` : undefined
      ),
    );
};

const fetchUsgsStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const payload = await requestJson<{
    features?: Array<{
      id?: string;
      properties?: { title?: string; time?: number; url?: string };
    }>;
  }>(source.endpoint);

  return (payload.features ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((item, idx) =>
      createStory(
        source.id,
        item.id ?? `${idx}`,
        item.properties?.title ?? "USGS event",
        item.properties?.time
          ? new Date(item.properties.time).toISOString()
          : undefined,
        ["nasa-eonet", "nws"],
        undefined,
        item.properties?.url,
        item.properties?.url
      ),
    );
};

const fetchNasaEonetStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const payload = await requestJson<{
    events?: Array<{
      id?: string;
      title?: string;
      geometry?: Array<{ date?: string }>;
      sources?: Array<{ url?: string }>;
    }>;
  }>(source.endpoint);

  return (payload.events ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((event, idx) =>
      createStory(
        source.id,
        event.id ?? `${idx}`,
        event.title ?? "NASA EONET event",
        event.geometry?.[0]?.date,
        ["usgs", "nws"],
        undefined,
        event.sources?.[0]?.url,
        event.sources?.[0]?.url
      ),
    );
};

const fetchNwsStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  const payload = await requestJson<{
    features?: Array<{
      id?: string;
      properties?: { event?: string; effective?: string; description?: string };
    }>;
  }>(source.endpoint, {
    headers: { "User-Agent": "news-aggregator" },
  });

  return (payload.features ?? [])
    .slice(0, STORIES_PER_SOURCE)
    .map((alert, idx) =>
      createStory(
        source.id,
        alert.id ?? `${idx}`,
        alert.properties?.event ?? "NWS active alert",
        alert.properties?.effective,
        ["usgs", "nasa-eonet"],
        alert.properties?.description,
        alert.id,
        alert.id
      ),
    );
};

const fetchGenericStories = async (
  source: SourceDefinition,
): Promise<StoryNode[]> => {
  try {
    const payload = await requestJson<Record<string, unknown> | unknown[]>(source.endpoint, {
      headers: {
        "User-Agent": "news-aggregator",
        Accept: "application/json,text/plain,*/*",
      },
    });

    // Try to find an array in the payload
    let items: Record<string, unknown>[] = [];
    if (Array.isArray(payload)) {
      items = payload as Record<string, unknown>[];
    } else if (typeof payload === "object" && payload !== null) {
      // Common wrappers: data, items, results, articles, events, states
      const keys = ["data", "items", "results", "articles", "events", "states", "releases", "alerts", "features"];
      for (const key of keys) {
        if (Array.isArray(payload[key])) {
          items = payload[key] as Record<string, unknown>[];
          break;
        }
      }
      // If still not found, check any array property
      if (items.length === 0) {
        const firstArray = Object.values(payload).find(v => Array.isArray(v));
        if (Array.isArray(firstArray)) {
          items = firstArray as Record<string, unknown>[];
        }
      }
    }

    if (items.length > 0) {
      return items.slice(0, STORIES_PER_SOURCE).map((item, idx) => {
        // Try to find title/text/label
        const title = item.title || item.headline || item.text || item.label || item.name || item.event || 
                     (typeof item === 'string' ? item : `${source.label} Signal ${idx + 1}`);
        
        // Try to find ID
        const id = item.id || item.guid || item.url || item.key || `${idx}`;
        
        // Try to find timestamp
        const ts = item.timestamp || item.created_at || item.published || item.time || item.date || item.period;

        const url = item.url || item.link || item.guid || item.uri || (typeof item === 'string' && (item as string).startsWith('http') ? item : undefined);

        return createStory(
          source.id,
          `${id}`,
          typeof title === 'string' ? title : JSON.stringify(title).slice(0, 100),
          toIsoTimestamp(ts as string | number | undefined),
          [],
          (item.content as string) || (item.summary as string) || (item.description as string) || undefined,
          url as string | undefined,
          url as string | undefined
        );
      });
    }
  } catch (e) {
    console.warn(`Generic fetch failed for ${source.id}:`, e);
  }

  return [];
};

const fallbackForSource = (source: SourceDefinition): StoryNode[] => {
  const sourceFallbackContent: Record<string, string[]> = {
    "yahoo-finance": [
      "Global markets showed mixed signals today as investors weighed conflicting economic data. Major indices fluctuated amid uncertainty over interest rate policy and geopolitical tensions affecting commodity prices.",
      "Trading volumes remained elevated as institutional investors repositioned portfolios ahead of key economic releases. Analysts point to diverging signals from employment data and inflation metrics.",
    ],
    guardian: [
      "International developments continue to shape the global landscape as diplomatic efforts intensify across multiple regions. Key stakeholders are working toward consensus on critical policy matters.",
      "Analysis of recent events suggests shifting dynamics in international relations, with emerging trends pointing to new patterns of cooperation and competition among major powers.",
    ],
    "rss-atom": [
      "Breaking developments in world affairs have captured international attention as multiple events unfold simultaneously. Experts are analyzing the implications for global stability and economic outlook.",
      "Recent reports indicate significant changes in the international landscape, with analysts tracking multiple developing situations across different regions.",
    ],
    "hacker-news": [
      "The technology community is discussing emerging trends in software development and infrastructure. New approaches to system design are gaining traction among developers and engineers.",
      "Innovation in the tech sector continues at a rapid pace, with new tools and frameworks being released regularly. The community remains engaged in debates about best practices.",
    ],
    default: [
      "Developing story: Multiple sources are reporting on significant events with potential global implications. Analysts are monitoring the situation closely as more information becomes available.",
      "Update: New information has emerged regarding ongoing developments. Experts suggest the situation may have broader implications than initially anticipated.",
    ],
  };

  const contentPool = sourceFallbackContent[source.id] || sourceFallbackContent.default;

  let fallbackUrl: string | undefined;
  try {
    const parsed = new URL(source.endpoint);
    fallbackUrl = `${parsed.origin}`;
  } catch {
    fallbackUrl = undefined;
  }

  return Array.from({ length: 2 }).map((_, idx) => {
    const content = contentPool[idx % contentPool.length];
    const title = content.split(".")[0];
    return createStory(
      source.id,
      `fallback-${idx}`,
      title,
      new Date(Date.now() - idx * 300000).toISOString(),
      ["rss-atom"],
      content,
      fallbackUrl,
    );
  });
};

const DEDUPE_SIMILARITY_THRESHOLD = 0.9;

const cosineSimilarity = (left: number[], right: number[]) => {
  const size = Math.min(left.length, right.length);
  if (size === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < size; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (!denom) {
    return 0;
  }
  return dot / denom;
};

const normalizeEmbedding = (embedding: number[]) => {
  const norm = Math.sqrt(
    embedding.reduce((sum, value) => sum + value * value, 0),
  );
  if (!norm) {
    return embedding;
  }
  return embedding.map((value) => value / norm);
};

const mergeEmbeddings = (left?: number[], right?: number[]) => {
  if (!left?.length) {
    return right;
  }
  if (!right?.length) {
    return left;
  }
  const size = Math.min(left.length, right.length);
  const merged = new Array<number>(size);
  for (let i = 0; i < size; i += 1) {
    merged[i] = ((left[i] ?? 0) + (right[i] ?? 0)) / 2;
  }
  return normalizeEmbedding(merged);
};

const mergeStories = (left: StoryNode, right: StoryNode): StoryNode => {
  const leftTs = Date.parse(left.timestamp);
  const rightTs = Date.parse(right.timestamp);
  const newestTimestamp =
    Number.isNaN(leftTs) || Number.isNaN(rightTs)
      ? left.timestamp
      : leftTs >= rightTs
        ? left.timestamp
        : right.timestamp;

  const mergedSourceIds = Array.from(
    new Set([...left.sourceIds, ...right.sourceIds]),
  );

  const mergedTitle =
    left.title.length >= right.title.length ? left.title : right.title;
  const mergedContent =
    (left.content ?? "").length >= (right.content ?? "").length
      ? left.content
      : right.content;

  const mergedScore = Math.min(
    100,
    Math.round((left.score + right.score) / 2 + mergedSourceIds.length * 1.5),
  );

  return {
    ...left,
    title: mergedTitle,
    content: mergedContent,
    topic: left.score >= right.score ? left.topic : right.topic,
    score: mergedScore,
    sourceIds: mergedSourceIds,
    timestamp: newestTimestamp,
    embedding: mergeEmbeddings(left.embedding, right.embedding),
    url: left.url || right.url,
    publisherUrl: left.publisherUrl || right.publisherUrl,
  };
};

const canMergeStories = (left: StoryNode, right: StoryNode) => {
  if (left.url && right.url && left.url === right.url) {
    return true;
  }

  if (isSyntheticStory(left) || isSyntheticStory(right)) {
    return left.sourceIds.some((sourceId) => right.sourceIds.includes(sourceId));
  }

  if (GOOGLE_NEWS_LINK_PATTERN.test(left.url ?? "") || GOOGLE_NEWS_LINK_PATTERN.test(right.url ?? "")) {
    return (
      left.publisherUrl !== undefined &&
      right.publisherUrl !== undefined &&
      left.publisherUrl === right.publisherUrl
    );
  }

  return true;
};

const canonicalizeStories = (stories: StoryNode[]): StoryNode[] => {
  const canonical: StoryNode[] = [];

  for (const story of stories) {
    const embedding = story.embedding;
    if (!embedding?.length) {
      canonical.push(story);
      continue;
    }

    let merged = false;
    for (let i = 0; i < canonical.length; i += 1) {
      const candidate = canonical[i] as StoryNode;
      const candidateEmbedding = candidate.embedding;
      if (!candidateEmbedding?.length) {
        continue;
      }
      if (!canMergeStories(candidate, story)) {
        continue;
      }
      const similarity = cosineSimilarity(embedding, candidateEmbedding);
      if (similarity > DEDUPE_SIMILARITY_THRESHOLD) {
        canonical[i] = mergeStories(candidate, story);
        merged = true;
        break;
      }
    }

    if (!merged) {
      canonical.push(story);
    }
  }

  return canonical;
};

const enrichStoryRelations = (stories: StoryNode[]): StoryNode[] => {
  const byTopic = new Map<string, StoryNode[]>();
  for (const story of stories) {
    const items = byTopic.get(story.topic) ?? [];
    items.push(story);
    byTopic.set(story.topic, items);
  }

  return stories.map((story) => {
    const related = (byTopic.get(story.topic) ?? [])
      .filter((candidate) => candidate.id !== story.id)
      .slice(0, 4)
      .flatMap((candidate) => candidate.sourceIds)
      .filter((sourceId, idx, all) => all.indexOf(sourceId) === idx)
      .slice(0, 3);

    const mergedSourceIds = [...story.sourceIds];
    for (const sourceId of related) {
      if (!mergedSourceIds.includes(sourceId)) {
        mergedSourceIds.push(sourceId);
      }
    }

    return {
      ...story,
      sourceIds: mergedSourceIds,
    };
  });
};

const adapters: Partial<
  Record<
    SourceDefinition["id"],
    (source: SourceDefinition) => Promise<StoryNode[]>
  >
> = {
  "rss-atom": fetchRssStories,
  rss2json: fetchRss2JsonStories,
  "gdelt-conflict": fetchGdeltStories,
  "gdelt-tech": fetchGdeltStories,
  "gdelt-eco": fetchGdeltStories,
  "gdelt-climate": fetchGdeltStories,
  finnhub: fetchFinnhubStories,
  fred: fetchRssStories,
  eia: fetchEiaStories,
  "hacker-news": fetchHackerNewsStories,
  github: fetchGithubStories,
  arxiv: fetchArxivStories,
  coingecko: fetchCoinGeckoStories,
  usgs: fetchUsgsStories,
  "nasa-eonet": fetchNasaEonetStories,
  nws: fetchNwsStories,
  guardian: fetchRssStories,
  wsj: fetchRssStories,
  alarabiya: fetchRssStories,
  cnn: fetchRssStories,
  skynews: fetchRssStories,
  france24: fetchRssStories,
  aljazeera: fetchRssStories,
  reuters: fetchRssStories,
  aajtak: fetchRssStories,
  bloomberg: fetchRssStories,
  cnbc: fetchRssStories,
  acled: fetchRssStories,
  ucdp: fetchRssStories,
  unhcr: fetchRssStories,
  wion: fetchRssStories,
  ndtv: fetchRssStories,
  "yahoo-finance": fetchRssStories,
  bis: fetchRssStories,
  faa: fetchRssStories,
  ais: fetchRssStories,
  "cloudflare-radar": fetchRssStories,
  abusech: fetchRssStories,
  "alienvault-otx": fetchRssStories,
  abuseipdb: fetchRssStories,
  c2intelfeeds: fetchRssStories,
  usaspending: fetchRssStories,
};

const fetchStoriesForSource = async (
  source: SourceDefinition,
): Promise<{ stories: StoryNode[]; metric: SourceIngestionMetric }> => {
  const now = new Date().toISOString();
  try {
    const adapter = adapters[source.id] ?? fetchGenericStories;
    const stories = await adapter(source);

    if (stories.length > 0) {
      return {
        stories,
        metric: {
          sourceId: source.id,
          sourceLabel: source.label,
          endpoint: source.endpoint,
          ok: true,
          mode: "live",
          storyCount: stories.length,
          lastFetchedAt: now,
        },
      };
    }

    // Try Google News RSS as fallback before using placeholders
    const googleNewsStories = await fetchGoogleNewsRssStories(source);
    if (googleNewsStories.length > 0) {
      return {
        stories: googleNewsStories,
        metric: {
          sourceId: source.id,
          sourceLabel: source.label,
          endpoint: source.endpoint,
          ok: true,
          mode: "google-news-fallback",
          storyCount: googleNewsStories.length,
          lastFetchedAt: now,
        },
      };
    }

    const fallbackStories = fallbackForSource(source);
    return {
      stories: fallbackStories,
      metric: {
        sourceId: source.id,
        sourceLabel: source.label,
        endpoint: source.endpoint,
        ok: false,
        mode: "fallback",
        storyCount: fallbackStories.length,
        error: "No stories returned from source",
        lastFetchedAt: now,
      },
    };
  } catch (error) {
    // Try Google News RSS as fallback before using placeholders
    try {
      const googleNewsStories = await fetchGoogleNewsRssStories(source);
      if (googleNewsStories.length > 0) {
        return {
          stories: googleNewsStories,
          metric: {
            sourceId: source.id,
            sourceLabel: source.label,
            endpoint: source.endpoint,
            ok: true,
            mode: "google-news-fallback",
            storyCount: googleNewsStories.length,
            lastFetchedAt: now,
          },
        };
      }
    } catch {
      // Ignore Google News fallback errors
    }
    
    const fallbackStories = fallbackForSource(source);
    return {
      stories: fallbackStories,
      metric: {
        sourceId: source.id,
        sourceLabel: source.label,
        endpoint: source.endpoint,
        ok: false,
        mode: "fallback",
        storyCount: fallbackStories.length,
        error: error instanceof Error ? error.message : "Unknown error",
        lastFetchedAt: now,
      },
    };
  }
};

export const buildLiveGraph = async (): Promise<StoryGraph> => {
  // Ingestion -> Normalize -> Embed -> Deduplicate
  const results = await Promise.all(
    SOURCE_DEFINITIONS.map((source) => fetchStoriesForSource(source)),
  );

  const fetchedStories = results.flatMap((result) => result.stories);
  const storiesWithEmbeddings = await addEmbeddingsToStories(fetchedStories);
  const canonicalStories = canonicalizeStories(storiesWithEmbeddings);
  const relationReadyStories = enrichStoryRelations(canonicalStories);
  const metrics = results.map((result) => result.metric);

  await storeSourceMetrics(metrics);
  const storedStories = await mergeAndStoreStories(relationReadyStories, 1000);

  const canonicalBySource = new Map<string, number>();
  for (const story of relationReadyStories) {
    for (const sourceId of story.sourceIds) {
      canonicalBySource.set(
        sourceId,
        (canonicalBySource.get(sourceId) ?? 0) + 1,
      );
    }
  }

  const report = {
    runAt: new Date().toISOString(),
    totalSources: SOURCE_DEFINITIONS.length,
    liveSources: metrics.filter((metric) => metric.mode === "live").length,
    fallbackSources: metrics.filter((metric) => metric.mode === "fallback")
      .length,
    fetchedStories: fetchedStories.length,
    canonicalStories: relationReadyStories.length,
    storedStories: storedStories.length,
    sourceBreakdown: metrics.map((metric) => ({
      sourceId: metric.sourceId,
      sourceLabel: metric.sourceLabel,
      endpoint: metric.endpoint,
      mode: metric.mode,
      fetchedStories: metric.storyCount,
      canonicalStories: canonicalBySource.get(metric.sourceId) ?? 0,
      error: metric.error,
    })),
  };

  await storeIngestionReport(report);

  console.table(
    report.sourceBreakdown.map((item) => ({
      source: item.sourceLabel,
      mode: item.mode,
      fetchedStories: item.fetchedStories,
      canonicalStories: item.canonicalStories,
      error: item.error ?? "",
    })),
  );

  if (storedStories.length === 0) {
    const fallbackStories = SOURCE_DEFINITIONS.slice(0, 12).flatMap((source) =>
      fallbackForSource(source),
    );
    return createStoryGraphFromStories(fallbackStories);
  }

  const storiesForGraph = storedStories.slice(0, 280);
  const recommendations = await buildStoryRecommendations({
    stories: storiesForGraph,
    topK: VECTOR_SEARCH_TOP_K,
  });

  return createStoryGraphFromRecommendations({
    stories: storiesForGraph,
    recommendations,
  });
};
