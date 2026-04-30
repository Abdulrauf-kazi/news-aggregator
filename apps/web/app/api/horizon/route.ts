import Parser from "rss-parser";
import { NextResponse } from "next/server";

type HorizonItem = {
  id: string;
  title: string;
  source: string;
  score: number;
  timestamp: string;
  origin: "HACKER NEWS" | "REDDIT" | "TELEGRAM";
  url?: string;
};

const HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const REDDIT_FEED =
  "https://www.reddit.com/r/worldnews+technology+cybersecurity+startups/hot.json?limit=12";
const TELEGRAM_RSS =
  "https://news.google.com/rss/search?q=Telegram+news+channels+updates&hl=en-US&gl=US&ceid=US:en";

const rssParser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});

const toIso = (value?: number | string | null) => {
  if (!value) {
    return new Date().toISOString();
  }
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date().toISOString();
  }
  return new Date(parsed).toISOString();
};

const clampScore = (score: number) => Math.max(5, Math.min(500, score));

const fetchHackerNews = async (): Promise<HorizonItem[]> => {
  const idsRes = await fetch(HN_TOP_STORIES, { next: { revalidate: 120 } });
  if (!idsRes.ok) {
    return [];
  }
  const ids = (await idsRes.json()) as number[];
  const topIds = ids.slice(0, 10);
  const items = await Promise.all(
    topIds.map(async (id) => {
      const res = await fetch(HN_ITEM(id), { next: { revalidate: 120 } });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as {
        id: number;
        title?: string;
        by?: string;
        score?: number;
        time?: number;
        url?: string;
      };
    }),
  );

  return items
    .map((item) => {
      if (!item?.title) {
        return null;
      }
      return {
        id: `hn-${item.id}`,
        title: item.title,
        source: `@${item.by || "hackernews"}`,
        score: clampScore(item.score ?? 40),
        timestamp: toIso(item.time ?? null),
        origin: "HACKER NEWS" as const,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      };
    })
    .filter((item): item is HorizonItem => Boolean(item));
};

const fetchReddit = async (): Promise<HorizonItem[]> => {
  const res = await fetch(REDDIT_FEED, {
    headers: { "User-Agent": "news-aggregator" },
    next: { revalidate: 120 },
  });
  if (!res.ok) {
    return [];
  }
  const payload = (await res.json()) as {
    data?: {
      children?: Array<{
        data?: {
          id?: string;
          title?: string;
          author?: string;
          score?: number;
          created_utc?: number;
          permalink?: string;
          subreddit?: string;
        };
      }>;
    };
  };

  return (payload.data?.children ?? [])
    .map((child) => {
      const item = child.data;
      if (!item?.title || !item.id) {
        return null;
      }
      return {
        id: `reddit-${item.id}`,
        title: item.title,
        source: item.author ? `u/${item.author}` : "u/reddit",
        score: clampScore(item.score ?? 30),
        timestamp: toIso(item.created_utc ?? null),
        origin: "REDDIT" as const,
        url: item.permalink ? `https://www.reddit.com${item.permalink}` : undefined,
      };
    })
    .filter((item): item is HorizonItem => Boolean(item));
};

const fetchTelegram = async (): Promise<HorizonItem[]> => {
  try {
    const xml = await fetch(TELEGRAM_RSS, { next: { revalidate: 120 } }).then(
      async (res) => {
        if (!res.ok) {
          throw new Error("Telegram RSS fetch failed");
        }
        return res.text();
      },
    );
    const feed = await rssParser.parseString(xml);
    return (feed.items ?? []).slice(0, 10).map((item, idx) => {
      const title = item.title || "Telegram update";
      const baseScore = 24 + (title.length % 90);
      return {
        id: `telegram-${item.guid || idx}`,
        title,
        source: "@telegram",
        score: clampScore(baseScore),
        timestamp: toIso(item.isoDate || item.pubDate || null),
        origin: "TELEGRAM" as const,
        url: item.link || undefined,
      };
    });
  } catch {
    return [];
  }
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const offset = Number(params.get("offset") || "0");
  const limit = Number(params.get("limit") || "15");

  const [hn, reddit, telegram] = await Promise.all([
    fetchHackerNews(),
    fetchReddit(),
    fetchTelegram(),
  ]);

  const all = [...hn, ...reddit, ...telegram].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const items = all.slice(offset, offset + limit);

  return NextResponse.json({ items, offset, limit, total: all.length });
}
