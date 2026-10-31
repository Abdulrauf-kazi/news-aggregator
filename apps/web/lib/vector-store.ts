import type { StoryNode } from "./graph";
import { getJsonValue, setJsonValue } from "./redis";

const VECTOR_EMBEDDINGS_KEY = "vector:stories:embeddings";

type FaissIndexInstance = {
  add: (vector: Float32Array | number[]) => void;
  search: (
    vector: Float32Array | number[],
    topK: number,
  ) => { labels: number[] | number[][]; distances?: number[] | number[][] };
};

type VectorStoreState = {
  backend: "faiss" | "cosine";
  storyIds: string[];
  vectors: number[][];
  faissIndex: FaissIndexInstance | null;
};

const state: VectorStoreState = {
  backend: "cosine",
  storyIds: [],
  vectors: [],
  faissIndex: null,
};

const normalizeVector = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
  return vector.map((value) => value / norm);
};

const cosineSimilarity = (left: number[], right: number[]) => {
  const size = Math.min(left.length, right.length);
  if (size === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < size; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (!denom) {
    return 0;
  }
  return dot / denom;
};

const dynamicImport = new Function(
  "moduleName",
  "return import(moduleName);",
) as (moduleName: string) => Promise<unknown>;

const createFaissIndex = async (dimension: number) => {
  try {
    const mod = await dynamicImport("faiss-node");
    const maybeMod = mod as {
      IndexFlatIP?: new (dimension: number) => FaissIndexInstance;
    };
    const FaissCtor = maybeMod?.IndexFlatIP;
    if (!FaissCtor) {
      return null;
    }
    const index = new FaissCtor(dimension) as FaissIndexInstance;
    return index;
  } catch {
    return null;
  }
};

export async function refreshVectorStore(stories: StoryNode[]) {
  const indexedStories = stories.filter(
    (story) => Array.isArray(story.embedding) && story.embedding.length > 0,
  );

  const ids = indexedStories.map((story) => story.id);
  const vectors = indexedStories.map((story) =>
    normalizeVector((story.embedding ?? []).map((value) => Number(value))),
  );

  state.storyIds = ids;
  state.vectors = vectors;
  state.faissIndex = null;
  state.backend = "cosine";

  const embeddingRecord = Object.fromEntries(
    ids.map((id, idx) => [id, vectors[idx]]),
  );
  await setJsonValue(VECTOR_EMBEDDINGS_KEY, embeddingRecord);

  if (vectors.length === 0) {
    return {
      backend: state.backend,
      vectorCount: 0,
    };
  }

  const dimension = vectors[0]?.length ?? 0;
  if (!dimension) {
    return {
      backend: state.backend,
      vectorCount: vectors.length,
    };
  }

  const faissIndex = await createFaissIndex(dimension);
  if (!faissIndex) {
    return {
      backend: state.backend,
      vectorCount: vectors.length,
    };
  }

  for (const vector of vectors) {
    faissIndex.add(Float32Array.from(vector));
  }

  state.backend = "faiss";
  state.faissIndex = faissIndex;
  return {
    backend: state.backend,
    vectorCount: vectors.length,
  };
}

export async function ensureVectorStore(stories: StoryNode[]) {
  const validStories = stories.filter(
    (story) => Array.isArray(story.embedding) && story.embedding.length > 0,
  );
  // Compare as a set: ranking reorders stories on every request (exploration
  // shuffle), and an order check forced a full rebuild + Redis write each time.
  // Vectors are stored aligned with state.storyIds, so order is irrelevant.
  const currentIds = new Set(state.storyIds);
  const sameSet =
    validStories.length === state.storyIds.length &&
    validStories.every((story) => currentIds.has(story.id));
  if (sameSet && state.storyIds.length > 0) {
    return {
      backend: state.backend,
      vectorCount: state.storyIds.length,
    };
  }
  return refreshVectorStore(stories);
}

export function getVectorStoreStatus() {
  return {
    backend: state.backend,
    vectorCount: state.storyIds.length,
  };
}

export async function queryTopKSimilarStories(input: {
  storyId: string;
  topK: number;
}) {
  const storyIndex = state.storyIds.indexOf(input.storyId);
  if (storyIndex === -1) {
    return [] as Array<{ storyId: string; similarity: number }>;
  }

  const queryVector = state.vectors[storyIndex] ?? [];
  if (queryVector.length === 0) {
    return [] as Array<{ storyId: string; similarity: number }>;
  }

  const effectiveTopK = Math.max(
    1,
    Math.min(input.topK, state.storyIds.length - 1),
  );
  if (effectiveTopK <= 0) {
    return [] as Array<{ storyId: string; similarity: number }>;
  }

  if (state.backend === "faiss" && state.faissIndex) {
    const result = state.faissIndex.search(
      Float32Array.from(queryVector),
      effectiveTopK + 1,
    );

    const labels = Array.isArray(result.labels?.[0])
      ? (result.labels[0] as number[])
      : (result.labels as number[]);
    const distances = Array.isArray(result.distances?.[0])
      ? (result.distances?.[0] as number[])
      : ((result.distances as number[] | undefined) ?? []);

    return labels
      .map((label, idx) => ({
        storyId: state.storyIds[label] ?? "",
        similarity: Number(distances[idx] ?? 0),
      }))
      .filter((item) => item.storyId && item.storyId !== input.storyId)
      .slice(0, effectiveTopK);
  }

  return state.storyIds
    .map((candidateId, index) => {
      if (candidateId === input.storyId) {
        return null;
      }
      const candidateVector = state.vectors[index] ?? [];
      const similarity = cosineSimilarity(queryVector, candidateVector);
      return {
        storyId: candidateId,
        similarity,
      };
    })
    .filter((item): item is { storyId: string; similarity: number } =>
      Boolean(item),
    )
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, effectiveTopK);
}

/**
 * Query by a raw embedding vector (not a story ID).
 * Used for cross-user recommendations: embed a user's taste profile → find matching articles.
 */
export function queryByEmbeddingVector(input: {
  embedding: number[];
  topK: number;
  excludeStoryIds?: string[];
}): Array<{ storyId: string; similarity: number }> {
  const queryVector = normalizeVector(input.embedding);
  if (queryVector.length === 0 || state.storyIds.length === 0) {
    return [];
  }

  const excludeSet = new Set(input.excludeStoryIds ?? []);
  const effectiveTopK = Math.max(1, Math.min(input.topK, state.storyIds.length));

  if (state.backend === "faiss" && state.faissIndex) {
    const result = state.faissIndex.search(
      Float32Array.from(queryVector),
      effectiveTopK + excludeSet.size,
    );

    const labels = Array.isArray(result.labels?.[0])
      ? (result.labels[0] as number[])
      : (result.labels as number[]);
    const distances = Array.isArray(result.distances?.[0])
      ? (result.distances?.[0] as number[])
      : ((result.distances as number[] | undefined) ?? []);

    return labels
      .map((label, idx) => ({
        storyId: state.storyIds[label] ?? "",
        similarity: Number(distances[idx] ?? 0),
      }))
      .filter((item) => item.storyId && !excludeSet.has(item.storyId))
      .slice(0, effectiveTopK);
  }

  return state.storyIds
    .map((candidateId, index) => {
      if (excludeSet.has(candidateId)) return null;
      const candidateVector = state.vectors[index] ?? [];
      const similarity = cosineSimilarity(queryVector, candidateVector);
      return { storyId: candidateId, similarity };
    })
    .filter((item): item is { storyId: string; similarity: number } => Boolean(item))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, effectiveTopK);
}

export async function buildStoryRecommendations(input: {
  stories: StoryNode[];
  topK: number;
}) {
  await refreshVectorStore(input.stories);

  const recommendations: Record<
    string,
    Array<{ storyId: string; similarity: number }>
  > = {};
  for (const story of input.stories) {
    recommendations[story.id] = await queryTopKSimilarStories({
      storyId: story.id,
      topK: input.topK,
    });
  }

  return recommendations;
}

export async function getStoredVectorEmbeddings() {
  return (
    (await getJsonValue<Record<string, number[]>>(VECTOR_EMBEDDINGS_KEY)) ?? {}
  );
}
