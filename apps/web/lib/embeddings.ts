import { createHash } from "node:crypto";
import type { StoryNode } from "./graph";
import { getJsonValue, setJsonValue } from "./redis";

const DEFAULT_MODEL =
  process.env.EMBEDDING_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2";
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 384);
const EMBEDDING_CACHE_TTL_SECONDS = Number(
  process.env.EMBEDDING_CACHE_TTL_SECONDS ?? 60 * 60 * 24 * 7,
);
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

const cacheKey = (text: string) => {
  const hash = createHash("sha1").update(text).digest("hex");
  return `embedding:text:${hash}`;
};

const normalizeVector = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
  return vector.map((value) => value / norm);
};

const deterministicEmbedding = (text: string, dims: number) => {
  const values = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return values;
  }

  for (const token of tokens) {
    const hash = createHash("sha1").update(token).digest();
    const byte0 = hash[0] ?? 0;
    const byte1 = hash[1] ?? 0;
    const byte2 = hash[2] ?? 0;
    const idx = byte0 % dims;
    const sign = byte1 % 2 === 0 ? 1 : -1;
    values[idx] = (values[idx] ?? 0) + sign * (1 + (byte2 % 7) / 10);
  }
  return normalizeVector(values);
};

const fetchSentenceTransformerEmbedding = async (text: string) => {
  const res = await fetch(
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${DEFAULT_MODEL}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(HUGGINGFACE_API_KEY
          ? { Authorization: `Bearer ${HUGGINGFACE_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        inputs: text,
        options: {
          wait_for_model: true,
          use_cache: true,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`HF embedding request failed: ${res.status}`);
  }

  const payload = (await res.json()) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("HF embedding response shape invalid");
  }

  const first = payload[0];
  if (Array.isArray(first)) {
    const rows = payload as number[][];
    const mean = new Array<number>((first as number[]).length).fill(0);
    for (const row of rows) {
      row.forEach((value, index) => {
        mean[index] = (mean[index] ?? 0) + Number(value);
      });
    }
    return normalizeVector(mean.map((value) => value / rows.length));
  }

  return normalizeVector((payload as number[]).map((value) => Number(value)));
};

export async function generateSentenceEmbedding(
  text: string,
): Promise<number[]> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return deterministicEmbedding("empty", EMBEDDING_DIM);
  }

  const key = cacheKey(normalizedText);
  const cached = await getJsonValue<number[]>(key);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const embedding = await fetchSentenceTransformerEmbedding(normalizedText);
    await setJsonValue(key, embedding, EMBEDDING_CACHE_TTL_SECONDS);
    return embedding;
  } catch {
    const fallback = deterministicEmbedding(normalizedText, EMBEDDING_DIM);
    await setJsonValue(key, fallback, EMBEDDING_CACHE_TTL_SECONDS);
    return fallback;
  }
}

export async function addEmbeddingsToStories(stories: StoryNode[]) {
  const embeddedStories = await Promise.all(
    stories.map(async (story) => {
      const embedText = `${story.title}\n${story.content ?? ""}`;
      const embedding = await generateSentenceEmbedding(embedText);
      return {
        ...story,
        embedding,
      } satisfies StoryNode;
    }),
  );

  return embeddedStories;
}
