import type { StoryGraph } from "./graph";
import { getPlannedS3Target } from "./s3";
import { buildLiveGraph } from "./source-adapters";
import { cacheJson, getCachedJson } from "./redis";
import { readSourceMetrics, readStoredStories } from "./story-db";
import { ensureVectorStore, queryTopKSimilarStories } from "./vector-store";
import {
  getSessionRecentStories,
  getSessionRelevanceByStory,
} from "./session-personalization";

const GRAPH_CACHE_KEY = "news:graph:live";
const GRAPH_CACHE_TTL_SECONDS = Number(
  process.env.GRAPH_CACHE_TTL_SECONDS ?? 20,
);
const TIME_DECAY_LAMBDA = Number(process.env.TIME_DECAY_LAMBDA ?? 0.08);
const EXPLORATION_INJECTION_RATE = Number(
  process.env.EXPLORATION_INJECTION_RATE ?? 0.2,
);

export type GraphSnapshot = StoryGraph & {
  meta: {
    cached: boolean;
    storage: string;
    plannedArchive: ReturnType<typeof getPlannedS3Target>;
    totalStoriesInDb: number;
    sourceMetricsCount: number;
    recommendations: string[];
    recommendationReasons: Record<string, string>;
    retrieval: {
      vectorBackend: string;
      vectorCount: number;
      graphSeedCount: number;
      mode: "vector+graph" | "graph";
    };
  };
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const calculateRecencyScore = (timestamp: string): number => {
  const publishedMs = Date.parse(timestamp);
  if (Number.isNaN(publishedMs)) {
    return 0;
  }
  const ageMs = Math.max(0, Date.now() - publishedMs);
  const ageHours = ageMs / (1000 * 60 * 60);
  const halfLifeHours = 12;
  const score = Math.exp((-Math.log(2) * ageHours) / halfLifeHours);
  return clamp01(score);
};

const calculateAgeHours = (timestamp: string) => {
  const publishedMs = Date.parse(timestamp);
  if (Number.isNaN(publishedMs)) {
    return Number.POSITIVE_INFINITY;
  }
  const ageMs = Math.max(0, Date.now() - publishedMs);
  return ageMs / (1000 * 60 * 60);
};

const calculateDecayedTrendScore = (input: {
  score: number;
  timestamp: string;
}) => {
  const ageHours = calculateAgeHours(input.timestamp);
  if (!Number.isFinite(ageHours)) {
    return 0;
  }

  const decayedScore = input.score * Math.exp(-TIME_DECAY_LAMBDA * ageHours);
  return clamp01(decayedScore / 100);
};

const shuffle = <T>(items: T[]) => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const left = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = left;
  }
  return copy;
};

const clusterKey = (sourceIds: string[]) => {
  return sourceIds.slice().sort().slice(0, 3).join("|");
};

const applyExplorationInjection = (stories: StoryGraph["stories"]) => {
  if (stories.length < 8 || Math.random() >= EXPLORATION_INJECTION_RATE) {
    return stories;
  }

  const base = stories.slice();
  const anchorWindow = Math.min(12, base.length);
  const anchored = base.slice(0, anchorWindow);
  const tail = base.slice(anchorWindow);

  const topicExposure = new Map<string, number>();
  const seenClusters = new Set<string>();
  for (const story of anchored) {
    topicExposure.set(story.topic, (topicExposure.get(story.topic) ?? 0) + 1);
    seenClusters.add(clusterKey(story.sourceIds));
  }

  const topicCounts = Array.from(topicExposure.values()).sort((a, b) => a - b);
  const lowExposureThreshold =
    topicCounts[Math.floor(topicCounts.length / 2)] ?? 1;

  const lowExposureCandidates = tail.filter(
    (story) => (topicExposure.get(story.topic) ?? 0) <= lowExposureThreshold,
  );
  const newClusterCandidates = tail.filter(
    (story) => !seenClusters.has(clusterKey(story.sourceIds)),
  );

  const diverseCandidates = shuffle([
    ...new Map(
      [...newClusterCandidates, ...lowExposureCandidates].map((story) => [
        story.id,
        story,
      ]),
    ).values(),
  ]).slice(0, 3);

  if (diverseCandidates.length === 0) {
    return stories;
  }

  const injectionSpots = [3, 7, 11];
  const excluded = new Set(diverseCandidates.map((story) => story.id));
  const remaining = base.filter((story) => !excluded.has(story.id));

  for (let i = 0; i < diverseCandidates.length; i += 1) {
    const insertAt = Math.min(
      injectionSpots[i] ?? remaining.length,
      remaining.length,
    );
    remaining.splice(
      insertAt,
      0,
      diverseCandidates[i] as (typeof remaining)[number],
    );
  }

  return remaining;
};

const buildAdjacency = (graph: StoryGraph) => {
  const adjacency = new Map<string, Array<{ to: string; weight: number }>>();
  for (const edge of graph.edges) {
    if (edge.relation !== "story-story") {
      continue;
    }
    const left = adjacency.get(edge.from) ?? [];
    left.push({ to: edge.to, weight: edge.weight });
    adjacency.set(edge.from, left);

    const right = adjacency.get(edge.to) ?? [];
    right.push({ to: edge.from, weight: edge.weight });
    adjacency.set(edge.to, right);
  }
  return adjacency;
};

const buildGraphRecommendations = (input: {
  graph: StoryGraph;
  startStoryIds: string[];
  topK: number;
}) => {
  if (input.startStoryIds.length === 0) {
    return {
      recommendations: [] as string[],
      reasons: {} as Record<string, string>,
    };
  }

  const adjacency = buildAdjacency(input.graph);
  const startSet = new Set(input.startStoryIds);
  const scoreByStory = new Map<string, number>();
  const bestAnchorByStory = new Map<
    string,
    { anchorId: string; via: "depth1" | "depth2"; score: number }
  >();

  for (const startId of input.startStoryIds) {
    const neighborsDepth1 = adjacency.get(startId) ?? [];

    for (const depth1 of neighborsDepth1) {
      if (!startSet.has(depth1.to)) {
        const depth1Score = depth1.weight;
        scoreByStory.set(
          depth1.to,
          (scoreByStory.get(depth1.to) ?? 0) + depth1Score,
        );
        const existing = bestAnchorByStory.get(depth1.to);
        if (!existing || depth1Score > existing.score) {
          bestAnchorByStory.set(depth1.to, {
            anchorId: startId,
            via: "depth1",
            score: depth1Score,
          });
        }
      }

      const neighborsDepth2 = adjacency.get(depth1.to) ?? [];
      for (const depth2 of neighborsDepth2) {
        if (depth2.to === startId || startSet.has(depth2.to)) {
          continue;
        }
        const chainedWeight = depth1.weight * 0.6 + depth2.weight * 0.4;
        const depth2Score = chainedWeight * 0.75;
        scoreByStory.set(
          depth2.to,
          (scoreByStory.get(depth2.to) ?? 0) + depth2Score,
        );
        const existing = bestAnchorByStory.get(depth2.to);
        if (!existing || depth2Score > existing.score) {
          bestAnchorByStory.set(depth2.to, {
            anchorId: startId,
            via: "depth2",
            score: depth2Score,
          });
        }
      }
    }
  }

  const sorted = Array.from(scoreByStory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, input.topK);

  const storyById = new Map(
    input.graph.stories.map((story) => [story.id, story]),
  );
  const reasons: Record<string, string> = {};

  for (const [storyId] of sorted) {
    const story = storyById.get(storyId);
    const anchor = bestAnchorByStory.get(storyId);
    const anchorStory = anchor ? storyById.get(anchor.anchorId) : null;

    if (story && anchorStory) {
      const topicReason = `Trending in ${story.topic}${
        story.topic !== anchorStory.topic ? ` + ${anchorStory.topic}` : ""
      }`;
      const relationReason =
        (anchor?.via ?? "depth1") === "depth1"
          ? "Similar to story you viewed"
          : "Connected through related story cluster";
      reasons[storyId] = `${topicReason}; ${relationReason}`;
      continue;
    }

    if (story) {
      reasons[storyId] = `Trending in ${story.topic}`;
    }
  }

  return {
    recommendations: sorted.map(([storyId]) => storyId),
    reasons,
  };
};

const buildRetrievalRecommendations = async (input: {
  graph: StoryGraph;
  startStoryIds: string[];
  topK: number;
}) => {
  const vectorStoreStats = await ensureVectorStore(input.graph.stories);

  const vectorCandidates = new Map<string, number>();
  for (const startId of input.startStoryIds) {
    const similar = await queryTopKSimilarStories({
      storyId: startId,
      topK: input.topK,
    });
    for (const item of similar) {
      vectorCandidates.set(
        item.storyId,
        Math.max(vectorCandidates.get(item.storyId) ?? 0, item.similarity),
      );
    }
  }

  const graphRecommendations = buildGraphRecommendations({
    graph: input.graph,
    startStoryIds: input.startStoryIds,
    topK: input.topK,
  });

  const mergedIds = [
    ...Array.from(vectorCandidates.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([storyId]) => storyId),
    ...graphRecommendations.recommendations,
  ];

  const uniqueIds = Array.from(new Set(mergedIds))
    .filter((storyId) => !input.startStoryIds.includes(storyId))
    .slice(0, input.topK);

  const reasons = { ...graphRecommendations.reasons };
  for (const storyId of uniqueIds) {
    if (!reasons[storyId] && vectorCandidates.has(storyId)) {
      reasons[storyId] = "Semantic match from vector search";
    }
  }

  return {
    recommendations: uniqueIds,
    reasons,
    retrieval: {
      vectorBackend: vectorStoreStats.backend,
      vectorCount: vectorStoreStats.vectorCount,
      graphSeedCount: input.startStoryIds.length,
      mode:
        input.startStoryIds.length > 0 && vectorStoreStats.vectorCount > 0
          ? ("vector+graph" as const)
          : ("graph" as const),
    },
  };
};

const rankGraphByScores = async (input: {
  graph: StoryGraph;
  sessionId?: string;
}): Promise<StoryGraph> => {
  const sessionRelevance = await getSessionRelevanceByStory({
    sessionId: input.sessionId,
    stories: input.graph.stories,
  });

  const rankedStories = input.graph.stories.slice().sort((a, b) => {
    const trendA = calculateDecayedTrendScore({
      score: a.score,
      timestamp: a.timestamp,
    });
    const trendB = calculateDecayedTrendScore({
      score: b.score,
      timestamp: b.timestamp,
    });
    const recencyA = calculateRecencyScore(a.timestamp);
    const recencyB = calculateRecencyScore(b.timestamp);
    const sessionA = sessionRelevance[a.id] ?? 0;
    const sessionB = sessionRelevance[b.id] ?? 0;

    const totalA = 0.5 * trendA + 0.3 * recencyA + 0.2 * sessionA;
    const totalB = 0.5 * trendB + 0.3 * recencyB + 0.2 * sessionB;

    if (totalA !== totalB) {
      return totalB - totalA;
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const explorationRankedStories = applyExplorationInjection(rankedStories);

  const storyOrder = new Map(
    explorationRankedStories.map((story, index) => [story.id, index]),
  );
  const rankedNodes = input.graph.nodes.slice().sort((a, b) => {
    const aIndex = storyOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = storyOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });

  const rankedEdges = input.graph.edges.slice().sort((a, b) => {
    const aFrom = storyOrder.get(a.from) ?? Number.MAX_SAFE_INTEGER;
    const bFrom = storyOrder.get(b.from) ?? Number.MAX_SAFE_INTEGER;
    if (aFrom !== bFrom) {
      return aFrom - bFrom;
    }
    const aTo = storyOrder.get(a.to) ?? Number.MAX_SAFE_INTEGER;
    const bTo = storyOrder.get(b.to) ?? Number.MAX_SAFE_INTEGER;
    return aTo - bTo;
  });

  return {
    ...input.graph,
    stories: explorationRankedStories,
    nodes: rankedNodes,
    edges: rankedEdges,
  };
};

export async function getGraphSnapshot(options?: {
  forceRefresh?: boolean;
  sessionId?: string;
}): Promise<GraphSnapshot> {
  const recentSessionStories = await getSessionRecentStories(
    options?.sessionId,
  );

  const cached = options?.forceRefresh
    ? null
    : await getCachedJson<StoryGraph>(GRAPH_CACHE_KEY);
  if (cached && cached.stories.length > 0) {
    const [stories, metrics] = await Promise.all([
      readStoredStories(),
      readSourceMetrics(),
    ]);

    const rankedGraph = await rankGraphByScores({
      graph: cached,
      sessionId: options?.sessionId,
    });
    const recommendationResult = await buildRetrievalRecommendations({
      graph: rankedGraph,
      startStoryIds: recentSessionStories,
      topK: 10,
    });

    return {
      ...rankedGraph,
      meta: {
        cached: true,
        storage: "redis",
        plannedArchive: getPlannedS3Target(),
        totalStoriesInDb: stories.length,
        sourceMetricsCount: metrics.length,
        recommendations: recommendationResult.recommendations,
        recommendationReasons: recommendationResult.reasons,
        retrieval: recommendationResult.retrieval,
      },
    };
  }

  const graph = await buildLiveGraph();
  await cacheJson(GRAPH_CACHE_KEY, graph, GRAPH_CACHE_TTL_SECONDS);
  const [stories, metrics] = await Promise.all([
    readStoredStories(),
    readSourceMetrics(),
  ]);
  const rankedGraph = await rankGraphByScores({
    graph,
    sessionId: options?.sessionId,
  });
  const recommendationResult = await buildRetrievalRecommendations({
    graph: rankedGraph,
    startStoryIds: recentSessionStories,
    topK: 10,
  });

  return {
    ...rankedGraph,
    meta: {
      cached: false,
      storage: "redis",
      plannedArchive: getPlannedS3Target(),
      totalStoriesInDb: stories.length,
      sourceMetricsCount: metrics.length,
      recommendations: recommendationResult.recommendations,
      recommendationReasons: recommendationResult.reasons,
      retrieval: recommendationResult.retrieval,
    },
  };
}
