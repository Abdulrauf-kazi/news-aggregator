import { createHash } from "node:crypto";
import type { StoryNode } from "./graph";
import { getJsonValue, setJsonValue } from "./redis";

// Provider selection: "auto" (default) uses the Hugging Face API when a key is set,
// otherwise runs the model in-process with transformers.js (ONNX Runtime).
// "lexical" disables neural embeddings entirely.
type EmbeddingProvider = "hf-api" | "local" | "lexical";
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
const EMBEDDING_PROVIDER: EmbeddingProvider = (() => {
  const configured = (process.env.EMBEDDING_PROVIDER ?? "auto").toLowerCase();
  if (configured === "hf-api" || configured === "local" || configured === "lexical") {
    return configured;
  }
  return HUGGINGFACE_API_KEY ? "hf-api" : "local";
})();

const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2";
// transformers.js-compatible ONNX export of the same weights.
const EMBEDDING_LOCAL_MODEL =
  process.env.EMBEDDING_LOCAL_MODEL ?? "Xenova/all-MiniLM-L6-v2";
// Optional directory containing <EMBEDDING_LOCAL_MODEL>/{config,tokenizer}.json + onnx/model.onnx.
// When set, the model is loaded offline from disk; otherwise it is downloaded once from the HF hub.
const EMBEDDING_LOCAL_MODEL_PATH = process.env.EMBEDDING_LOCAL_MODEL_PATH;
// The legacy `api-inference.huggingface.co/pipeline/feature-extraction/*` endpoint
// was retired by Hugging Face; serverless inference now goes through the router.
const EMBEDDING_API_URL =
  process.env.EMBEDDING_API_URL ??
  `https://router.huggingface.co/hf-inference/models/${EMBEDDING_MODEL}/pipeline/feature-extraction`;

/** Name of the embedding space; vectors are only comparable within one space. */
export const LEXICAL_EMBEDDING_SPACE = "lexical-hash-v2";
const spaceOf = (modelId: string) => modelId.split("/").pop() ?? modelId;
export const MODEL_EMBEDDING_SPACE =
  EMBEDDING_PROVIDER === "local"
    ? spaceOf(EMBEDDING_LOCAL_MODEL)
    : EMBEDDING_PROVIDER === "hf-api"
      ? spaceOf(EMBEDDING_MODEL)
      : LEXICAL_EMBEDDING_SPACE;
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 384);
const EMBEDDING_CACHE_TTL_SECONDS = Number(
  process.env.EMBEDDING_CACHE_TTL_SECONDS ?? 60 * 60 * 24 * 7,
);
const EMBEDDING_BATCH_SIZE = Math.max(
  1,
  Number(process.env.EMBEDDING_BATCH_SIZE ?? 32),
);
const EMBEDDING_REQUEST_TIMEOUT_MS = Number(
  process.env.EMBEDDING_REQUEST_TIMEOUT_MS ?? 20000,
);
// MiniLM truncates at 256 word pieces (~1-1.5k chars); sending more only costs bandwidth.
const EMBEDDING_MAX_CHARS = 1500;
// After a provider failure, skip remote calls for a while instead of letting every
// remaining batch time out individually.
const PROVIDER_FAILURE_COOLDOWN_MS = 60_000;
let providerDisabledUntil = 0;
let warnedMissingKey = false;
let observedModelDim: number | null = null;

export type EmbeddingResult = {
  embedding: number[];
  /** true when the vector came from the sentence-transformer model, false for the lexical hash fallback. */
  fromModel: boolean;
  /** Embedding space the vector belongs to (MODEL_EMBEDDING_SPACE or LEXICAL_EMBEDDING_SPACE). */
  model: string;
};

export const embeddingProviderInfo = () => ({
  provider: EMBEDDING_PROVIDER,
  space: MODEL_EMBEDDING_SPACE,
});

// The embedding space is part of the key so switching models never serves stale
// vectors from a different space. Only model vectors are cached.
const cacheKey = (text: string) => {
  const hash = createHash("sha1").update(text).digest("hex");
  return `embedding:v2:${MODEL_EMBEDDING_SPACE}:${hash}`;
};

const normalizeVector = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
  return vector.map((value) => value / norm);
};

const prepareText = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, EMBEDDING_MAX_CHARS);

const fallbackDims = () => observedModelDim ?? EMBEDDING_DIM;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at",
  "by", "from", "as", "is", "are", "was", "were", "be", "been", "it", "its",
  "this", "that", "these", "those", "after", "over", "into", "about", "says",
  "said", "new", "has", "have", "had", "will", "not", "but",
]);

/**
 * Lexical fallback (signed feature hashing over word tokens). Only comparable with
 * other fallback vectors; never cached so it cannot shadow a model vector later.
 */
const deterministicEmbedding = (text: string, dims: number) => {
  const values = new Array<number>(dims).fill(0);
  // Keep decimals ("4.5") and numbers intact: they distinguish e.g. separate quakes.
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}.]+/u)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter(
      (token) =>
        (token.length > 1 || /\p{N}/u.test(token)) && !STOPWORDS.has(token),
    );
  if (tokens.length === 0) {
    return values;
  }

  for (const token of tokens) {
    const hash = createHash("sha1").update(token).digest();
    const byte0 = hash[0] ?? 0;
    const byte1 = hash[1] ?? 0;
    const byte2 = hash[2] ?? 0;
    const byte3 = hash[3] ?? 0;
    const idx = ((byte0 << 8) | byte3) % dims;
    const sign = byte1 % 2 === 0 ? 1 : -1;
    values[idx] = (values[idx] ?? 0) + sign * (1 + (byte2 % 7) / 10);
  }
  return normalizeVector(values);
};

/** Lexical hash embedding (exposed for evaluation / baselines). */
export const lexicalEmbedding = (text: string) =>
  deterministicEmbedding(prepareText(text), fallbackDims());

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && typeof value[0] === "number";

/** Accepts a pooled sentence vector (number[]) or token vectors (number[][]) and returns a unit vector. */
const toSentenceVector = (value: unknown): number[] | null => {
  if (isNumberArray(value)) {
    return normalizeVector(value.map(Number));
  }
  if (Array.isArray(value) && value.length > 0 && isNumberArray(value[0])) {
    const rows = value as number[][];
    const dims = rows[0]!.length;
    const mean = new Array<number>(dims).fill(0);
    for (const row of rows) {
      for (let i = 0; i < dims; i += 1) {
        mean[i] = (mean[i] ?? 0) + Number(row[i] ?? 0);
      }
    }
    return normalizeVector(mean.map((v) => v / rows.length));
  }
  return null;
};

const fetchModelEmbeddings = async (texts: string[]): Promise<number[][]> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EMBEDDING_REQUEST_TIMEOUT_MS,
  );
  try {
    const res = await fetch(EMBEDDING_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wait-for-model": "true",
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
      },
      body: JSON.stringify({ inputs: texts }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HF embedding request failed: ${res.status}`);
    }

    const payload = (await res.json()) as unknown;
    if (!Array.isArray(payload) || payload.length !== texts.length) {
      throw new Error("HF embedding response shape invalid");
    }

    const vectors = payload.map(toSentenceVector);
    if (vectors.some((vector) => !vector || vector.length === 0)) {
      throw new Error("HF embedding response contained invalid vectors");
    }
    return vectors as number[][];
  } finally {
    clearTimeout(timeout);
  }
};

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

let localExtractorPromise: Promise<FeatureExtractor> | null = null;

const loadLocalExtractor = () => {
  localExtractorPromise ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    if (EMBEDDING_LOCAL_MODEL_PATH) {
      env.localModelPath = EMBEDDING_LOCAL_MODEL_PATH;
      env.allowRemoteModels = false;
    }
    const extractor = await pipeline("feature-extraction", EMBEDDING_LOCAL_MODEL, {
      dtype: "fp32",
    });
    return extractor as unknown as FeatureExtractor;
  })().catch((error) => {
    localExtractorPromise = null;
    throw error;
  });
  return localExtractorPromise;
};

const fetchLocalEmbeddings = async (texts: string[]): Promise<number[][]> => {
  const extractor = await loadLocalExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const vectors = output.tolist();
  if (vectors.length !== texts.length) {
    throw new Error("Local embedding output shape invalid");
  }
  return vectors.map((vector) => normalizeVector(vector.map(Number)));
};

const computeModelEmbeddings = (texts: string[]) =>
  EMBEDDING_PROVIDER === "local"
    ? fetchLocalEmbeddings(texts)
    : fetchModelEmbeddings(texts);

const canUseProvider = () => {
  if (EMBEDDING_PROVIDER === "lexical") {
    return false;
  }
  if (EMBEDDING_PROVIDER === "hf-api" && !HUGGINGFACE_API_KEY) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "EMBEDDING_PROVIDER=hf-api but HUGGINGFACE_API_KEY is not set; using lexical fallback embeddings.",
      );
    }
    return false;
  }
  return Date.now() >= providerDisabledUntil;
};

const runWithConcurrency = async (
  tasks: Array<() => Promise<void>>,
  concurrency: number,
) => {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), tasks.length) },
    async () => {
      while (next < tasks.length) {
        const task = tasks[next];
        next += 1;
        await task?.();
      }
    },
  );
  await Promise.all(workers);
};

/**
 * Embed many texts: cached model vectors first, then batched model requests,
 * falling back to lexical vectors only for the texts the model could not serve.
 */
export async function embedTexts(
  texts: string[],
  concurrency = 4,
): Promise<EmbeddingResult[]> {
  // In-process inference is CPU-bound; parallel batches only add contention.
  const effectiveConcurrency = EMBEDDING_PROVIDER === "local" ? 1 : concurrency;
  const prepared = texts.map(prepareText);
  const results: Array<EmbeddingResult | undefined> = new Array(texts.length);

  const cached = await Promise.all(
    prepared.map((text) =>
      text ? getJsonValue<number[]>(cacheKey(text)) : Promise.resolve(null),
    ),
  );

  const pending: number[] = [];
  prepared.forEach((text, index) => {
    if (!text) {
      results[index] = {
        embedding: new Array<number>(fallbackDims()).fill(0),
        fromModel: false,
        model: LEXICAL_EMBEDDING_SPACE,
      };
      return;
    }
    const hit = cached[index];
    if (hit && hit.length > 0) {
      results[index] = { embedding: hit, fromModel: true, model: MODEL_EMBEDDING_SPACE };
      return;
    }
    pending.push(index);
  });

  // Identical texts in one run share a single model input.
  const uniqueTexts = Array.from(new Set(pending.map((i) => prepared[i]!)));
  const modelVectors = new Map<string, number[]>();

  const batches: string[][] = [];
  for (let i = 0; i < uniqueTexts.length; i += EMBEDDING_BATCH_SIZE) {
    batches.push(uniqueTexts.slice(i, i + EMBEDDING_BATCH_SIZE));
  }

  await runWithConcurrency(
    batches.map((batch) => async () => {
      if (!canUseProvider()) {
        return;
      }
      try {
        const vectors = await computeModelEmbeddings(batch);
        observedModelDim = vectors[0]?.length ?? observedModelDim;
        await Promise.all(
          batch.map((text, idx) => {
            const vector = vectors[idx]!;
            modelVectors.set(text, vector);
            return setJsonValue(
              cacheKey(text),
              vector,
              EMBEDDING_CACHE_TTL_SECONDS,
            );
          }),
        );
      } catch (error) {
        providerDisabledUntil = Date.now() + PROVIDER_FAILURE_COOLDOWN_MS;
        console.warn(
          "Embedding provider unavailable, using lexical fallback:",
          error instanceof Error ? error.message : error,
        );
      }
    }),
    effectiveConcurrency,
  );

  for (const index of pending) {
    const text = prepared[index]!;
    const vector = modelVectors.get(text);
    results[index] = vector
      ? { embedding: vector, fromModel: true, model: MODEL_EMBEDDING_SPACE }
      : {
          embedding: deterministicEmbedding(text, fallbackDims()),
          fromModel: false,
          model: LEXICAL_EMBEDDING_SPACE,
        };
  }

  return results as EmbeddingResult[];
}

export async function embedText(text: string): Promise<EmbeddingResult> {
  const [result] = await embedTexts([text], 1);
  return result!;
}

export async function generateSentenceEmbedding(
  text: string,
): Promise<number[]> {
  return (await embedText(text)).embedding;
}

export async function addEmbeddingsToStories(stories: StoryNode[]) {
  const embeddings = await embedTexts(
    stories.map((story) => `${story.title}\n${story.content ?? ""}`),
  );

  return stories.map(
    (story, index) =>
      ({
        ...story,
        embedding: embeddings[index]?.embedding,
        embeddingModel: embeddings[index]?.model,
      }) satisfies StoryNode,
  );
}

/**
 * Batch-embed multiple texts using batched model requests.
 */
export async function generateBatchEmbeddings(
  texts: string[],
  concurrency = 4,
): Promise<number[][]> {
  const results = await embedTexts(texts, concurrency);
  return results.map((result) => result.embedding);
}

/**
 * Compute mean-pooled embedding from multiple vectors.
 * Used to create a "taste profile" vector from a user's reading history.
 */
export function computeMeanEmbedding(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dims = vectors[0]?.length ?? 0;
  if (dims === 0) return [];

  const mean = new Array<number>(dims).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dims; i += 1) {
      mean[i] = (mean[i] ?? 0) + (vec[i] ?? 0);
    }
  }
  return normalizeVector(mean.map((v) => v / vectors.length));
}
