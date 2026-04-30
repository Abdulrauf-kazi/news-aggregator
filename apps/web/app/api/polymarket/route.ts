import { NextResponse } from "next/server";

type PolymarketMarket = {
  id: string;
  question: string;
  slug?: string;
  image?: string;
  outcomePrices?: string[];
  outcomes?: string[];
  volume?: string | number;
  endDate?: string;
  category?: string;
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

// Fetching from a few different tags to ensure diversity
const TAGS = [1, 12, 1006, 1007]; // Crypto, Politics, Business, etc.
const GAMMA_URL = (tagId: number) => `https://gamma-api.polymarket.com/markets?closed=false&limit=10&active=true&tag_id=${tagId}`;

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

export async function GET() {
  try {
    // Fetch from multiple tags in parallel for diversity
    const responses = await Promise.all(
      TAGS.map(tagId => fetch(GAMMA_URL(tagId), { 
        next: { revalidate: 300 },
        headers: { "Accept": "application/json" }
      }).then(r => r.ok ? r.json() as Promise<PolymarketMarket[]> : []))
    );
    
    const rawData = responses.flat();
    
    // Deduplicate by question to avoid repeats
    const seen = new Set<string>();
    const uniqueMarkets = rawData.filter(m => {
      if (seen.has(m.question)) return false;
      seen.add(m.question);
      return true;
    });

    const items: HorizonItem[] = uniqueMarkets.slice(0, 30).map((market) => {
      const volNum = typeof market.volume === "string" ? parseFloat(market.volume) : (market.volume || 0);
      const volumeScore = Math.round(volNum / 5000);
      
      const outcomes: Outcome[] = [];
      if (market.outcomes && market.outcomePrices) {
        // Get up to 2 outcomes
        for (let i = 0; i < Math.min(2, market.outcomes.length); i++) {
          outcomes.push({
            name: market.outcomes[i]!,
            price: parseFloat(market.outcomePrices[i] || "0")
          });
        }
      }

      return {
        id: `poly-${market.id}`,
        title: market.question || "Untitled Market",
        source: "@polymarket",
        score: clampScore(volumeScore || 45),
        timestamp: toIso(market.endDate ?? null),
        origin: "POLYMARKET",
        url: market.slug ? `https://polymarket.com/market/${market.slug}` : `https://polymarket.com/`,
        image: market.image,
        outcomes,
        volume: formatVolume(market.volume),
      };
    });

    // Sort by volume/score
    items.sort((a, b) => b.score - a.score);

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    console.error("Polymarket API Error:", error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
