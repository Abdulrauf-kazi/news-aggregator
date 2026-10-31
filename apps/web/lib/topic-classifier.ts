import { SOURCE_DEFINITIONS, TOPICS, type SourceCategory } from "./sources";

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
