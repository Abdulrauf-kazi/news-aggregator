import { NextResponse } from "next/server";
import { readStoredStories } from "@/lib/story-db";
import { embedText } from "@/lib/embeddings";
import { rankSearchResults } from "@/lib/search-ranking";

type SearchResult = {
  id: string;
  title: string;
  topic: string;
  timestamp: string;
  url?: string;
  sourceIds: string[];
  score: number;
  matchType: "semantic" | "keyword";
  relevance: number;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim();
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit")) || 30), 50);

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const stories = await readStoredStories();
  if (stories.length === 0) {
    return NextResponse.json({ results: [], total: 0 });
  }

  // Semantic scores only when the query was embedded by the model: lexical
  // fallback vectors are not comparable with model vectors, and keyword search
  // already covers lexical matching. Brute-force cosine over the stored stories
  // is cheap and avoids rebuilding the shared graph vector index per search.
  let queryEmbedding: { embedding: number[]; model: string } | null = null;
  try {
    const result = await embedText(query);
    if (result.fromModel) queryEmbedding = result;
  } catch {
    // Semantic search failed, fall back to keyword only
  }

  const results: SearchResult[] = rankSearchResults({ stories, query, queryEmbedding }).map(
    ({ story, relevance, matchType }) => ({
      id: story.id,
      title: story.title,
      topic: story.topic,
      timestamp: story.timestamp,
      url: story.url,
      sourceIds: story.sourceIds,
      score: story.score,
      matchType,
      relevance,
    }),
  );

  return NextResponse.json({
    results: results.slice(0, limit),
    total: results.length,
  });
}
