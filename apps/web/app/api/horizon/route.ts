import Parser from "rss-parser";
import { NextResponse } from "next/server";

type HorizonItem = {
  id: string;
  title: string;
  source: string;
  score: number;
  timestamp: string;
  origin: "HACKER NEWS" | "REDDIT" | "TELEGRAM" | "GITHUB" | "X";
  url?: string;
};

const HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const REDDIT_FEED =
  "https://www.reddit.com/r/worldnews+technology+cybersecurity+startups/hot.json?limit=12";
const TELEGRAM_RSS =
  "https://news.google.com/rss/search?q=Telegram+news+channels+updates&hl=en-US&gl=US&ceid=US:en";
const GITHUB_EVENTS = "https://api.github.com/events";
const X_RSS =
  "https://news.google.com/rss/search?q=X+Twitter+trending+news&hl=en-US&gl=US&ceid=US:en";

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

  const results: HorizonItem[] = [];
  for (const item of items) {
    if (item && item.title) {
      results.push({
        id: `hn-${item.id}`,
        title: item.title,
        source: `@${item.by || "hackernews"}`,
        score: clampScore(item.score ?? 40),
        timestamp: toIso(item.time ?? null),
        origin: "HACKER NEWS",
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      });
    }
  }
  return results;
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

  const results: HorizonItem[] = [];
  const children = payload.data?.children ?? [];
  for (const child of children) {
    const item = child.data;
    if (item && item.title && item.id) {
      results.push({
        id: `reddit-${item.id}`,
        title: item.title,
        source: item.author ? `u/${item.author}` : "u/reddit",
        score: clampScore(item.score ?? 30),
        timestamp: toIso(item.created_utc ?? null),
        origin: "REDDIT",
        url: item.permalink ? `https://www.reddit.com${item.permalink}` : undefined,
      });
    }
  }
  return results;
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
    const results: HorizonItem[] = [];

    const items = (feed.items ?? []).slice(0, 10);
    for (const item of items) {
      const title = item.title || "Telegram update";
      const baseScore = 24 + (title.length % 90);
      results.push({
        id: `telegram-${item.guid || Math.random().toString(36).slice(2)}`,
        title,
        source: "@telegram",
        score: clampScore(baseScore),
        timestamp: toIso(item.isoDate || item.pubDate || null),
        origin: "TELEGRAM",
        url: item.link || undefined,
      });
    }
    return results;
  } catch (error) {
    console.error("Telegram fetch error:", error);
    return [];
  }
};

const fetchGitHub = async (): Promise<HorizonItem[]> => {
  try {
    const res = await fetch(GITHUB_EVENTS, {
      headers: { "User-Agent": "news-aggregator" },
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      return [];
    }
    const events = (await res.json()) as Array<{
      id: string;
      type: string;
      repo?: { name?: string };
      actor?: { login?: string };
      created_at?: string;
      payload?: {
        action?: string;
        ref?: string;
        ref_type?: string;
        description?: string;
        commits?: Array<{ message?: string }>;
        issue?: { title?: string; number?: number };
        pull_request?: { title?: string; number?: number };
      };
    }>;

    return events.slice(0, 10).map((event, idx) => {
      let title = `${event.type} on ${event.repo?.name ?? "unknown"}`;
      if (event.payload?.action) {
        title = `${event.payload.action}: ${title}`;
      }
      const firstCommit = event.payload?.commits?.[0];
      if (firstCommit?.message) {
        title = firstCommit.message;
      }
      if (event.payload?.issue?.title) {
        title = event.payload.issue.title;
      }
      if (event.payload?.pull_request?.title) {
        title = event.payload.pull_request.title;
      }

      return {
        id: `github-${event.id}`,
        title,
        source: event.actor?.login ? `@${event.actor.login}` : "@github",
        score: clampScore(30 + (idx * 5)),
        timestamp: toIso(event.created_at ?? null),
        origin: "GITHUB" as const,
        url: event.repo?.name ? `https://github.com/${event.repo.name}` : undefined,
      };
    });
  } catch {
    return [];
  }
};

const fetchX = async (): Promise<HorizonItem[]> => {
  try {
    const xml = await fetch(X_RSS, { next: { revalidate: 120 } }).then(
      async (res) => {
        if (!res.ok) {
          throw new Error("X RSS fetch failed");
        }
        return res.text();
      },
    );
    const feed = await rssParser.parseString(xml);
    return (feed.items ?? []).slice(0, 10).map((item, idx) => {
      const title = item.title || "X trending update";
      const baseScore = 20 + (title.length % 80);
      return {
        id: `x-${item.guid || idx}`,
        title,
        source: "@x",
        score: clampScore(baseScore),
        timestamp: toIso(item.isoDate || item.pubDate || null),
        origin: "X" as const,
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
  const limit = Number(params.get("limit") || "35");

  try {
    const [hn, reddit, telegram, github, x] = await Promise.all([
      fetchHackerNews(),
      fetchReddit(),
      fetchTelegram(),
      fetchGitHub(),
      fetchX(),
    ]);

    const all = [...hn, ...reddit, ...telegram, ...github, ...x].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );

    const items = all.slice(offset, offset + limit);

    return NextResponse.json({ items, offset, limit, total: all.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error fetching signals" },
      { status: 500 }
    );
  }
}
