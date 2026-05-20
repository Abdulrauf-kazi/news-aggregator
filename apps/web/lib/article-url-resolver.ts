import { getSourceDefinition } from "./news-routing";

type ResolveInput = {
  title: string;
  url?: string;
  publisherUrl?: string;
  sourceIds?: string[];
};

const GOOGLE_NEWS_ARTICLE_PATTERN = /news\.google\.com\/rss\/articles\//i;
const FEED_URL_PATTERN = /(\.xml|\/rss(\/|$)|\/feeds?\/)/i;

const normalizeTitle = (title: string) =>
  title
    .replace(/\s+-\s+[A-Z][A-Za-z0-9 .&'-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

const decodeDuckDuckGoUrl = (rawUrl: string) => {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("//")) {
    rawUrl = `https:${rawUrl}`;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes("duckduckgo.com")) {
      const target = parsed.searchParams.get("uddg");
      return target ? decodeURIComponent(target) : null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const getPublisherHost = (input: ResolveInput) => {
  const candidates = [
    input.publisherUrl,
    getSourceDefinition(input.sourceIds)?.endpoint,
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname.includes("news.google.com")) {
        return parsed.hostname.replace(/^www\./, "");
      }
    } catch {
      // Ignore invalid URL candidates.
    }
  }

  return null;
};

const needsResolution = (url?: string) => {
  if (!url) return true;
  if (GOOGLE_NEWS_ARTICLE_PATTERN.test(url)) return true;
  if (FEED_URL_PATTERN.test(url)) return true;
  return false;
};

async function searchDuckDuckGo(input: { title: string; host: string }) {
  const query = encodeURIComponent(`site:${input.host} "${normalizeTitle(input.title)}"`);
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo lookup failed with ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/result__a" href="([^"]+)"/i);
  const decoded = decodeDuckDuckGoUrl(match?.[1] ?? "");
  if (!decoded) {
    return null;
  }

  try {
    const resolved = new URL(decoded);
    if (!resolved.hostname.includes(input.host)) {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

export async function resolveArticleUrl(input: ResolveInput) {
  // If we have a valid publisherUrl that's not a Google News wrapper, use it directly
  if (input.publisherUrl && !needsResolution(input.publisherUrl)) {
    return input.publisherUrl;
  }

  // If the main URL doesn't need resolution, use it
  if (!needsResolution(input.url)) {
    return input.url ?? null;
  }

  // Try to resolve via DuckDuckGo search
  const publisherHost = getPublisherHost(input);
  if (!publisherHost) {
    // Fall back to publisherUrl if available, even if it needs resolution
    return input.publisherUrl ?? input.url ?? null;
  }

  const resolved = await searchDuckDuckGo({
    title: input.title,
    host: publisherHost,
  });

  return resolved ?? input.publisherUrl ?? input.url ?? null;
}
