/**
 * Read-only per-source audit of ingestion and article rendering.
 *
 *   bun scripts/audit-sources.ts                 # full audit (needs `bun run dev` on :3000)
 *   bun scripts/audit-sources.ts --sample 3      # article samples per source (default 2)
 *   bun scripts/audit-sources.ts --skip-feeds    # don't probe the raw source endpoints
 *   bun scripts/audit-sources.ts --skip-articles # don't call fetch-article / resolver
 *   bun scripts/audit-sources.ts --base http://localhost:3000
 *   bun scripts/audit-sources.ts --source france24,cnn   # only these source ids
 *
 * It never writes to MongoDB or Redis and never triggers ingestion (it does not
 * call /api/live?refresh=1). Writes:
 *   ../../docs/source-audit.measured.md    per-source table + BBC trace
 *   ../../docs/source-audit.measured.json  raw measurements
 *
 * Secrets: MONGODB_URI and API keys are read from the environment (bun loads
 * .env.local) and are never printed; api_key/token query params are redacted.
 */
import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { SOURCE_DEFINITIONS, type SourceDefinition } from "../lib/sources";

type Story = {
  id: string;
  title: string;
  content?: string;
  description?: string;
  topic: string;
  sourceIds: string[];
  timestamp: string;
  url?: string;
  publisherUrl?: string;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? (args[index + 1] as string) : fallback;
};

const BASE = option("base", "http://localhost:3000").replace(/\/$/, "");
const SAMPLE = Number(option("sample", "2"));
const ONLY = new Set(option("source", "").split(",").filter(Boolean));
const OUT_DIR = path.resolve(import.meta.dir, "../../../docs");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const redact = (url: string) =>
  url.replace(/([?&](?:api_key|token|apikey|key)=)[^&]+/gi, "$1<redacted>");

// ── URL classification ──────────────────────────────────────────────────────
type UrlKind =
  | "missing"
  | "google-news-wrapper"
  | "feed"
  | "media"
  | "api"
  | "homepage"
  | "section"
  | "article"
  | "invalid";

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|mp4|m4v|mov|webm|mp3|m4a|aac|ogg|m3u8|ts)(\?|#|$)/i;

export const classifyUrl = (url?: string | null): UrlKind => {
  if (!url) return "missing";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }
  if (/news\.google\.com$/i.test(parsed.hostname) && /\/(rss\/)?articles\//.test(parsed.pathname)) {
    return "google-news-wrapper";
  }
  if (MEDIA_EXT.test(parsed.pathname)) return "media";
  if (/\.(xml|rss|atom)$/i.test(parsed.pathname) || /\/(rss|feeds?)(\/|$)/i.test(parsed.pathname)) return "feed";
  if (/^api\./i.test(parsed.hostname) || /\/api\//i.test(parsed.pathname) || /\.json$/i.test(parsed.pathname)) {
    return "api";
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname === "") return parsed.search.length > 1 ? "section" : "homepage";
  // One short alphabetic segment ("/world", "/en", "/markets") is a section page, not a story.
  if (/^\/[a-z-]{1,24}$/i.test(pathname)) return "section";
  return "article";
};

// ── Timestamp checks ────────────────────────────────────────────────────────
const hoursOld = (iso: string, now: number) => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : (now - parsed) / 3_600_000;
};

/** Feed dates have second precision; `new Date().toISOString()` has milliseconds. */
const looksGenerated = (iso: string) => /\.\d{3}Z$/.test(iso) && !/\.000Z$/.test(iso);

/** A date embedded in the URL (…/2023/04/03/… or CNN-style …-04-03-23). */
const dateFromUrl = (url?: string) => {
  if (!url) return null;
  const ymd = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|-|$)/);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const mdy = url.match(/-(\d{2})-(\d{2})-(\d{2})(?:\/|$|\?|-|#)/);
  if (mdy) return Date.UTC(2000 + Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
  return null;
};

// ── Junk / synthetic detection ──────────────────────────────────────────────
const JUNK_PATTERNS: Array<[string, RegExp]> = [
  ["placeholder-signal", /\bSignal \d+$/i],
  ["github-event", /^[A-Z][A-Za-z]*Event on /],
  ["trending-stub", /trending in crypto markets$/i],
  ["live-tv-promo", /\blive\s*tv\b|\bwatch live\b|\blive stream(ing)?\b/i],
  ["fallback-copy", /^(developing story:|update:|breaking developments|recent reports indicate|global markets showed|trading volumes remained)/i],
];

const junkFlags = (story: Story) => {
  const flags = JUNK_PATTERNS.filter(([, pattern]) => pattern.test(story.title)).map(([name]) => name);
  if (story.id.includes(":fallback-")) flags.push("fallback-id");
  return flags;
};

// ── HTTP helpers ────────────────────────────────────────────────────────────
type Probe = {
  status: number | null;
  ok: boolean;
  contentType: string;
  finalUrl: string;
  bytes: number;
  truncated: boolean;
  ms: number;
  sniff: string;
  error?: string;
  body?: string;
};

const MAX_BODY = 1_500_000;

async function probe(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      ...init,
      headers: { "User-Agent": UA, Accept: "*/*", ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        bytes += value.byteLength;
        if (bytes >= MAX_BODY) {
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    }
    const buffer = Buffer.concat(chunks);
    const magic = buffer.subarray(0, 4).toString("hex");
    const binary =
      magic.startsWith("ffd8ff") || magic === "89504e47" || magic.startsWith("47494638") || magic === "52494646";
    const body = binary ? "" : buffer.toString("utf8");
    return {
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type") ?? "",
      finalUrl: res.url || url,
      bytes,
      truncated,
      ms: Date.now() - started,
      sniff: binary ? `<binary ${magic}>` : body.slice(0, 120).replace(/\s+/g, " "),
      body,
    };
  } catch (error) {
    return {
      status: null,
      ok: false,
      contentType: "",
      finalUrl: url,
      bytes: 0,
      truncated: false,
      ms: Date.now() - started,
      sniff: "",
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T | null> {
  const result = await probe(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } }, timeoutMs);
  if (!result.ok || !result.body) return null;
  try {
    return JSON.parse(result.body) as T;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index] as T);
      }
    }),
  );
  return results;
}

// ── Raw feed probe (mirrors what the adapter receives) ──────────────────────
type FeedItem = {
  title?: string;
  link?: string;
  sourceUrl?: string;
  pubDate?: string;
  media: string[];
  appPicksUrl?: string;
  appPicksKind: UrlKind;
};

type FeedProbe = {
  endpoint: string;
  keyRequired?: string;
  keyPresent?: boolean;
  googleNewsSearch: boolean;
  status: number | null;
  contentType: string;
  ms: number;
  bytes: number;
  truncated: boolean;
  format: "xml" | "json" | "html" | "binary" | "empty" | "other";
  jsonParses: boolean;
  sniff: string;
  error?: string;
  itemCount?: number;
  itemsMissingDate?: number;
  items?: FeedItem[];
  firstItemXml?: string;
};

const KEYED: Record<string, { env: string; param: string }> = {
  finnhub: { env: "FINNHUB_API_KEY", param: "token" },
  eia: { env: "EIA_API_KEY", param: "api_key" },
};

const tagText = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
};

/** Same rule as `extractXmlSourceUrls` + `url = publisherUrl || item.link` in lib/source-adapters.ts. */
const appUrlChoice = (sourceUrl: string | undefined, link: string | undefined) => {
  const publisherUrl =
    sourceUrl ?? (link && link.startsWith("http") && !link.includes("news.google.com") ? link : undefined);
  return publisherUrl || link;
};

async function probeFeed(source: SourceDefinition): Promise<FeedProbe> {
  let endpoint = source.endpoint;
  const keyed = KEYED[source.id];
  const keyPresent = keyed ? Boolean(process.env[keyed.env]) : undefined;
  if (keyed && keyPresent) {
    endpoint += `${endpoint.includes("?") ? "&" : "?"}${keyed.param}=${encodeURIComponent(process.env[keyed.env] as string)}`;
  }
  // Long timeout on purpose: the adapter gives up at 8s, this shows how long the endpoint really takes.
  const result = await probe(endpoint, {}, 45_000);
  const body = result.body ?? "";
  const trimmed = body.trimStart();
  let jsonParses = false;
  try {
    JSON.parse(body);
    jsonParses = body.length > 0;
  } catch {
    jsonParses = false;
  }
  const format: FeedProbe["format"] = result.sniff.startsWith("<binary")
    ? "binary"
    : !trimmed
      ? "empty"
      : jsonParses || trimmed.startsWith("{") || trimmed.startsWith("[")
        ? "json"
        : /^<\?xml|^<rss|^<feed|^<rdf/i.test(trimmed)
          ? "xml"
          : /^<!doctype html|^<html/i.test(trimmed)
            ? "html"
            : "other";

  const probeResult: FeedProbe = {
    endpoint: redact(source.endpoint),
    keyRequired: keyed?.env,
    keyPresent,
    googleNewsSearch: /news\.google\.com\/rss\/search/i.test(source.endpoint),
    status: result.status,
    contentType: result.contentType,
    ms: result.ms,
    bytes: result.bytes,
    truncated: result.truncated,
    format,
    jsonParses,
    sniff: redact(result.sniff),
    error: result.error,
  };

  if (format === "xml") {
    const blocks = Array.from(body.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)).map((m) => m[0]);
    probeResult.itemCount = blocks.length;
    probeResult.firstItemXml = blocks[0]?.slice(0, 1500);
    const items = blocks.slice(0, 10).map((block): FeedItem => {
      const link =
        tagText(block, "link") || block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || tagText(block, "guid");
      const sourceUrl = block.match(/<source[^>]*\surl="([^"]+)"/i)?.[1];
      const pubDate =
        tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated") || tagText(block, "dc:date");
      const media = Array.from(block.matchAll(/<(?:media:content|media:thumbnail|enclosure)[^>]*\surl="([^"]+)"/gi)).map(
        (m) => m[1] as string,
      );
      const appPicksUrl = appUrlChoice(sourceUrl, link);
      return {
        title: tagText(block, "title")?.slice(0, 140),
        link,
        sourceUrl,
        pubDate,
        media,
        appPicksUrl,
        appPicksKind: classifyUrl(appPicksUrl),
      };
    });
    probeResult.items = items;
    probeResult.itemsMissingDate = items.filter((item) => !item.pubDate).length;
  }
  return probeResult;
}

// ── Article page check (mirrors article-client.tsx) ─────────────────────────
type ArticleCheck = {
  storyId: string;
  title: string;
  topic: string;
  storyUrl?: string;
  storyUrlKind: UrlKind;
  publisherUrl?: string;
  direct?: Pick<Probe, "status" | "contentType" | "finalUrl" | "bytes" | "error" | "sniff">;
  resolvedUrl?: string | null;
  resolvedKind?: UrlKind;
  clientFetchUrl?: string | null;
  clientFetchKind?: UrlKind;
  fetchArticle?: {
    textLength: number;
    htmlLength: number;
    title?: string;
    siteName?: string;
    finalUrl?: string;
    error?: string;
    replacementChars: number;
  };
  rendered: "full-text" | "partial-text" | "summary-only" | "homepage-text" | "garbage" | "fallback-blurb" | "not-checked";
  noticeShown: boolean | null;
  notes: string[];
};

const PREVIEW_NO_CONTENT = /update from .+\.$/;

async function checkArticle(story: Story): Promise<ArticleCheck> {
  const notes: string[] = [];
  const check: ArticleCheck = {
    storyId: story.id,
    title: story.title,
    topic: story.topic,
    storyUrl: story.url,
    storyUrlKind: classifyUrl(story.url),
    publisherUrl: story.publisherUrl,
    rendered: "not-checked",
    noticeShown: null,
    notes,
  };

  if (story.url) {
    const direct = await probe(story.url, { headers: { Accept: "text/html,*/*;q=0.8" } }, 20_000);
    check.direct = {
      status: direct.status,
      contentType: direct.contentType,
      finalUrl: direct.finalUrl,
      bytes: direct.bytes,
      error: direct.error,
      sniff: direct.sniff.slice(0, 60),
    };
    if (direct.contentType && !/html/i.test(direct.contentType)) notes.push(`stored URL is ${direct.contentType}`);
  }

  const resolution = await getJson<{ resolvedUrl?: string | null; error?: string }>(
    `${BASE}/api/resolve-article-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: story.title, url: story.url, publisherUrl: story.publisherUrl, sourceIds: story.sourceIds }),
    },
    40_000,
  );
  check.resolvedUrl = resolution?.resolvedUrl ?? null;
  check.resolvedKind = classifyUrl(check.resolvedUrl);
  if (resolution?.error) notes.push(`resolver: ${resolution.error}`);

  // article-client.tsx: story.publisherUrl || resolvedUrl || story.url
  const fetchUrl = story.publisherUrl || check.resolvedUrl || story.url || null;
  check.clientFetchUrl = fetchUrl;
  check.clientFetchKind = classifyUrl(fetchUrl);

  const hasStoryContent = Boolean(
    story.content?.trim() || (story.description && !PREVIEW_NO_CONTENT.test(story.description)),
  );

  if (!fetchUrl) {
    check.rendered = hasStoryContent ? "summary-only" : "fallback-blurb";
    check.noticeShown = false;
    return check;
  }

  const payload = await getJson<{
    text?: string;
    html?: string;
    title?: string;
    siteName?: string;
    finalUrl?: string;
    error?: string;
  }>(`${BASE}/api/fetch-article?url=${encodeURIComponent(fetchUrl)}`, {}, 40_000);

  const text = payload?.text ?? "";
  const html = payload?.html ?? "";
  const replacementChars = (text.match(/�/g) ?? []).length + (html.match(/�/g) ?? []).length;
  check.fetchArticle = {
    textLength: text.trim().length,
    htmlLength: html.trim().length,
    title: payload?.title?.slice(0, 120),
    siteName: payload?.siteName,
    finalUrl: payload?.finalUrl,
    error: payload ? payload.error : "fetch-article request failed",
    replacementChars,
  };

  const hasContent = html.trim().length > 50 || text.trim().length > 50;
  check.noticeShown = !(hasContent || hasStoryContent) && Boolean(payload?.error);

  const finalKind = classifyUrl(payload?.finalUrl ?? fetchUrl);
  const length = Math.max(text.trim().length, html.replace(/<[^>]+>/g, "").trim().length);
  const storedUrlIsBinary = /<binary/.test(check.direct?.sniff ?? "") && fetchUrl === story.url;
  if (replacementChars > 20 || storedUrlIsBinary) {
    check.rendered = "garbage";
  } else if (hasContent && (finalKind === "homepage" || finalKind === "section" || check.clientFetchKind === "homepage")) {
    check.rendered = "homepage-text";
  } else if (length >= 1500) {
    check.rendered = "full-text";
  } else if (length >= 400) {
    check.rendered = "partial-text";
  } else {
    check.rendered = hasStoryContent ? "summary-only" : "fallback-blurb";
  }
  if (!hasContent && hasStoryContent && payload?.error) {
    notes.push(`publisher fetch failed (${payload.error}) but no notice is shown`);
  }
  return check;
}

// ── Story loading ───────────────────────────────────────────────────────────
async function loadDbStories(): Promise<Story[] | null> {
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI not set: auditing /api/live stories only.");
    return null;
  }
  try {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    try {
      const rows = await client
        .db()
        .collection("stories")
        .find({}, { projection: { _id: 0, embedding: 0 } })
        .toArray();
      return rows as unknown as Story[];
    } finally {
      await client.close();
    }
  } catch (error) {
    console.warn(`MongoDB read failed (${error instanceof Error ? error.message : error}); using /api/live only.`);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
const freeGb = os.freemem() / 1024 ** 3;
const totalGb = os.totalmem() / 1024 ** 3;
const lowMemory = freeGb < 1.5;
console.log(`Memory: ${freeGb.toFixed(1)} GB free of ${totalGb.toFixed(1)} GB${lowMemory ? " (low: running article checks one at a time)" : ""}`);

const sources = SOURCE_DEFINITIONS.filter((source) => ONLY.size === 0 || ONLY.has(source.id));
const now = Date.now();

const serverUp = (await probe(`${BASE}/api/ingestion-report`, {}, 15_000)).ok;
if (!serverUp && !flag("skip-articles")) {
  console.error(`Dev server not reachable at ${BASE}. Start it with \`bun run dev\` in apps/web, or pass --skip-articles.`);
  process.exit(1);
}

const report = serverUp
  ? await getJson<{
      report: { runAt: string; sourceBreakdown: Array<{ sourceId: string; mode: string; fetchedStories: number; canonicalStories: number; error?: string }> } | null;
      metrics: Array<{ sourceId: string; mode: string; ok: boolean; storyCount: number; error?: string; lastFetchedAt: string }>;
    }>(`${BASE}/api/ingestion-report`)
  : null;

const live = serverUp ? await getJson<{ stories: Story[] }>(`${BASE}/api/live`, {}, 120_000) : null;
const liveStories = live?.stories ?? [];
const liveIds = new Set(liveStories.map((story) => story.id));
const dbStories = (await loadDbStories()) ?? liveStories;

console.log(`Stories: ${dbStories.length} in DB, ${liveStories.length} served by /api/live. Sources defined: ${SOURCE_DEFINITIONS.length}.`);

const feedProbes = new Map<string, FeedProbe>();
if (!flag("skip-feeds")) {
  const probes = await mapLimit(sources, 6, async (source) => [source.id, await probeFeed(source)] as const);
  for (const [id, result] of probes) feedProbes.set(id, result);
  console.log(`Probed ${feedProbes.size} source endpoints.`);
}

const bySource = new Map<string, Story[]>();
for (const story of dbStories) {
  const owner = story.id.split(":")[1] ?? story.sourceIds?.[0] ?? "unknown";
  if (!bySource.has(owner)) bySource.set(owner, []);
  bySource.get(owner)!.push(story);
}

type SourceAudit = {
  id: string;
  label: string;
  endpoint: string;
  reportMode?: string;
  reportError?: string;
  dbStories: number;
  liveStories: number;
  urlKinds: Record<string, number>;
  urlEqualsPublisherUrl: number;
  publisherUrlKinds: Record<string, number>;
  ages: { under24h: number; d1to7: number; over7d: number; future: number; unparsable: number };
  generatedTimestamps: number;
  urlDateMismatch: Array<{ title: string; url?: string; timestamp: string }>;
  junk: Array<{ title: string; flags: string[] }>;
  duplicateTitles: Array<{ title: string; count: number }>;
  topics: Record<string, number>;
  sampleTitles: Array<{ title: string; topic: string }>;
  feed?: FeedProbe;
  articles: ArticleCheck[];
};

const countBy = <T>(items: T[], key: (item: T) => string) =>
  items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

const audits: SourceAudit[] = [];
for (const source of sources) {
  const stories = (bySource.get(source.id) ?? []).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const metric = report?.metrics?.find((m) => m.sourceId === source.id);
  const ages = { under24h: 0, d1to7: 0, over7d: 0, future: 0, unparsable: 0 };
  for (const story of stories) {
    const hours = hoursOld(story.timestamp, now);
    if (hours == null) ages.unparsable++;
    else if (hours < -1) ages.future++;
    else if (hours < 24) ages.under24h++;
    else if (hours < 168) ages.d1to7++;
    else ages.over7d++;
  }
  const titleCounts = countBy(stories, (story) => story.title.trim().toLowerCase());
  audits.push({
    id: source.id,
    label: source.label,
    endpoint: redact(source.endpoint),
    reportMode: metric?.mode,
    reportError: metric?.error,
    dbStories: stories.length,
    liveStories: stories.filter((story) => liveIds.has(story.id)).length,
    urlKinds: countBy(stories, (story) => classifyUrl(story.url)),
    urlEqualsPublisherUrl: stories.filter((story) => story.url && story.url === story.publisherUrl).length,
    publisherUrlKinds: countBy(stories, (story) => classifyUrl(story.publisherUrl)),
    ages,
    // USGS publishes epoch-millisecond times, so millisecond precision is genuine there.
    generatedTimestamps:
      source.id === "usgs" ? 0 : stories.filter((story) => looksGenerated(story.timestamp)).length,
    urlDateMismatch: stories
      .filter((story) => {
        const fromUrl = dateFromUrl(story.url);
        const stamped = Date.parse(story.timestamp);
        return fromUrl != null && !Number.isNaN(stamped) && Math.abs(stamped - fromUrl) > 3 * 86_400_000;
      })
      .slice(0, 5)
      .map((story) => ({ title: story.title, url: story.url, timestamp: story.timestamp })),
    junk: stories
      .map((story) => ({ title: story.title, flags: junkFlags(story) }))
      .filter((item) => item.flags.length > 0)
      .slice(0, 10),
    duplicateTitles: Object.entries(titleCounts)
      .filter(([, count]) => count > 1)
      .map(([title, count]) => ({ title, count }))
      .slice(0, 5),
    topics: countBy(stories, (story) => story.topic),
    sampleTitles: stories.slice(0, 6).map((story) => ({ title: story.title, topic: story.topic })),
    feed: feedProbes.get(source.id),
    articles: [],
  });
}

if (!flag("skip-articles")) {
  const jobs = audits.flatMap((audit) => {
    const pool = bySource.get(audit.id) ?? [];
    const preferred = pool.filter((story) => liveIds.has(story.id));
    const picked = (preferred.length > 0 ? preferred : pool).slice(0, SAMPLE);
    return picked.map((story) => ({ audit, story }));
  });
  console.log(`Checking ${jobs.length} article pages (resolver + fetch-article)...`);
  let done = 0;
  await mapLimit(jobs, lowMemory ? 1 : 3, async ({ audit, story }) => {
    audit.articles.push(await checkArticle(story));
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${jobs.length}`);
  });
}

// ── Output ──────────────────────────────────────────────────────────────────
const fmtCounts = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key} ${value}`)
    .join(", ") || "-";

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

const lines: string[] = [];
lines.push(`# Source audit — measured`, "");
lines.push(
  `Generated ${new Date(now).toISOString()} by \`bun scripts/audit-sources.ts\` against ${BASE}. ` +
    `${dbStories.length} stories in DB, ${liveStories.length} served by /api/live, ${SOURCE_DEFINITIONS.length} sources defined. ` +
    `Last ingestion run: ${report?.report?.runAt ?? "unknown"}.`,
  "",
);
lines.push(
  "| Source | Mode (report) | Feed probe | Feed items → app URL | DB / live | Stored URL kinds | url = publisherUrl | Article page (sampled) | Notice when failed | Ages <24h / 1-7d / >7d | Generated ts | Junk | Topics |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
);
for (const audit of audits) {
  const feed = audit.feed;
  const feedCell = feed
    ? `${feed.status ?? "ERR"} ${feed.format} ${feed.ms}ms${feed.truncated ? " (>1.5MB)" : ""}${feed.keyRequired ? ` key:${feed.keyPresent ? "yes" : "NO"}` : ""}${feed.error ? ` ${feed.error}` : ""}`
    : "-";
  const itemCell = feed?.items ? fmtCounts(countBy(feed.items, (item) => item.appPicksKind)) + (feed.itemsMissingDate ? `; ${feed.itemsMissingDate} no date` : "") : "-";
  const rendered = audit.articles.length ? fmtCounts(countBy(audit.articles, (a) => a.rendered)) : "-";
  const failed = audit.articles.filter((a) => a.rendered !== "full-text");
  const notice = failed.length ? `${failed.filter((a) => a.noticeShown).length}/${failed.length}` : "-";
  lines.push(
    `| ${cell(`${audit.label} (\`${audit.id}\`)`)} | ${audit.reportMode ?? "?"}${audit.reportError ? `: ${cell(audit.reportError)}` : ""} | ${cell(feedCell)} | ${itemCell} | ${audit.dbStories} / ${audit.liveStories} | ${fmtCounts(audit.urlKinds)} | ${audit.urlEqualsPublisherUrl} | ${rendered} | ${notice} | ${audit.ages.under24h} / ${audit.ages.d1to7} / ${audit.ages.over7d}${audit.ages.future ? ` (+${audit.ages.future} future)` : ""} | ${audit.generatedTimestamps} | ${audit.junk.length} | ${cell(fmtCounts(audit.topics))} |`,
  );
}

lines.push("", "## Per-source detail", "");
for (const audit of audits) {
  lines.push(`### ${audit.label} (\`${audit.id}\`)`, "");
  if (audit.feed?.items?.length) {
    const first = audit.feed.items[0]!;
    lines.push(
      `- First feed item: link \`${first.link ?? "-"}\`, <source url> \`${first.sourceUrl ?? "-"}\`, media ${first.media.length}, pubDate \`${first.pubDate ?? "MISSING"}\` → app stores \`${first.appPicksUrl ?? "-"}\` (${first.appPicksKind})`,
    );
  } else if (audit.feed?.error) {
    lines.push(`- Endpoint request failed after ${audit.feed.ms}ms: ${cell(audit.feed.error)}`);
  } else if (audit.feed) {
    lines.push(
      `- Endpoint returned HTTP ${audit.feed.status} ${audit.feed.format}${audit.feed.jsonParses ? "" : " (not valid JSON)"}, ${audit.feed.bytes} bytes in ${audit.feed.ms}ms: \`${cell(audit.feed.sniff)}\``,
    );
  }
  for (const item of audit.urlDateMismatch) lines.push(`- Date mismatch: "${cell(item.title)}" stamped ${item.timestamp}, URL \`${item.url}\``);
  for (const item of audit.junk.slice(0, 5)) lines.push(`- Junk (${item.flags.join(", ")}): "${cell(item.title)}"`);
  for (const item of audit.duplicateTitles) lines.push(`- Duplicate title ×${item.count}: "${cell(item.title)}"`);
  for (const article of audit.articles) {
    lines.push(
      `- Article "${cell(article.title.slice(0, 90))}" [${article.topic}]: stored \`${article.storyUrl ?? "-"}\` (${article.storyUrlKind}` +
        `${article.direct ? `, ${article.direct.status ?? "ERR"} ${article.direct.contentType || article.direct.error || ""}` : ""}); ` +
        `resolver → ${article.resolvedKind}; page fetches \`${article.clientFetchUrl ?? "-"}\` (${article.clientFetchKind}); ` +
        `fetch-article text ${article.fetchArticle?.textLength ?? 0} chars${article.fetchArticle?.error ? `, error "${cell(article.fetchArticle.error)}"` : ""}` +
        `${article.fetchArticle?.title ? `, title "${cell(article.fetchArticle.title)}"` : ""} → **${article.rendered}**, notice ${article.noticeShown ? "shown" : "not shown"}` +
        `${article.notes.length ? `. ${cell(article.notes.join("; "))}` : ""}`,
    );
  }
  for (const sample of audit.sampleTitles.slice(0, 4)) lines.push(`- Topic check: [${sample.topic}] ${cell(sample.title)}`);
  lines.push("");
}

await mkdir(OUT_DIR, { recursive: true });
const mdPath = path.join(OUT_DIR, "source-audit.measured.md");
const jsonPath = path.join(OUT_DIR, "source-audit.measured.json");
await writeFile(mdPath, lines.join("\n"));
await writeFile(
  jsonPath,
  JSON.stringify({ generatedAt: new Date(now).toISOString(), base: BASE, runAt: report?.report?.runAt, audits }, null, 2),
);
console.log(`Wrote ${mdPath}\nWrote ${jsonPath}`);
process.exit(0);
