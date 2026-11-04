import type { StoryNode } from "./graph";

// MiniLM cosine for unrelated text sits around 0-0.2; below this a "semantic"
// hit is noise and should not be shown. Tuned on eval/benchmark.json.
export const MIN_SEMANTIC_SIMILARITY = Number(
  process.env.SEARCH_MIN_SEMANTIC_SIMILARITY ?? 0.3,
);
export const SEMANTIC_WEIGHT = 0.6;
export const KEYWORD_WEIGHT = 0.4;

export type RankedSearchHit = {
  story: StoryNode;
  relevance: number;
  semantic: number;
  keyword: number;
  matchType: "semantic" | "keyword";
};

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

/** Keyword relevance in [0, 1] for every story that matches at least one term. */
export function keywordScores(stories: StoryNode[], query: string) {
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
      if (title.includes(term)) score += 10; // title match is most important
      if (topic.includes(term)) score += 5;
      if (sources.includes(term)) score += 3;
      if (content.includes(term)) score += 1;
    }

    if (score > 0) {
      scores.set(story.id, Math.min(score / (terms.length * 10), 1));
    }
  }
  return scores;
}

/**
 * Hybrid relevance on one scale: 0.6 * semantic + 0.4 * keyword when a model
 * query embedding is available, keyword-only otherwise. Semantic similarity is
 * only computed against stories embedded in the same space as the query.
 */
export function rankSearchResults(input: {
  stories: StoryNode[];
  query: string;
  queryEmbedding?: { embedding: number[]; model: string } | null;
  minSemanticSimilarity?: number;
  mode?: "hybrid" | "keyword" | "semantic";
}): RankedSearchHit[] {
  const mode = input.mode ?? "hybrid";
  const minSimilarity = input.minSemanticSimilarity ?? MIN_SEMANTIC_SIMILARITY;
  const keywordRelevance =
    mode === "semantic" ? new Map<string, number>() : keywordScores(input.stories, input.query);

  const semanticRelevance = new Map<string, number>();
  if (input.queryEmbedding && mode !== "keyword") {
    for (const story of input.stories) {
      if (!story.embedding?.length || story.embeddingModel !== input.queryEmbedding.model) continue;
      const similarity = cosineSimilarity(input.queryEmbedding.embedding, story.embedding);
      if (similarity >= minSimilarity) {
        semanticRelevance.set(story.id, similarity);
      }
    }
  }

  const hasSemantic = semanticRelevance.size > 0;
  const hits: RankedSearchHit[] = [];
  for (const story of input.stories) {
    const semantic = semanticRelevance.get(story.id) ?? 0;
    const keyword = keywordRelevance.get(story.id) ?? 0;
    if (semantic <= 0 && keyword <= 0) continue;

    const semanticPart = hasSemantic ? (mode === "semantic" ? semantic : SEMANTIC_WEIGHT * semantic) : 0;
    const keywordPart = hasSemantic ? KEYWORD_WEIGHT * keyword : keyword;
    hits.push({
      story,
      semantic,
      keyword,
      relevance: semanticPart + keywordPart,
      matchType: semanticPart >= keywordPart ? "semantic" : "keyword",
    });
  }

  return hits.sort((a, b) => b.relevance - a.relevance);
}
