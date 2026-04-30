import "dotenv/config";
import axios from "axios";

type PolymarketMarket = {
  id: string;
  title: string;
  slug?: string;
  lastPrice?: number;
};

type NewsArticle = {
  title: string;
  url: string;
  source: { name: string };
};

type TelegramPost = {
  text?: string;
  url?: string;
  date?: string;
};

export type MarketInsight = {
  marketId: string;
  marketTitle: string;
  marketPrice: number | null;
  headline: string | null;
  headlineUrl: string | null;
  headlineSource: string | null;
  telegramPosts: TelegramPost[];
};

const POLYMARKET_URL = "https://gamma-api.polymarket.com/markets?tag_id=12";
const NEWS_API_URL = "https://newsapi.org/v2/everything";
const APIFY_ACTOR = "apify/telegram-scraper";

const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";

const assertEnv = () => {
  if (!NEWS_API_KEY) {
    throw new Error("Missing NEWS_API_KEY in .env");
  }
  if (!APIFY_TOKEN) {
    throw new Error("Missing APIFY_TOKEN in .env");
  }
};

const fetchPolymarket = async (): Promise<PolymarketMarket[]> => {
  const res = await axios.get(POLYMARKET_URL);
  return res.data as PolymarketMarket[];
};

const fetchHeadlineForMarket = async (title: string): Promise<NewsArticle | null> => {
  const res = await axios.get(NEWS_API_URL, {
    params: {
      q: title,
      pageSize: 1,
      sortBy: "publishedAt",
      apiKey: NEWS_API_KEY,
    },
  });
  const articles = (res.data?.articles || []) as NewsArticle[];
  return articles[0] ?? null;
};

const fetchTelegramPosts = async (channel: string): Promise<TelegramPost[]> => {
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;
  const res = await axios.post(
    url,
    {
      usernames: [channel],
      resultsLimit: 5,
    },
    {
      params: {
        token: APIFY_TOKEN,
      },
    },
  );

  return (res.data || []).map((item: any) => ({
    text: item.text,
    url: item.url,
    date: item.date,
  }));
};

export const buildInsights = async (channel = "dw_geopolitics"): Promise<MarketInsight[]> => {
  assertEnv();

  const [markets, telegramPosts] = await Promise.all([
    fetchPolymarket(),
    fetchTelegramPosts(channel),
  ]);

  const marketsTop = markets.slice(0, 8);
  const insights = await Promise.all(
    marketsTop.map(async (market) => {
      const headline = await fetchHeadlineForMarket(market.title);
      return {
        marketId: market.id,
        marketTitle: market.title,
        marketPrice: market.lastPrice ?? null,
        headline: headline?.title ?? null,
        headlineUrl: headline?.url ?? null,
        headlineSource: headline?.source?.name ?? null,
        telegramPosts,
      } satisfies MarketInsight;
    }),
  );

  return insights;
};

if (require.main === module) {
  buildInsights().then((insights) => {
    console.log(JSON.stringify(insights, null, 2));
  });
}
