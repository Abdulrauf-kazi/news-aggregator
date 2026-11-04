/**
 * Trains the topic-classification head (lib/topic-head.ts) on frozen MiniLM embeddings.
 *
 *   bun run train:topic-head              # train on eval/train.json
 *   bun run train:topic-head --from-db    # + self-training on stored stories (pseudo-labels)
 *
 * Procedure
 *   - embeddings: frozen all-MiniLM-L6-v2 (384-d, mean-pooled, L2-normalised)
 *   - data: eval/train.json (240 hand-labelled headlines, 30/topic), stratified 80/20
 *     train/validation split (seeded); eval/benchmark.json is the untouched TEST set
 *   - optional pseudo-labels: stored stories where the keyword rules (strength >= 2)
 *     and the zero-shot prototype classifier agree (high-precision weak supervision)
 *   - models: softmax regression (linear) and a 1-hidden-layer MLP (ReLU, dropout)
 *   - loss: cross-entropy + L2 weight decay; optimiser: Adam; mini-batch 32;
 *     early stopping on validation loss (patience 30), best checkpoint kept
 * Outputs: lib/models/topic-head.json, eval/training-curve.svg, eval/TRAINING.md
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.EMBEDDING_PROVIDER ??= "local";

const here = dirname(fileURLToPath(import.meta.url));
const { embedTexts } = await import("../lib/embeddings");
const { classifyTopic, classifyTopicByEmbedding, getTopicPrototypes } = await import("../lib/topic-classifier");
const { topicHeadForward, softmax } = await import("../lib/topic-head");
import type { TopicHeadWeights } from "../lib/topic-head";
const { TOPICS } = await import("../lib/sources");

const FROM_DB = process.argv.includes("--from-db");
// eslint-disable-next-line turbo/no-undeclared-env-vars -- local script knob, not a build input
const SEED = Number(process.env.TOPIC_HEAD_SEED ?? 42);
const HIDDEN = 64;
const LR = 0.003;
const WEIGHT_DECAY = 1e-4;
const DROPOUT = 0.2;
const BATCH = 32;
const MAX_EPOCHS = 400;
const PATIENCE = 30;

// ── deterministic RNG ───────────────────────────────────────────────────────
let rngState = SEED;
const rand = () => {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gaussian = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const shuffle = <T>(items: T[]) => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

// ── data ────────────────────────────────────────────────────────────────────
const labels = [...TOPICS] as string[];
const train = JSON.parse(readFileSync(join(here, "train.json"), "utf8")).examples as Array<{ topic: string; title: string }>;
const bench = JSON.parse(readFileSync(join(here, "benchmark.json"), "utf8")).topics as Array<{ topic: string; title: string }>;

type Example = { x: number[]; y: number; source: "train" | "pseudo" };
const embed = async (titles: string[]) => {
  const results = await embedTexts(titles);
  if (!results.every((r) => r.fromModel)) throw new Error("Neural embeddings unavailable (set EMBEDDING_LOCAL_MODEL_PATH or HUGGINGFACE_API_KEY)");
  return results;
};
const trainEmb = await embed(train.map((e) => e.title));
const testEmb = await embed(bench.map((e) => e.title));
const embeddingModel = trainEmb[0]!.model;

const byClass = new Map<number, Example[]>();
train.forEach((e, i) => {
  const y = labels.indexOf(e.topic);
  if (y < 0) throw new Error(`unknown topic ${e.topic}`);
  const list = byClass.get(y) ?? [];
  list.push({ x: trainEmb[i]!.embedding, y, source: "train" });
  byClass.set(y, list);
});
const trainSet: Example[] = [];
const valSet: Example[] = [];
for (const list of byClass.values()) {
  const shuffled = shuffle(list);
  const nVal = Math.round(shuffled.length * 0.2);
  valSet.push(...shuffled.slice(0, nVal));
  trainSet.push(...shuffled.slice(nVal));
}

let pseudoCount = 0;
if (FROM_DB) {
  const { getDb } = await import("../lib/mongodb");
  const prototypes = await getTopicPrototypes();
  const stories = await (await getDb()).collection("stories").find({ embeddingModel }).toArray();
  const benchTitles = new Set(bench.map((b) => b.title.toLowerCase()));
  for (const story of stories) {
    const title = String(story.title ?? "");
    if (!prototypes || !Array.isArray(story.embedding) || benchTitles.has(title.toLowerCase())) continue;
    const keyword = classifyTopic({ title, content: story.content as string | undefined });
    const neural = classifyTopicByEmbedding(story.embedding as number[], prototypes.centroids);
    if (keyword.strength >= 2 && keyword.topic === neural.topic) {
      trainSet.push({ x: story.embedding as number[], y: labels.indexOf(keyword.topic), source: "pseudo" });
      pseudoCount += 1;
    }
  }
}
const testSet: Example[] = bench.map((e, i) => ({ x: testEmb[i]!.embedding, y: labels.indexOf(e.topic), source: "train" }));

// ── model + training ────────────────────────────────────────────────────────
type Params = { W1: number[][]; b1: number[]; W2: number[][]; b2: number[] };
const D = trainSet[0]!.x.length;
const K = labels.length;

const initParams = (hidden: number): Params => {
  if (hidden === 0) {
    return { W1: [], b1: [], W2: Array.from({ length: K }, () => Array.from({ length: D }, () => gaussian() * Math.sqrt(1 / D))), b2: new Array(K).fill(0) };
  }
  return {
    W1: Array.from({ length: hidden }, () => Array.from({ length: D }, () => gaussian() * Math.sqrt(2 / D))), // He init
    b1: new Array(hidden).fill(0),
    W2: Array.from({ length: K }, () => Array.from({ length: hidden }, () => gaussian() * Math.sqrt(1 / hidden))),
    b2: new Array(K).fill(0),
  };
};

const forward = (p: Params, x: number[], dropoutMask?: number[]) => {
  if (p.W1.length === 0) {
    const logits = p.W2.map((row, k) => row.reduce((s, w, i) => s + w * (x[i] ?? 0), p.b2[k]!));
    return { hidden: x, logits, probs: softmax(logits), pre: [] as number[] };
  }
  const pre = p.W1.map((row, j) => row.reduce((s, w, i) => s + w * (x[i] ?? 0), p.b1[j]!));
  const hidden = pre.map((v, j) => (v > 0 ? v : 0) * (dropoutMask ? dropoutMask[j]! : 1));
  const logits = p.W2.map((row, k) => row.reduce((s, w, j) => s + w * hidden[j]!, p.b2[k]!));
  return { hidden, logits, probs: softmax(logits), pre };
};

const lossAndAcc = (p: Params, data: Example[]) => {
  let loss = 0, correct = 0;
  for (const ex of data) {
    const { probs } = forward(p, ex.x);
    loss += -Math.log((probs[ex.y] ?? 0) + 1e-12);
    if (probs.indexOf(Math.max(...probs)) === ex.y) correct += 1;
  }
  return { loss: loss / data.length, acc: correct / data.length };
};

const zerosLike = (p: Params): Params => ({
  W1: p.W1.map((r) => r.map(() => 0)), b1: p.b1.map(() => 0), W2: p.W2.map((r) => r.map(() => 0)), b2: p.b2.map(() => 0),
});
const clone = (p: Params): Params => JSON.parse(JSON.stringify(p));

function trainModel(hidden: number) {
  let params = initParams(hidden);
  const m = zerosLike(params), v = zerosLike(params);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  let step = 0, best = { valLoss: Infinity, epoch: 0, params: clone(params) }, sinceBest = 0;
  const curve: Array<{ epoch: number; trainLoss: number; valLoss: number; valAcc: number; trainAcc: number }> = [];

  for (let epoch = 1; epoch <= MAX_EPOCHS; epoch += 1) {
    for (const batch of chunk(shuffle(trainSet), BATCH)) {
      const g = zerosLike(params);
      for (const ex of batch) {
        const mask = hidden ? Array.from({ length: hidden }, () => (rand() < DROPOUT ? 0 : 1 / (1 - DROPOUT))) : undefined;
        const { hidden: h, probs, pre } = forward(params, ex.x, mask);
        const dLogits = probs.map((pk, k) => pk - (k === ex.y ? 1 : 0)); // softmax + CE gradient
        for (let k = 0; k < K; k += 1) {
          g.b2[k]! += dLogits[k]!;
          const row = g.W2[k]!;
          for (let j = 0; j < h.length; j += 1) row[j]! += dLogits[k]! * h[j]!;
        }
        if (hidden) {
          for (let j = 0; j < hidden; j += 1) {
            if (pre[j]! <= 0 || mask![j] === 0) continue; // ReLU + dropout gate
            let dh = 0;
            for (let k = 0; k < K; k += 1) dh += dLogits[k]! * params.W2[k]![j]!;
            dh *= mask![j]!;
            g.b1[j]! += dh;
            const row = g.W1[j]!;
            for (let i = 0; i < D; i += 1) row[i]! += dh * ex.x[i]!;
          }
        }
      }
      step += 1;
      const n = batch.length;
      const update = (pa: number[], ga: number[], ma: number[], va: number[], decay: boolean) => {
        for (let i = 0; i < pa.length; i += 1) {
          const grad = ga[i]! / n + (decay ? WEIGHT_DECAY * pa[i]! : 0);
          ma[i] = b1 * ma[i]! + (1 - b1) * grad;
          va[i] = b2 * va[i]! + (1 - b2) * grad * grad;
          const mHat = ma[i]! / (1 - b1 ** step), vHat = va[i]! / (1 - b2 ** step);
          pa[i] = pa[i]! - (LR * mHat) / (Math.sqrt(vHat) + eps);
        }
      };
      params.W1.forEach((row, j) => update(row, g.W1[j]!, m.W1[j]!, v.W1[j]!, true));
      update(params.b1, g.b1, m.b1, v.b1, false);
      params.W2.forEach((row, k) => update(row, g.W2[k]!, m.W2[k]!, v.W2[k]!, true));
      update(params.b2, g.b2, m.b2, v.b2, false);
    }
    const tr = lossAndAcc(params, trainSet), va = lossAndAcc(params, valSet);
    curve.push({ epoch, trainLoss: tr.loss, trainAcc: tr.acc, valLoss: va.loss, valAcc: va.acc });
    if (va.loss < best.valLoss - 1e-4) {
      best = { valLoss: va.loss, epoch, params: clone(params) };
      sinceBest = 0;
    } else if ((sinceBest += 1) >= PATIENCE) break;
  }
  params = best.params;
  return { params, bestEpoch: best.epoch, curve };
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const macroF1 = (gold: number[], pred: number[]) =>
  labels.reduce((sum, _, c) => {
    const tp = gold.filter((g, i) => g === c && pred[i] === c).length;
    const fp = gold.filter((g, i) => g !== c && pred[i] === c).length;
    const fn = gold.filter((g, i) => g === c && pred[i] !== c).length;
    const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
    return sum + (p + r ? (2 * p * r) / (p + r) : 0);
  }, 0) / labels.length;

const evaluate = (predict: (ex: Example, i: number) => number) => {
  const pred = testSet.map(predict);
  const gold = testSet.map((e) => e.y);
  return { accuracy: pred.filter((p, i) => p === gold[i]).length / gold.length, macroF1: macroF1(gold, pred) };
};

const t0 = Date.now();
const linear = trainModel(0);
const mlp = trainModel(HIDDEN);
const trainMs = Date.now() - t0;

const prototypes = await getTopicPrototypes();
const argmax = (probs: number[]) => probs.indexOf(Math.max(...probs));
const keywordTest = bench.map((b) => classifyTopic({ title: b.title }));
const results: Record<string, { accuracy: number; macroF1: number }> = {
  "Neural zero-shot (prototypes, no training)": evaluate((ex) => labels.indexOf(classifyTopicByEmbedding(ex.x, prototypes!.centroids).topic)),
  "Softmax regression head (trained)": evaluate((ex) => argmax(forward(linear.params, ex.x).probs)),
  [`MLP head 384-${HIDDEN}-8 (trained)`]: evaluate((ex) => argmax(forward(mlp.params, ex.x).probs)),
  "Hybrid: keyword (strength >= 2) else MLP head": evaluate((ex, i) =>
    keywordTest[i]!.strength >= 2 ? labels.indexOf(keywordTest[i]!.topic) : argmax(forward(mlp.params, ex.x).probs)),
};

// ── outputs ─────────────────────────────────────────────────────────────────
const round = (v: number) => Math.round(v * 1e5) / 1e5;
const weights: TopicHeadWeights = {
  version: 1,
  embeddingModel,
  labels,
  inputDim: D,
  hiddenDim: HIDDEN,
  W1: mlp.params.W1.map((r) => r.map(round)),
  b1: mlp.params.b1.map(round),
  W2: mlp.params.W2.map((r) => r.map(round)),
  b2: mlp.params.b2.map(round),
  trainedAt: new Date().toISOString(),
  metrics: {
    testAccuracy: results[`MLP head 384-${HIDDEN}-8 (trained)`]!.accuracy,
    testMacroF1: results[`MLP head 384-${HIDDEN}-8 (trained)`]!.macroF1,
    bestEpoch: mlp.bestEpoch,
    trainExamples: trainSet.length,
    pseudoLabelled: pseudoCount,
  },
};
// sanity: the shipped inference code reproduces the trainer's predictions
const mismatch = testSet.filter((ex) => argmax(topicHeadForward(weights, ex.x).probs) !== argmax(forward(mlp.params, ex.x).probs)).length;

mkdirSync(join(here, "..", "lib", "models"), { recursive: true });
writeFileSync(join(here, "..", "lib", "models", "topic-head.json"), JSON.stringify(weights));

const svg = (() => {
  const W = 760, H = 320, P = 48;
  const c = mlp.curve;
  const maxLoss = Math.max(...c.map((r) => Math.max(r.trainLoss, r.valLoss)));
  const x = (e: number) => P + ((e - 1) / Math.max(1, c.length - 1)) * (W - 2 * P);
  const yL = (v: number) => H - P - (v / maxLoss) * (H - 2 * P);
  const yA = (v: number) => H - P - v * (H - 2 * P);
  const path = (f: (r: (typeof c)[number]) => number, y: (v: number) => number) => c.map((r, i) => `${i ? "L" : "M"}${x(r.epoch).toFixed(1)},${y(f(r)).toFixed(1)}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${W / 2}" y="20" text-anchor="middle" font-size="14">Topic MLP head: learning curve (best epoch ${mlp.bestEpoch})</text>
<line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#999"/><line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#999"/>
<text x="${W / 2}" y="${H - 12}" text-anchor="middle">epoch</text>
<text x="14" y="${H / 2}" transform="rotate(-90 14 ${H / 2})" text-anchor="middle">loss (left) / val accuracy (right, 0-1)</text>
<path d="${path((r) => r.trainLoss, yL)}" fill="none" stroke="#2563eb" stroke-width="2"/>
<path d="${path((r) => r.valLoss, yL)}" fill="none" stroke="#dc2626" stroke-width="2"/>
<path d="${path((r) => r.valAcc, yA)}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 3"/>
<line x1="${x(mlp.bestEpoch)}" y1="${P}" x2="${x(mlp.bestEpoch)}" y2="${H - P}" stroke="#555" stroke-dasharray="2 3"/>
<g transform="translate(${W - P - 170},${P})"><rect width="170" height="58" fill="#fff" stroke="#ddd"/>
<line x1="8" y1="14" x2="30" y2="14" stroke="#2563eb" stroke-width="2"/><text x="36" y="18">train loss</text>
<line x1="8" y1="31" x2="30" y2="31" stroke="#dc2626" stroke-width="2"/><text x="36" y="35">validation loss</text>
<line x1="8" y1="48" x2="30" y2="48" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 3"/><text x="36" y="52">validation accuracy</text></g>
</svg>`;
})();
writeFileSync(join(here, "training-curve.svg"), svg);

const f3 = (v: number) => v.toFixed(3);
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const report = [
  "# Topic Head Training",
  "",
  `Generated by \`eval/train-topic-head.ts\` on ${new Date().toISOString().slice(0, 10)} (seed ${SEED}).`,
  "",
  `- Encoder: frozen \`${embeddingModel}\` (${D}-d sentence embeddings)`,
  `- Train / validation: ${trainSet.length} / ${valSet.length} examples (stratified 80/20 split of eval/train.json${FROM_DB ? `, plus ${pseudoCount} pseudo-labelled stored stories in train` : ""})`,
  `- Test: ${testSet.length} held-out headlines from eval/benchmark.json (never used for training or model selection)`,
  `- MLP: Linear(${D},${HIDDEN}) → ReLU → Dropout(${DROPOUT}) → Linear(${HIDDEN},${K}) → softmax; Adam lr ${LR}, batch ${BATCH}, L2 ${WEIGHT_DECAY}, early stopping on validation loss (patience ${PATIENCE})`,
  `- Best epoch: linear ${linear.bestEpoch}, MLP ${mlp.bestEpoch}; total training time ${(trainMs / 1000).toFixed(1)} s on CPU`,
  `- Shipped-inference check: ${mismatch} prediction mismatches between trainer and lib/topic-head.ts`,
  "",
  "![learning curve](training-curve.svg)",
  "",
  "| Method (test set) | Accuracy | Macro-F1 |",
  "|---|---|---|",
  ...Object.entries(results).map(([name, r]) => `| ${name} | ${pct(r.accuracy)} | ${f3(r.macroF1)} |`),
  "",
  "Caveat: train and test headlines were both hand-written for this project, so absolute numbers are optimistic relative to live feeds; the comparison between methods is the meaningful part. Run with `--from-db` after ingesting real stories to add pseudo-labelled live data.",
  "",
].join("\n");
writeFileSync(join(here, "TRAINING.md"), report);
console.log(report);
process.exit(0);
