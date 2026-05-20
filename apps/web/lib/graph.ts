import { SOURCE_DEFINITIONS, TOPICS } from "./sources";

export type StoryNode = {
  id: string;
  title: string;
  content?: string;
  topic: string;
  score: number;
  sourceIds: string[];
  timestamp: string;
  embedding?: number[];
  url?: string;
  publisherUrl?: string;
};

export type GraphNode = {
  id: string;
  label: string;
  type: "topic" | "source" | "story";
  topic?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
  relation: "topic-story" | "source-story" | "story-story";
};

export type StoryGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stories: StoryNode[];
};

export type StoryRecommendation = {
  storyId: string;
  similarity: number;
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const len = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < len; i += 1) {
    const l = left[i] as number;
    const r = right[i] as number;
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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const hasSharedSource = (left: StoryNode, right: StoryNode) =>
  left.sourceIds.some((sourceId) => right.sourceIds.includes(sourceId));

const calculateEdgeWeight = (input: {
  semanticSimilarity: number;
  sameTopic: boolean;
  sharedSource: boolean;
}) => {
  const semantic = clamp01(input.semanticSimilarity);
  const sameTopic = input.sameTopic ? 1 : 0;
  const sharedSource = input.sharedSource ? 1 : 0;

  return 0.7 * semantic + 0.2 * sameTopic + 0.1 * sharedSource;
};

export const createStoryGraphFromStories = (
  stories: StoryNode[],
): StoryGraph => {
  const storyNodes: GraphNode[] = stories.map((story) => ({
    id: story.id,
    label: story.title,
    type: "story",
    topic: story.topic,
  }));

  const relatedStoryEdges: GraphEdge[] = [];
  const maxLinksPerStory = 3;
  const minimumWeight = 0.2;
  for (let i = 0; i < stories.length; i += 1) {
    const left = stories[i] as StoryNode;
    const candidates: Array<{ story: StoryNode; weight: number }> = [];
    for (let j = i + 1; j < stories.length; j += 1) {
      const right = stories[j] as StoryNode;
      const semanticSimilarity =
        left.embedding && right.embedding
          ? cosineSimilarity(left.embedding, right.embedding)
          : 0;
      const sharesTopic = left.topic === right.topic;
      const sharedSource = hasSharedSource(left, right);

      const weight = calculateEdgeWeight({
        semanticSimilarity,
        sameTopic: sharesTopic,
        sharedSource,
      });

      if (weight < minimumWeight) {
        continue;
      }

      candidates.push({ story: right, weight });
    }

    candidates
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxLinksPerStory)
      .forEach(({ story, weight }) => {
        relatedStoryEdges.push({
          id: `edge:story:${left.id}:${story.id}`,
          from: left.id,
          to: story.id,
          weight,
          relation: "story-story",
        });
      });
  }

  return {
    nodes: storyNodes,
    edges: relatedStoryEdges,
    stories,
  };
};

export const createStoryGraphFromRecommendations = (input: {
  stories: StoryNode[];
  recommendations: Record<string, StoryRecommendation[]>;
}): StoryGraph => {
  const storyNodes: GraphNode[] = input.stories.map((story) => ({
    id: story.id,
    label: story.title,
    type: "story",
    topic: story.topic,
  }));

  const storyById = new Map(input.stories.map((story) => [story.id, story]));
  const edgeByPair = new Map<string, GraphEdge>();

  for (const story of input.stories) {
    const related = input.recommendations[story.id] ?? [];
    for (const candidate of related) {
      const from = story.id;
      const to = candidate.storyId;
      if (from === to) {
        continue;
      }

      const left = storyById.get(from);
      const right = storyById.get(to);
      if (!left || !right) {
        continue;
      }

      const weight = calculateEdgeWeight({
        semanticSimilarity: candidate.similarity,
        sameTopic: left.topic === right.topic,
        sharedSource: hasSharedSource(left, right),
      });

      const pairKey = [from, to].sort().join("::");
      const existing = edgeByPair.get(pairKey);
      if (existing && existing.weight >= weight) {
        continue;
      }

      edgeByPair.set(pairKey, {
        id: `edge:semantic:${from}:${to}`,
        from,
        to,
        weight,
        relation: "story-story",
      });
    }
  }

  const edges = Array.from(edgeByPair.values()).sort(
    (a, b) => b.weight - a.weight,
  );

  return {
    nodes: storyNodes,
    edges,
    stories: input.stories,
  };
};

const STORY_TEMPLATES = [
  "Volatility pulse in {topic} markets",
  "Policy shift drives {topic} narrative",
  "Signal spike detected for {topic}",
  "Cross-source consensus on {topic}",
  "Breaking update around {topic} infrastructure",
  "Institutional activity moves {topic}",
];

const pick = <T>(items: T[], index: number): T => {
  return items[Math.abs(index) % items.length] as T;
};

export const createStoryGraph = (seed: number = Date.now()): StoryGraph => {
  const stories: StoryNode[] = Array.from({ length: 18 }).map((_, i) => {
    const topic = pick([...TOPICS], i + seed);
    const chosenSourceIds = SOURCE_DEFINITIONS.filter(
      (_, idx) => (idx + i + seed) % 4 === 0,
    )
      .slice(0, 4)
      .map((source) => source.id);
    const title = pick(STORY_TEMPLATES, i + seed).replace("{topic}", topic);

    return {
      id: `story:${i + 1}`,
      title,
      topic,
      score: 50 + ((i * 7 + seed) % 50),
      sourceIds: chosenSourceIds,
      timestamp: new Date(Date.now() - i * 1000 * 60 * 12).toISOString(),
    };
  });

  const storyNodes: GraphNode[] = stories.map((story) => ({
    id: story.id,
    label: story.title,
    type: "story",
    topic: story.topic,
  }));

  const relatedStoryEdges: GraphEdge[] = [];
  const maxLinksPerStory = 3;
  const minimumWeight = 0.2;
  for (let i = 0; i < stories.length; i += 1) {
    const left = stories[i] as StoryNode;
    const candidates: Array<{ story: StoryNode; weight: number }> = [];
    for (let j = i + 1; j < stories.length; j += 1) {
      const right = stories[j] as StoryNode;
      const semanticSimilarity =
        left.embedding && right.embedding
          ? cosineSimilarity(left.embedding, right.embedding)
          : 0;
      const sharesTopic = left.topic === right.topic;
      const sharedSource = hasSharedSource(left, right);

      const weight = calculateEdgeWeight({
        semanticSimilarity,
        sameTopic: sharesTopic,
        sharedSource,
      });

      if (weight < minimumWeight) {
        continue;
      }

      candidates.push({
        story: right,
        weight,
      });
    }

    candidates
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxLinksPerStory)
      .forEach(({ story, weight }) => {
        relatedStoryEdges.push({
          id: `edge:story:${left.id}:${story.id}`,
          from: left.id,
          to: story.id,
          weight,
          relation: "story-story",
        });
      });
  }

  return {
    nodes: storyNodes,
    edges: relatedStoryEdges,
    stories,
  };
};
