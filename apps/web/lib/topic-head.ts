// Trained topic-classification head on top of frozen sentence embeddings.
//
// Architecture: 384-d MiniLM embedding -> Linear(384, H) -> ReLU -> Linear(H, 8) -> softmax.
// Trained by eval/train-topic-head.ts (cross-entropy, Adam, early stopping) and
// stored as plain JSON so inference needs no ML runtime beyond a few dot products.

export type TopicHeadWeights = {
  version: 1;
  /** Embedding space the head was trained on; inputs from other spaces are rejected. */
  embeddingModel: string;
  labels: string[];
  inputDim: number;
  hiddenDim: number;
  W1: number[][]; // [hidden][input]
  b1: number[];
  W2: number[][]; // [labels][hidden]
  b2: number[];
  trainedAt: string;
  metrics?: Record<string, number>;
};

export const softmax = (logits: number[]) => {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
};

export function topicHeadForward(weights: Pick<TopicHeadWeights, "W1" | "b1" | "W2" | "b2">, x: number[]) {
  const hidden = weights.W1.map((row, j) => {
    let sum = weights.b1[j] ?? 0;
    for (let i = 0; i < row.length; i += 1) sum += (row[i] ?? 0) * (x[i] ?? 0);
    return sum > 0 ? sum : 0;
  });
  const logits = weights.W2.map((row, k) => {
    let sum = weights.b2[k] ?? 0;
    for (let j = 0; j < row.length; j += 1) sum += (row[j] ?? 0) * (hidden[j] ?? 0);
    return sum;
  });
  return { hidden, logits, probs: softmax(logits) };
}

export function predictTopicWithHead(weights: TopicHeadWeights, embedding: number[]) {
  const { probs } = topicHeadForward(weights, embedding);
  let best = 0;
  for (let k = 1; k < probs.length; k += 1) if ((probs[k] ?? 0) > (probs[best] ?? 0)) best = k;
  return { topic: weights.labels[best] ?? weights.labels[0]!, confidence: probs[best] ?? 0, probs };
}
