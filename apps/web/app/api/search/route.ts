import { NextResponse } from "next/server";
import { readStoredStories } from "@/lib/story-db";
import { embedText } from "@/lib/embeddings";
import type { StoryNode } from "@/lib/graph";

// MiniLM cosine for unrelated text sits around 0-0.2; below this a "semantic"
// hit is noise and should not be shown.
const MIN_SEMANTIC_SIMILARITY = Number(
  process.env.SEARCH_MIN_SEMANTIC_SIMILARITY ?? 0.3,
);
const SEMANTIC_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

const cosineSimilarity = (a: number[], b: number[]) => {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0, aNorm = 0, bNorm = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    aNorm += ai * ai;
    bNorm += bi * bi;
  }
  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm);
  return denom === 0 ? 0 : dot / denom;
};

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

  const keywordRelevance = keywordScores(stories, query);

  // Semantic scores only when the query was embedded by the model: lexical
  // fallback vectors are not comparable with model vectors, and keyword search
  // already covers lexical matching. Brute-force cosine over the stored stories
  // is cheap and avoids rebuilding the shared graph vector index per search.
  const semanticRelevance = new Map<string, number>();
  try {
    const { embedding, fromModel } = await embedText(query);
    if (fromModel) {
      for (const story of stories) {
        if (!story.embedding?.length) continue;
        const similarity = cosineSimilarity(embedding, story.embedding);
        if (similarity >= MIN_SEMANTIC_SIMILARITY) {
          semanticRelevance.set(story.id, similarity);
        }
      }
    }
  } catch {
    // Semantic search failed, fall back to keyword only
  }

  // Hybrid relevance on one scale (previously raw cosine and keyword scores
  // were sorted together as if comparable).
  const hasSemantic = semanticRelevance.size > 0;
  const results: SearchResult[] = [];
  for (const story of stories) {
    const semantic = semanticRelevance.get(story.id) ?? 0;
    const keyword = keywordRelevance.get(story.id) ?? 0;
    if (semantic <= 0 && keyword <= 0) continue;

    const semanticPart = hasSemantic ? SEMANTIC_WEIGHT * semantic : 0;
    const keywordPart = hasSemantic ? KEYWORD_WEIGHT * keyword : keyword;
    results.push({
      id: story.id,
      title: story.title,
      topic: story.topic,
      timestamp: story.timestamp,
      url: story.url,
      sourceIds: story.sourceIds,
      score: story.score,
      matchType: semanticPart >= keywordPart ? "semantic" : "keyword",
      relevance: semanticPart + keywordPart,
    });
  }

  results.sort((a, b) => b.relevance - a.relevance);

  return NextResponse.json({
    results: results.slice(0, limit),
    total: results.length,
  });
}

/** Keyword relevance in [0, 1] for every story that matches at least one term. */
function keywordScores(stories: StoryNode[], query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  const scores = new Map<string, number>();
  if (terms.length === 0) return scores;

  for (const story of stories) {
    const title = (story.title || "").toLowerCase();
    const content = (story.content || "").toLowerCase();
    const topic = (story.topic || "").toLowerCase();
    const sources = story.sourceIds.join(" ").toLowerCase();

    let score = 0;

    for (const term of terms) {
      // Title match is most important
      if (title.includes(term)) score += 10;
      // Topic match
      if (topic.includes(term)) score += 5;
      // Source match
      if (sources.includes(term)) score += 3;
      // Content match
      if (content.includes(term)) score += 1;
    }

    if (score > 0) {
      scores.set(story.id, Math.min(score / (terms.length * 10), 1));
    }
  }

  return scores;
}
