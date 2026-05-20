import { NextResponse } from "next/server";

type PolymarketMarket = {
  id: string;
  question: string;
  slug?: string;
  image?: string;
  outcomePrices?: string;
  outcomes?: string[] | string;
  volume?: string | number;
  endDate?: string;
  category?: string;
  tags?: Array<{ id: number; slug: string; label: string }>;
};

type Outcome = {
  name: string;
  price: number;
};

type HorizonItem = {
  id: string;
  title: string;
  source: string;
  score: number;
  timestamp: string;
  origin: "POLYMARKET";
  url?: string;
  image?: string;
  outcomes?: Outcome[];
  volume?: string;
};

const CATEGORIES = [
  { tagId: 1, label: "crypto" },
  { tagId: 12, label: "politics" },
  { tagId: 1006, label: "business" },
  { tagId: 1007, label: "sports" },
  { tagId: 1008, label: "entertainment" },
  { tagId: 1009, label: "science" },
  { tagId: 1010, label: "world" },
  { tagId: 1011, label: "geopolitics" },
];

const GAMMA_URL = (tagId: number) =>
  `https://gamma-api.polymarket.com/markets?closed=false&limit=8&active=true&order_by=volume&tag_id=${tagId}`;

const clampScore = (value: number) => Math.max(5, Math.min(500, value));

const toIso = (value?: string | null) => {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
};

const formatVolume = (vol?: string | number) => {
  const v = typeof vol === "string" ? parseFloat(vol) : vol;
  if (!v) return "$0";
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

const parseOutcomes = (market: PolymarketMarket): Outcome[] => {
  const outcomes: Outcome[] = [];

  let outcomeNames: string[] = [];
  let outcomePrices: number[] = [];

  if (market.outcomes) {
    if (Array.isArray(market.outcomes)) {
      outcomeNames = market.outcomes;
    } else {
      try {
        const parsed = JSON.parse(market.outcomes);
        outcomeNames = Array.isArray(parsed) ? parsed : [];
      } catch {
        outcomeNames = [market.outcomes];
      }
    }
  }

  if (market.outcomePrices) {
    try {
      const parsed = JSON.parse(market.outcomePrices);
      outcomePrices = Array.isArray(parsed) ? parsed.map((p: string | number) => parseFloat(String(p))) : [];
    } catch {
      const single = parseFloat(market.outcomePrices);
      if (!Number.isNaN(single)) outcomePrices = [single];
    }
  }

  for (let i = 0; i < Math.min(2, outcomeNames.length); i++) {
    outcomes.push({
      name: outcomeNames[i] ?? `Outcome ${i + 1}`,
      price: outcomePrices[i] ?? 0,
    });
  }

  return outcomes;
};

export async function GET() {
  try {
    const responses = await Promise.all(
      CATEGORIES.map((cat) =>
        fetch(GAMMA_URL(cat.tagId), {
          next: { revalidate: 300 },
          headers: { Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() as Promise<PolymarketMarket[]> : []))
      )
    );

    const seen = new Set<string>();
    const uniqueMarkets: PolymarketMarket[] = [];

    for (const markets of responses) {
      for (const market of markets) {
        if (!seen.has(market.id)) {
          seen.add(market.id);
          uniqueMarkets.push(market);
        }
      }
    }

    const items: HorizonItem[] = uniqueMarkets.slice(0, 30).map((market) => {
      const volNum = typeof market.volume === "string" ? parseFloat(market.volume) : (market.volume || 0);
      const volumeScore = Math.round(volNum / 5000);

      return {
        id: `poly-${market.id}`,
        title: market.question || "Untitled Market",
        source: "@polymarket",
        score: clampScore(volumeScore || 45),
        timestamp: toIso(market.endDate ?? null),
        origin: "POLYMARKET",
        url: market.slug ? `https://polymarket.com/market/${market.slug}` : `https://polymarket.com/`,
        image: market.image,
        outcomes: parseOutcomes(market),
        volume: formatVolume(market.volume),
      };
    });

    items.sort((a, b) => b.score - a.score);

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    console.error("Polymarket API Error:", error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
