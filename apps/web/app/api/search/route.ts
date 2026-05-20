import { NextResponse } from "next/server";
import { readStoredStories } from "@/lib/story-db";
import { generateSentenceEmbedding } from "@/lib/embeddings";
import { queryByEmbeddingVector, ensureVectorStore } from "@/lib/vector-store";
import type { StoryNode } from "@/lib/graph";

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

const normalizeVector = (v: number[]) => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map(x => x / norm);
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
  const limit = Math.min(Number(url.searchParams.get("limit") || "30"), 50);

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const stories = await readStoredStories();
  if (stories.length === 0) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const keywordResults = keywordSearch(stories, query, limit);

  let semanticResults: SearchResult[] = [];
  try {
    const embedding = await generateSentenceEmbedding(query);
    await ensureVectorStore(stories);
    const vectorHits = queryByEmbeddingVector({
      embedding,
      topK: limit,
    });
    const storyMap = new Map(stories.map((s: StoryNode) => [s.id, s]));
    semanticResults = vectorHits
      .map((hit: { storyId: string; similarity: number }) => {
        const story = storyMap.get(hit.storyId);
        if (!story) return null;
        return {
          id: story.id,
          title: story.title,
          topic: story.topic,
          timestamp: story.timestamp,
          url: story.url,
          sourceIds: story.sourceIds,
          score: story.score,
          matchType: "semantic" as const,
          relevance: hit.similarity,
        };
      })
      .filter(Boolean) as SearchResult[];
  } catch {
    // Semantic search failed (e.g., no HF API key), fall back to keyword only
  }

  // Merge & deduplicate: semantic results get priority boost
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  // Add semantic results first (higher relevance)
  for (const r of semanticResults) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }

  // Add keyword results not already in semantic
  for (const r of keywordResults) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }

  // Sort by relevance
  merged.sort((a, b) => b.relevance - a.relevance);

  return NextResponse.json({
    results: merged.slice(0, limit),
    total: merged.length,
  });
}

function keywordSearch(
  stories: StoryNode[],
  query: string,
  limit: number,
): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: SearchResult[] = [];

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
      results.push({
        id: story.id,
        title: story.title,
        topic: story.topic,
        timestamp: story.timestamp,
        url: story.url,
        sourceIds: story.sourceIds,
        score: story.score,
        matchType: "keyword",
        relevance: Math.min(score / (terms.length * 10), 1),
      });
    }
  }

  return results
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}
