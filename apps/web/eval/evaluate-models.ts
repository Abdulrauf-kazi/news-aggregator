/**
 * Offline evaluation of the News Aggregator models on eval/benchmark.json.
 *
 *   bun run eval:models            (from apps/web)
 *
 * Uses the in-process MiniLM model (EMBEDDING_PROVIDER=local) unless another
 * provider is configured. Writes eval/RESULTS.md and eval/results.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.EMBEDDING_PROVIDER ??= "local";

const here = dirname(fileURLToPath(import.meta.url));
const { embedTexts, lexicalEmbedding, embeddingProviderInfo } = await import("../lib/embeddings");
const {
  classifyTopic,
  classifyTopicByEmbedding,
  getTopicPrototypes,
  refineTopicsWithEmbeddings,
  TOPIC_HEAD,
} = await import("../lib/topic-classifier");
const { predictTopicWithHead } = await import("../lib/topic-head");
const { rankSearchResults } = await import("../lib/search-ranking");
const { numbersConflict, DEDUPE_SIMILARITY_THRESHOLD } = await import("../lib/dedupe");
const { TOPICS } = await import("../lib/sources");
import type { StoryNode } from "../lib/graph";

type Benchmark = {
  topics: Array<{ id: string; topic: string; title: string }>;
  duplicates: Array<{ a: string; b: string; duplicate: boolean }>;
  search: Array<{ query: string; relevant: string[] }>;
};
const bench = JSON.parse(readFileSync(join(here, "benchmark.json"), "utf8")) as Benchmark;

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const f3 = (v: number) => v.toFixed(3);

// ── 1. Topic classification ─────────────────────────────────────────────────
// Legacy classifier reproduced verbatim from the pre-fix source-adapters.ts.
const legacyKeywords: Record<string, string[]> = {
  Macro: ["inflation", "fed", "rate", "yield", "economy"],
  Energy: ["energy", "oil", "gas", "power", "grid"],
  Cyber: ["cyber", "malware", "hack", "threat", "security"],
  Geopolitics: ["conflict", "war", "sanction", "border", "military"],
  Climate: ["climate", "storm", "flood", "wildfire", "weather"],
  Defense: ["defense", "airspace", "navy", "aircraft", "weapon"],
  AI: ["ai", "model", "machine learning", "automation", "neural"],
  Logistics: ["shipping", "port", "supply chain", "aviation", "cargo"],
};
const legacyTopic = (text: string) => {
  const lower = text.toLowerCase();
  for (const [topic, words] of Object.entries(legacyKeywords)) {
    if (words.some((w) => lower.includes(w))) return topic;
  }
  return TOPICS[Math.abs(text.length) % TOPICS.length] as string;
};

const scoreClassification = (gold: string[], pred: string[]) => {
  const labels = [...TOPICS] as string[];
  const correct = gold.filter((g, i) => g === pred[i]).length;
  const perClass = labels.map((label) => {
    const tp = gold.filter((g, i) => g === label && pred[i] === label).length;
    const fp = gold.filter((g, i) => g !== label && pred[i] === label).length;
    const fn = gold.filter((g, i) => g === label && pred[i] !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, precision, recall, f1 };
  });
  const confusion = labels.map((g) => labels.map((p) => gold.filter((x, i) => x === g && pred[i] === p).length));
  return {
    accuracy: correct / gold.length,
    macroF1: perClass.reduce((s, c) => s + c.f1, 0) / labels.length,
    perClass,
    confusion,
  };
};

const t0 = Date.now();
const titles = bench.topics.map((t) => t.title);
const topicEmbeddings = await embedTexts(titles);
const embedMs = Date.now() - t0;
if (!topicEmbeddings.every((e) => e.fromModel)) {
  throw new Error("Neural embeddings unavailable; set EMBEDDING_LOCAL_MODEL_PATH or HUGGINGFACE_API_KEY.");
}
const prototypes = await getTopicPrototypes();
if (!prototypes) throw new Error("Topic prototypes could not be embedded");

const gold = bench.topics.map((t) => t.topic);
const keywordPreds = bench.topics.map((t) => classifyTopic({ title: t.title }));
const neuralPreds = topicEmbeddings.map((e) => classifyTopicByEmbedding(e.embedding, prototypes.centroids));

const topicMethods: Record<string, string[]> = {
  "Legacy substring rules (before)": bench.topics.map((t) => legacyTopic(t.title)),
  "Word-boundary keyword rules": keywordPreds.map((p) => p.topic),
  "Neural zero-shot (MiniLM prototypes)": neuralPreds.map((p) => p.topic),
};
for (const minStrength of [1, 2, 3, 4]) {
  topicMethods[`Hybrid (keyword if strength >= ${minStrength}, else neural)`] = keywordPreds.map((k, i) =>
    k.strength >= minStrength ? k.topic : neuralPreds[i]!.topic,
  );
}
if (TOPIC_HEAD.embeddingModel === topicEmbeddings[0]!.model) {
  topicMethods["Trained MLP head (lib/models/topic-head.json)"] = topicEmbeddings.map(
    (e) => predictTopicWithHead(TOPIC_HEAD, e.embedding).topic,
  );
}
// Exactly what ingestion does (lib/topic-classifier.ts refineTopicsWithEmbeddings).
const DEPLOYED = "Deployed ingestion pipeline (refineTopicsWithEmbeddings)";
topicMethods[DEPLOYED] = (
  await refineTopicsWithEmbeddings(
    bench.topics.map((t, i) => ({
      title: t.title,
      topic: keywordPreds[i]!.topic,
      embedding: topicEmbeddings[i]!.embedding,
      embeddingModel: topicEmbeddings[i]!.model,
    })),
    (story) => classifyTopic({ title: story.title }).strength,
  )
).map((s) => s.topic);
const topicResults = Object.fromEntries(
  Object.entries(topicMethods).map(([name, pred]) => [name, scoreClassification(gold, pred)]),
);
const keywordCoverage = keywordPreds.filter((p) => p.strength > 0).length / keywordPreds.length;

// ── 2. Near-duplicate detection ─────────────────────────────────────────────
const pairTexts = bench.duplicates.flatMap((p) => [p.a, p.b]);
const pairModel = await embedTexts(pairTexts);
const labelsDup = bench.duplicates.map((p) => p.duplicate);
const simModel = bench.duplicates.map((_, i) => dot(pairModel[2 * i]!.embedding, pairModel[2 * i + 1]!.embedding));
const simLexical = bench.duplicates.map((p) => dot(lexicalEmbedding(p.a), lexicalEmbedding(p.b)));

const rocAuc = (scores: number[], labels: boolean[]) => {
  const pos = scores.filter((_, i) => labels[i]);
  const neg = scores.filter((_, i) => !labels[i]);
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
};
const atThreshold = (scores: number[], labels: boolean[], threshold: number, beta = 1) => {
  const tp = scores.filter((s, i) => s > threshold && labels[i]).length;
  const fp = scores.filter((s, i) => s > threshold && !labels[i]).length;
  const fn = scores.filter((s, i) => s <= threshold && labels[i]).length;
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const b2 = beta * beta;
  const f = precision + recall ? ((1 + b2) * precision * recall) / (b2 * precision + recall) : 0;
  return { threshold, precision, recall, f };
};
const sweep = (scores: number[], labels: boolean[], beta: number) => {
  let best = atThreshold(scores, labels, 0.5, beta);
  for (let t = 0.3; t <= 0.96; t += 0.01) {
    const r = atThreshold(scores, labels, Number(t.toFixed(2)), beta);
    if (r.f > best.f) best = r;
  }
  return best;
};
// Candidate guard features (evaluated, only the helpful ones are deployed).
const properNouns = (text: string) =>
  new Set(
    text
      .split(/[^\p{L}\p{N}+&'-]+/u)
      .slice(1) // skip the sentence-initial capital
      .filter((w) => /^\p{Lu}/u.test(w))
      .map((w) => w.replace(/'s$/, "").toLowerCase()),
  );
const entityJaccard = (a: string, b: string) => {
  const x = properNouns(a), y = properNouns(b);
  if (x.size === 0 || y.size === 0) return 1;
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / (x.size + y.size - inter);
};
const simVeto = bench.duplicates.map((p, i) => (numbersConflict(p.a, p.b) ? 0 : simModel[i]!));
const simVetoEntity = bench.duplicates.map((p, i) => simVeto[i]! - 0.15 * (1 - entityJaccard(p.a, p.b)));
const deployed = atThreshold(simVeto, labelsDup, DEDUPE_SIMILARITY_THRESHOLD);
const deployedF05 = atThreshold(simVeto, labelsDup, DEDUPE_SIMILARITY_THRESHOLD, 0.5);

const dedupe = {
  modelNumberVeto: {
    auc: rocAuc(simVeto, labelsDup),
    bestF1: sweep(simVeto, labelsDup, 1),
    bestF05: sweep(simVeto, labelsDup, 0.5),
    deployed,
    deployedF05,
  },
  modelNumberVetoEntity: {
    auc: rocAuc(simVetoEntity, labelsDup),
    bestF1: sweep(simVetoEntity, labelsDup, 1),
    bestF05: sweep(simVetoEntity, labelsDup, 0.5),
  },
  model: {
    auc: rocAuc(simModel, labelsDup),
    at090: atThreshold(simModel, labelsDup, 0.9),
    bestF1: sweep(simModel, labelsDup, 1),
    bestF05: sweep(simModel, labelsDup, 0.5),
    meanPos: simModel.filter((_, i) => labelsDup[i]).reduce((a, b) => a + b, 0) / labelsDup.filter(Boolean).length,
    meanNeg: simModel.filter((_, i) => !labelsDup[i]).reduce((a, b) => a + b, 0) / labelsDup.filter((x) => !x).length,
  },
  lexical: {
    auc: rocAuc(simLexical, labelsDup),
    at090: atThreshold(simLexical, labelsDup, 0.9),
    bestF1: sweep(simLexical, labelsDup, 1),
  },
};
const hardestNegatives = bench.duplicates
  .map((p, i) => ({ ...p, sim: simModel[i]! }))
  .filter((p) => !p.duplicate)
  .sort((a, b) => b.sim - a.sim)
  .slice(0, 5);
const hardestPositives = bench.duplicates
  .map((p, i) => ({ ...p, sim: simModel[i]! }))
  .filter((p) => p.duplicate)
  .sort((a, b) => a.sim - b.sim)
  .slice(0, 5);

// ── 3. Search retrieval ─────────────────────────────────────────────────────
const corpus: StoryNode[] = bench.topics.map((t, i) => ({
  id: t.id,
  title: t.title,
  topic: classifyTopic({ title: t.title }).topic,
  score: 50,
  sourceIds: ["benchmark"],
  timestamp: new Date().toISOString(),
  embedding: topicEmbeddings[i]!.embedding,
  embeddingModel: topicEmbeddings[i]!.model,
}));
const queryEmbeddings = await embedTexts(bench.search.map((s) => s.query));

const retrievalMetrics = (mode: "keyword" | "semantic" | "hybrid", minSemanticSimilarity?: number) => {
  let recall5 = 0, mrr = 0, ndcg10 = 0, zeroResult = 0;
  bench.search.forEach((q, qi) => {
    const ranked = rankSearchResults({
      stories: corpus,
      query: q.query,
      queryEmbedding: queryEmbeddings[qi]!,
      mode,
      minSemanticSimilarity,
    }).map((h) => h.story.id);
    if (ranked.length === 0) zeroResult += 1;
    const rel = new Set(q.relevant);
    recall5 += ranked.slice(0, 5).filter((id) => rel.has(id)).length / rel.size;
    const firstHit = ranked.findIndex((id) => rel.has(id));
    mrr += firstHit >= 0 ? 1 / (firstHit + 1) : 0;
    const dcg = ranked.slice(0, 10).reduce((s, id, i) => s + (rel.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
    const idcg = Array.from({ length: Math.min(10, rel.size) }).reduce<number>((s, _, i) => s + 1 / Math.log2(i + 2), 0);
    ndcg10 += dcg / idcg;
  });
  const n = bench.search.length;
  return { recall5: recall5 / n, mrr: mrr / n, ndcg10: ndcg10 / n, zeroResultRate: zeroResult / n };
};
const searchResults: Record<string, ReturnType<typeof retrievalMetrics>> = {
  "Keyword only (before)": retrievalMetrics("keyword"),
  "Semantic only (MiniLM, min sim 0.3)": retrievalMetrics("semantic", 0.3),
  "Hybrid 0.6·semantic + 0.4·keyword (min sim 0.2)": retrievalMetrics("hybrid", 0.2),
  "Hybrid 0.6·semantic + 0.4·keyword (min sim 0.3)": retrievalMetrics("hybrid", 0.3),
  "Hybrid 0.6·semantic + 0.4·keyword (min sim 0.4)": retrievalMetrics("hybrid", 0.4),
};

// ── Report ──────────────────────────────────────────────────────────────────
const info = embeddingProviderInfo();
const lines: string[] = [];
lines.push("# Model Evaluation Results", "");
lines.push(`Generated by \`eval/evaluate-models.ts\` on ${new Date().toISOString().slice(0, 10)}.`);
lines.push(`Embedding provider: \`${info.provider}\`, space: \`${info.space}\` (384-d, mean-pooled, L2-normalised).`);
lines.push(`Dataset: \`eval/benchmark.json\`: ${bench.topics.length} hand-labelled headlines (8 topics × 20), ${bench.duplicates.length} duplicate/non-duplicate pairs, ${bench.search.length} search queries with relevance labels. Headlines were hand-written in news style and labelled by hand; they are not scraped articles.`);
lines.push(`Embedding wall time: ${bench.topics.length} headlines in ${embedMs} ms (includes model load on a cold run; reruns may be served from the Redis embedding cache).`, "");

lines.push("## 1. Topic classification", "");
lines.push(`Keyword rules found evidence for ${pct(keywordCoverage)} of headlines; the rest fall back to a default topic.`, "");
lines.push("| Method | Accuracy | Macro-F1 |", "|---|---|---|");
for (const [name, r] of Object.entries(topicResults)) lines.push(`| ${name} | ${pct(r.accuracy)} | ${f3(r.macroF1)} |`);
const chosenName = DEPLOYED;
const chosen = topicResults[chosenName]!;
lines.push("", `Per-topic F1 for the deployed method (*${chosenName}*):`, "");
lines.push(`| Topic | Precision | Recall | F1 |`, "|---|---|---|---|");
for (const c of chosen.perClass) lines.push(`| ${c.label} | ${f3(c.precision)} | ${f3(c.recall)} | ${f3(c.f1)} |`);
lines.push("", "Confusion matrix (rows = gold, columns = predicted):", "");
lines.push(`| | ${TOPICS.join(" | ")} |`, `|---|${TOPICS.map(() => "---").join("|")}|`);
chosen.confusion.forEach((row, i) => lines.push(`| **${TOPICS[i]}** | ${row.join(" | ")} |`));

lines.push("", "## 2. Near-duplicate detection (dedupe)", "");
lines.push("Cosine similarity between headline pairs; a pair is merged when similarity > threshold.", "");
lines.push("| Embedding | ROC-AUC | P / R / F1 @ 0.90 (old threshold) | Best-F1 threshold (P / R / F1) |", "|---|---|---|---|");
const fmt = (r: { threshold: number; precision: number; recall: number; f: number }) => `${r.threshold.toFixed(2)} (${f3(r.precision)} / ${f3(r.recall)} / ${f3(r.f)})`;
lines.push(`| MiniLM | ${f3(dedupe.model.auc)} | ${f3(dedupe.model.at090.precision)} / ${f3(dedupe.model.at090.recall)} / ${f3(dedupe.model.at090.f)} | ${fmt(dedupe.model.bestF1)} |`);
lines.push(`| MiniLM + numeric-conflict veto | ${f3(dedupe.modelNumberVeto.auc)} | n/a | ${fmt(dedupe.modelNumberVeto.bestF1)} |`);
lines.push(`| MiniLM + numeric veto + entity-overlap penalty | ${f3(dedupe.modelNumberVetoEntity.auc)} | n/a | ${fmt(dedupe.modelNumberVetoEntity.bestF1)} |`);
lines.push(`| Lexical hash fallback | ${f3(dedupe.lexical.auc)} | ${f3(dedupe.lexical.at090.precision)} / ${f3(dedupe.lexical.at090.recall)} / ${f3(dedupe.lexical.at090.f)} | ${fmt(dedupe.lexical.bestF1)} |`);
lines.push("", `Mean MiniLM similarity: duplicates ${f3(dedupe.model.meanPos)}, non-duplicates ${f3(dedupe.model.meanNeg)}. Precision-weighted optimum (F0.5), cosine only: ${fmt(dedupe.model.bestF05)}; with numeric veto: ${fmt(dedupe.modelNumberVeto.bestF05)}.`);
lines.push("", `**Deployed:** MiniLM + numeric-conflict veto, threshold ${DEDUPE_SIMILARITY_THRESHOLD.toFixed(2)}: precision ${f3(deployed.precision)}, recall ${f3(deployed.recall)}, F1 ${f3(deployed.f)}, F0.5 ${f3(deployedF05.f)}. Precision is favoured because a wrong merge hides a story, while a missed merge only shows a duplicate. Same-feed items are additionally never merged at ingestion.`);
lines.push("", "Hardest non-duplicates (highest similarity):", "");
for (const p of hardestNegatives) lines.push(`- ${f3(p.sim)}: "${p.a}" vs "${p.b}"`);
lines.push("", "Hardest true duplicates (lowest similarity):", "");
for (const p of hardestPositives) lines.push(`- ${f3(p.sim)}: "${p.a}" vs "${p.b}"`);

lines.push("", "## 3. Search retrieval", "");
lines.push("| Method | Recall@5 | MRR | nDCG@10 | Zero-result queries |", "|---|---|---|---|---|");
for (const [name, r] of Object.entries(searchResults)) lines.push(`| ${name} | ${f3(r.recall5)} | ${f3(r.mrr)} | ${f3(r.ndcg10)} | ${pct(r.zeroResultRate)} |`);
lines.push("");

writeFileSync(join(here, "RESULTS.md"), lines.join("\n"));
writeFileSync(
  join(here, "results.json"),
  JSON.stringify({ provider: info, embedMs, topicResults: Object.fromEntries(Object.entries(topicResults).map(([k, v]) => [k, { accuracy: v.accuracy, macroF1: v.macroF1 }])), keywordCoverage, dedupe, searchResults }, null, 2),
);
console.log(lines.join("\n"));
process.exit(0);
