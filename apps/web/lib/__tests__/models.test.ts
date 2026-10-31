// Fast, offline unit tests for the model components (bun test).
import { describe, expect, test } from "bun:test";
import { classifyTopic } from "../topic-classifier";
import { isNearDuplicate, numbersConflict } from "../dedupe";
import { keywordScores, rankSearchResults } from "../search-ranking";
import { predictTopicWithHead, softmax, topicHeadForward } from "../topic-head";
import { baseSignalScore, isSyntheticStory } from "../story-quality";
import { lexicalEmbedding } from "../embeddings";
import topicHead from "../models/topic-head.json";
import type { StoryNode } from "../graph";

const story = (id: string, title: string, extra: Partial<StoryNode> = {}): StoryNode => ({
  id, title, topic: "Macro", score: 50, sourceIds: ["test"], timestamp: new Date().toISOString(), ...extra,
});

describe("keyword topic classifier", () => {
  test("matches whole words only (legacy bug: 'ai' in 'said', 'fed' in 'federal')", () => {
    expect(classifyTopic({ title: "Minister said talks continue again", sourceId: "guardian" }).topic).toBe("Geopolitics");
    expect(classifyTopic({ title: "Federal court blocks rule", sourceId: "cnn" }).strength).toBe(0);
    expect(classifyTopic({ title: "Fed holds interest rates as inflation cools" }).topic).toBe("Macro");
  });
  test("falls back to source metadata instead of title length", () => {
    expect(classifyTopic({ title: "M 4.5 - 10 km S of Ridgecrest", sourceId: "usgs" })).toEqual({ topic: "Climate", strength: 0 });
    expect(classifyTopic({ title: "Show HN: a tiny editor", sourceId: "hacker-news" }).topic).toBe("AI");
  });
});

describe("dedupe guards", () => {
  test("numeric conflict vetoes template-identical events", () => {
    expect(numbersConflict("M 4.5 - 10 km S of Ridgecrest", "M 2.1 - 42 km N of Ridgecrest")).toBe(true);
    expect(numbersConflict("US adds 254,000 jobs", "September payrolls jump by 254000")).toBe(false);
    expect(numbersConflict("Fed holds rates", "Rates unchanged at 5.25%")).toBe(false);
  });
  test("threshold + veto", () => {
    expect(isNearDuplicate({ similarity: 0.94, leftTitle: "M 4.5 quake", rightTitle: "M 2.1 quake" })).toBe(false);
    expect(isNearDuplicate({ similarity: 0.7, leftTitle: "Fed holds rates", rightTitle: "Fed keeps rates" })).toBe(true);
    expect(isNearDuplicate({ similarity: 0.5, leftTitle: "a", rightTitle: "b" })).toBe(false);
  });
});

describe("lexical fallback embedding", () => {
  test("unit norm, keeps decimals distinct", () => {
    const a = lexicalEmbedding("M 4.5 - 10 km S of Ridgecrest");
    const b = lexicalEmbedding("M 2.1 - 42 km N of Ridgecrest");
    expect(Math.abs(Math.hypot(...a) - 1)).toBeLessThan(1e-9);
    const cos = a.reduce((s, v, i) => s + v * b[i]!, 0);
    expect(cos).toBeLessThan(0.75);
  });
});

describe("hybrid search ranking", () => {
  const stories = [
    story("1", "Brent crude tops $90", { embedding: [1, 0], embeddingModel: "m" }),
    story("2", "Oil prices fall", { embedding: [0.8, 0.6], embeddingModel: "m" }),
    story("3", "Unrelated sports result", { embedding: [0, 1], embeddingModel: "m" }),
    story("4", "Crude stocks", { embedding: [1, 0], embeddingModel: "other-space" }),
  ];
  test("keyword scores are bounded to [0,1]", () => {
    for (const v of keywordScores(stories, "oil prices").values()) expect(v).toBeLessThanOrEqual(1);
  });
  test("semantic cutoff drops noise and never compares across embedding spaces", () => {
    const hits = rankSearchResults({ stories, query: "petroleum", queryEmbedding: { embedding: [1, 0], model: "m" } });
    const ids = hits.map((h) => h.story.id);
    expect(ids).toContain("1");
    expect(ids).not.toContain("3");
    expect(ids).not.toContain("4");
  });
});

describe("trained topic head", () => {
  test("weights are well-formed and inference returns a distribution", () => {
    const w = topicHead as unknown as Parameters<typeof predictTopicWithHead>[0];
    expect(w.labels).toHaveLength(8);
    expect(w.W1).toHaveLength(w.hiddenDim);
    expect(w.W1[0]).toHaveLength(w.inputDim);
    const x = new Array(w.inputDim).fill(0).map((_, i) => Math.sin(i));
    const { probs } = topicHeadForward(w, x);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(w.labels).toContain(predictTopicWithHead(w, x).topic);
  });
  test("softmax is numerically stable", () => {
    expect(softmax([1000, 1000]).map((v) => v.toFixed(2))).toEqual(["0.50", "0.50"]);
  });
});

describe("story quality", () => {
  test("base signal score is bounded and rewards evidence", () => {
    expect(baseSignalScore(0)).toBe(50);
    expect(baseSignalScore(10, "x".repeat(100))).toBe(82);
  });
  test("placeholder stories are detected", () => {
    expect(isSyntheticStory(story("story:cnn:fallback-0", "Update: something"))).toBe(true);
    expect(isSyntheticStory(story("story:cnn:abc", "Real headline", { url: "https://cnn.com/2026/a" }))).toBe(false);
  });
});
