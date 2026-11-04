import { SOURCE_DEFINITIONS, TOPICS, type SourceCategory } from "./sources";
import { predictTopicWithHead, type TopicHeadWeights } from "./topic-head";
import topicHeadJson from "./models/topic-head.json";

/** Trained MLP head (eval/train-topic-head.ts); used when it matches the story's embedding space. */
export const TOPIC_HEAD = topicHeadJson as unknown as TopicHeadWeights;

type Topic = (typeof TOPICS)[number];

const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  Macro: [
    "inflation", "deflation", "fed", "federal reserve", "central bank", "interest rate",
    "rate cut", "rate hike", "yield", "bond", "treasury", "economy", "economic", "gdp",
    "recession", "ecb", "imf", "tariff", "unemployment", "jobs report", "stock market",
    "stocks", "earnings", "currency", "dollar", "bitcoin", "crypto", "nasdaq", "dow",
  ],
  Energy: [
    "energy", "oil", "crude", "natural gas", "gas prices", "lng", "opec", "power grid",
    "power plant", "electricity", "solar", "wind farm", "wind power", "nuclear power",
    "renewable", "battery", "pipeline", "refinery", "fuel", "coal", "hydrogen",
  ],
  Cyber: [
    "cyber", "cybersecurity", "cyberattack", "malware", "ransomware", "hack", "hacked",
    "hacker", "hacking", "data breach", "breach", "phishing", "vulnerability", "exploit",
    "botnet", "ddos", "zero-day", "spyware", "threat actor", "cve",
  ],
  Geopolitics: [
    "conflict", "war", "wars", "sanction", "border", "diplomat", "diplomatic", "election",
    "president", "prime minister", "minister", "treaty", "summit", "ceasefire", "invasion",
    "protest", "refugee", "migration", "united nations", "parliament", "coup", "hostage",
    "ukraine", "russia", "israel", "gaza", "iran", "taiwan",
  ],
  Climate: [
    "climate", "storm", "hurricane", "typhoon", "cyclone", "tornado", "flood", "wildfire",
    "weather", "heatwave", "heat wave", "drought", "earthquake", "quake", "tsunami",
    "volcano", "eruption", "emissions", "carbon", "global warming",
  ],
  Defense: [
    "defense", "defence", "military", "army", "navy", "air force", "airspace", "missile",
    "drone", "weapon", "troops", "pentagon", "nato", "warship", "fighter jet",
    "nuclear weapon", "artillery",
  ],
  AI: [
    "ai", "artificial intelligence", "machine learning", "deep learning", "llm",
    "language model", "neural", "openai", "chatgpt", "gpt", "deepmind", "nvidia",
    "chatbot", "generative", "robot", "robotics", "automation",
  ],
  Logistics: [
    "shipping", "shipment", "port", "supply chain", "aviation", "airline", "airport",
    "flight", "cargo", "freight", "vessel", "maritime", "suez canal", "railway",
    "trucking", "logistics",
  ],
};

// Used only when the text itself has no topic keywords.
const SOURCE_TAG_TOPICS: Record<string, Topic> = {
  technology: "AI",
  software: "AI",
  research: "AI",
  ai: "AI",
  macro: "Macro",
  economy: "Macro",
  markets: "Macro",
  crypto: "Macro",
  energy: "Energy",
  climate: "Climate",
  weather: "Climate",
  hazards: "Climate",
  conflict: "Geopolitics",
  migration: "Geopolitics",
  aviation: "Logistics",
  shipping: "Logistics",
  "threat-intel": "Cyber",
  malware: "Cyber",
};

const CATEGORY_TOPICS: Record<SourceCategory, Topic> = {
  news: "Geopolitics",
  finance: "Macro",
  science: "Climate",
  geopolitics: "Geopolitics",
  transport: "Logistics",
  cyber: "Cyber",
  government: "Macro",
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word matching so "ai" does not match "said" and "fed" does not match "federal".
// Short keywords only allow a plural; longer ones allow common inflections.
const keywordPattern = (keyword: string) => {
  const body = escapeRegex(keyword).replace(/\s+/g, "\\s+");
  const suffix =
    keyword.includes(" ") || keyword.length <= 2
      ? ""
      : keyword.length === 3
        ? "s?"
        : "(?:s|es|ed|ing|er|ers)?";
  return new RegExp(`\\b${body}${suffix}\\b`, "i");
};

const COMPILED_KEYWORDS = (Object.entries(TOPIC_KEYWORDS) as Array<[Topic, string[]]>).map(
  ([topic, keywords]) => ({ topic, patterns: keywords.map(keywordPattern) }),
);

const SOURCE_BY_ID = new Map(SOURCE_DEFINITIONS.map((source) => [source.id, source]));

const countHits = (patterns: RegExp[], text: string) =>
  text ? patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0) : 0;

export type TopicClassification = {
  topic: Topic;
  /** Weighted keyword evidence (title hits count double). 0 means the topic came from source metadata. */
  strength: number;
};

export function classifyTopic(input: {
  title: string;
  content?: string;
  sourceId?: string;
}): TopicClassification {
  let best: TopicClassification | null = null;
  for (const { topic, patterns } of COMPILED_KEYWORDS) {
    const strength = 2 * countHits(patterns, input.title) + countHits(patterns, input.content ?? "");
    if (strength > 0 && (!best || strength > best.strength)) {
      best = { topic, strength };
    }
  }
  if (best) {
    return best;
  }

  const source = input.sourceId ? SOURCE_BY_ID.get(input.sourceId) : undefined;
  const tagTopic = source?.tags.map((tag) => SOURCE_TAG_TOPICS[tag]).find(Boolean);
  return {
    topic: tagTopic ?? (source ? CATEGORY_TOPICS[source.category] : TOPICS[0]),
    strength: 0,
  };
}

// ── Neural (zero-shot) topic classification ─────────────────────────────────
// Each topic is represented by the mean embedding of a few short descriptions.
// A story is assigned to the prototype with the highest cosine similarity.
// The descriptions are deliberately generic and independent of eval data.

const TOPIC_PROTOTYPES: Record<Topic, string[]> = {
  Macro: [
    "Economy and financial markets: inflation, central bank interest rate decisions, GDP growth and recession.",
    "Stock market, bond yields, currencies, employment data, trade tariffs and corporate earnings.",
  ],
  Energy: [
    "Energy markets: oil and natural gas prices, OPEC production, refineries and fuel supply.",
    "Electricity grids, power plants, nuclear, solar and wind energy, batteries and renewables.",
  ],
  Cyber: [
    "Cybersecurity incidents: hackers, ransomware, malware, data breaches and stolen personal data.",
    "Software vulnerabilities exploited by attackers, phishing campaigns, spyware and online fraud.",
  ],
  Geopolitics: [
    "International politics and diplomacy: governments, elections, presidents and prime ministers.",
    "Sanctions, peace talks, protests, refugees, territorial disputes and United Nations resolutions.",
  ],
  Climate: [
    "Natural disasters and extreme weather: hurricanes, floods, wildfires, heatwaves and droughts.",
    "Earthquakes, volcanic eruptions, global warming, emissions and climate science.",
  ],
  Defense: [
    "Military and defence: armed forces, troops, navy, air force and weapons procurement.",
    "Missile launches, drone strikes, air defence, arms contracts and military exercises.",
  ],
  AI: [
    "Artificial intelligence: machine learning models, chatbots, large language models and generative AI.",
    "AI companies, GPU chips for data centers, robotics, self-driving cars and AI regulation.",
  ],
  Logistics: [
    "Transport and logistics: container shipping, ports, freight rates and supply chains.",
    "Airlines and airports, flight disruptions, rail freight, trucking, canals and parcel delivery.",
  ],
};

let prototypePromise: Promise<{
  model: string;
  centroids: Array<{ topic: Topic; vector: number[] }>;
} | null> | null = null;

const meanUnit = (vectors: number[][]) => {
  const dims = vectors[0]?.length ?? 0;
  const mean = new Array<number>(dims).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dims; i += 1) mean[i] = (mean[i] ?? 0) + (vector[i] ?? 0);
  }
  const norm = Math.sqrt(mean.reduce((sum, v) => sum + v * v, 0)) || 1;
  return mean.map((v) => v / norm);
};

const dot = (left: number[], right: number[]) => {
  let sum = 0;
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) sum += (left[i] ?? 0) * (right[i] ?? 0);
  return sum;
};

/** Embeds the topic prototypes once per process. Returns null when no neural model is available. */
export const getTopicPrototypes = () => {
  prototypePromise ??= (async () => {
    const { embedTexts } = await import("./embeddings");
    const topics = Object.keys(TOPIC_PROTOTYPES) as Topic[];
    const texts = topics.flatMap((topic) => TOPIC_PROTOTYPES[topic]);
    const results = await embedTexts(texts);
    if (!results.every((result) => result.fromModel)) {
      prototypePromise = null; // retry later, e.g. once the provider recovers
      return null;
    }
    let offset = 0;
    const centroids = topics.map((topic) => {
      const count = TOPIC_PROTOTYPES[topic].length;
      const vectors = results.slice(offset, offset + count).map((r) => r.embedding);
      offset += count;
      return { topic, vector: meanUnit(vectors) };
    });
    return { model: results[0]!.model, centroids };
  })();
  return prototypePromise;
};

export type NeuralTopicPrediction = { topic: Topic; similarity: number; margin: number };

export function classifyTopicByEmbedding(
  embedding: number[],
  centroids: Array<{ topic: Topic; vector: number[] }>,
): NeuralTopicPrediction {
  const scored = centroids
    .map(({ topic, vector }) => ({ topic, similarity: dot(embedding, vector) }))
    .sort((a, b) => b.similarity - a.similarity);
  const best = scored[0]!;
  return {
    topic: best.topic,
    similarity: best.similarity,
    margin: best.similarity - (scored[1]?.similarity ?? 0),
  };
}

/**
 * Neural topic assignment used at ingestion, in order of preference:
 *   1. trained MLP head (89.4% mean test accuracy over 6 seeds) for every story
 *      embedded in the head's space; on eval it beats keyword overrides;
 *   2. otherwise zero-shot prototypes, but only where keyword evidence is weak
 *      (strength < HYBRID_MIN_KEYWORD_STRENGTH), which is the best zero-shot hybrid;
 *   3. otherwise the keyword/source topic is kept (e.g. lexical fallback vectors).
 * See eval/RESULTS.md and eval/TRAINING.md.
 */
export const HYBRID_MIN_KEYWORD_STRENGTH = 2;

export async function refineTopicsWithEmbeddings<
  T extends { title: string; content?: string; topic: string; embedding?: number[]; embeddingModel?: string },
>(stories: T[], keywordStrength: (story: T) => number): Promise<T[]> {
  const needsPrototypes = stories.some(
    (story) => story.embedding?.length && story.embeddingModel !== TOPIC_HEAD.embeddingModel,
  );
  const prototypes = needsPrototypes ? await getTopicPrototypes() : null;
  return stories.map((story) => {
    if (!story.embedding?.length) return story;
    if (story.embeddingModel === TOPIC_HEAD.embeddingModel) {
      return { ...story, topic: predictTopicWithHead(TOPIC_HEAD, story.embedding).topic };
    }
    if (
      prototypes &&
      story.embeddingModel === prototypes.model &&
      keywordStrength(story) < HYBRID_MIN_KEYWORD_STRENGTH
    ) {
      return { ...story, topic: classifyTopicByEmbedding(story.embedding, prototypes.centroids).topic };
    }
    return story;
  });
}
