import type { StoryGraph } from "./graph";
import { getPlannedS3Target } from "./s3";
import { buildLiveGraph } from "./source-adapters";
import { cacheJson, getCachedJson } from "./redis";
import { readSourceMetrics, readStoredStories } from "./story-db";
import { isSyntheticStory } from "./story-quality";
import { getDemoGeneration, noteDemoActivity } from "./demo-news";
import { ensureVectorStore, queryTopKSimilarStories } from "./vector-store";
import {
  getSessionRecentStories,
  getSessionRelevanceByStory,
} from "./session-personalization";
import {
  buildFriendRecommendations,
  getSocialRelevanceScores,
  type SocialRecommendation,
  type FriendActivity,
} from "./collaborative-filtering";

const GRAPH_CACHE_KEY = "news:graph:live";
const GRAPH_LOCK_KEY = "news:graph:ingestion-lock";
const GRAPH_CACHE_TTL_SECONDS = Number(
  process.env.GRAPH_CACHE_TTL_SECONDS ?? 600,
);
const TIME_DECAY_LAMBDA = Number(process.env.TIME_DECAY_LAMBDA ?? 0.08);
const EXPLORATION_INJECTION_RATE = Number(
  process.env.EXPLORATION_INJECTION_RATE ?? 0.4,
);
const LIVE_GRAPH_TIMEOUT_MS = Number(
  process.env.LIVE_GRAPH_TIMEOUT_MS ?? 15000,
);
const FORCE_REFRESH_TIMEOUT_MS = Number(
  process.env.FORCE_REFRESH_TIMEOUT_MS ?? 60000,
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
    socialRecommendations: SocialRecommendation[];
    friendActivity: FriendActivity[];
    retrieval: {
      vectorBackend: string;
      vectorCount: number;
      graphSeedCount: number;
      mode: "vector+graph" | "graph" | "vector+graph+social" | "graph+social";
    };
  };
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const calculateAgeHours = (timestamp: string) => {
  const publishedMs = Date.parse(timestamp);
  if (Number.isNaN(publishedMs)) {
    return Number.POSITIVE_INFINITY;
  }
  const ageMs = Math.max(0, Date.now() - publishedMs);
  return ageMs / (1000 * 60 * 60);
};

const shouldBypassStoredStories = (stories: StoryGraph["stories"]) => {
  if (stories.length === 0) {
    return true;
  }

  const newestStory = stories[0]!;
  const newestAgeHours = calculateAgeHours(newestStory.timestamp);
  const syntheticCount = stories.filter((story) => isSyntheticStory(story)).length;
  const syntheticRatio = syntheticCount / stories.length;

  return newestAgeHours > 12 || syntheticRatio > 0.2;
};

const filterSyntheticStories = (stories: StoryGraph["stories"]) =>
  stories.filter((story) => !isSyntheticStory(story));

// Time enters ranking exactly once, via recency. (Previously the trend score was
// also time-decayed, so freshness was double-counted.)
const calculateRecencyScore = (timestamp: string): number => {
  const ageHours = calculateAgeHours(timestamp);
  if (!Number.isFinite(ageHours)) {
    return 0;
  }
  return clamp01(Math.exp(-TIME_DECAY_LAMBDA * ageHours));
};

const calculateTrendScore = (score: number) => clamp01(score / 100);

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
  ]).slice(0, 10);

  if (diverseCandidates.length === 0) {
    return stories;
  }

  const injectionSpots = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39];
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
  userId?: string;
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

  // Social CF recommendations (only for authenticated users)
  let socialResult: {
    recommendations: SocialRecommendation[];
    friendActivity: FriendActivity[];
  } = { recommendations: [], friendActivity: [] };

  if (input.userId) {
    try {
      socialResult = await buildFriendRecommendations({
        userId: input.userId,
        stories: input.graph.stories,
        topK: input.topK,
      });
    } catch (err) {
      console.error("Social CF failed (non-blocking):", err);
    }
  }

  const mergedIds = [
    ...Array.from(vectorCandidates.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([storyId]) => storyId),
    ...graphRecommendations.recommendations,
    ...socialResult.recommendations.map((r) => r.storyId),
  ];

  const uniqueIds = Array.from(new Set(mergedIds))
    .filter((storyId) => !input.startStoryIds.includes(storyId))
    .slice(0, input.topK);

  const reasons = { ...graphRecommendations.reasons };
  for (const storyId of uniqueIds) {
    // Social reasons take priority over vector reasons
    const socialRec = socialResult.recommendations.find(
      (r) => r.storyId === storyId,
    );
    if (socialRec && !reasons[storyId]) {
      reasons[storyId] = socialRec.reason;
    } else if (!reasons[storyId] && vectorCandidates.has(storyId)) {
      reasons[storyId] = "Semantic match from vector search";
    }
  }

  const hasSocial = socialResult.recommendations.length > 0;
  const hasVector =
    input.startStoryIds.length > 0 && vectorStoreStats.vectorCount > 0;

  return {
    recommendations: uniqueIds,
    reasons,
    socialRecommendations: socialResult.recommendations,
    friendActivity: socialResult.friendActivity,
    retrieval: {
      vectorBackend: vectorStoreStats.backend,
      vectorCount: vectorStoreStats.vectorCount,
      graphSeedCount: input.startStoryIds.length,
      mode:
        hasSocial && hasVector
          ? ("vector+graph+social" as const)
          : hasVector
            ? ("vector+graph" as const)
            : hasSocial
              ? ("graph+social" as const)
              : ("graph" as const),
    },
  };
};

const rankGraphByScores = async (input: {
  graph: StoryGraph;
  sessionId?: string;
  userId?: string;
}): Promise<StoryGraph> => {
  const [sessionRelevance, socialRelevance] = await Promise.all([
    getSessionRelevanceByStory({
      sessionId: input.sessionId,
      userId: input.userId,
      stories: input.graph.stories,
    }),
    getSocialRelevanceScores({
      userId: input.userId,
      stories: input.graph.stories,
    }),
  ]);

  const hasSocialSignal = Object.keys(socialRelevance).length > 0;

  // 4-factor weighted ranking when social signal is available,
  // otherwise 3-factor ranking. Scores are computed once per story so the
  // comparator is consistent (Date.now() no longer moves mid-sort).
  const totalScore = new Map<string, number>();
  for (const story of input.graph.stories) {
    const trend = calculateTrendScore(story.score);
    const recency = calculateRecencyScore(story.timestamp);
    const session = sessionRelevance[story.id] ?? 0;
    const social = socialRelevance[story.id] ?? 0;
    totalScore.set(
      story.id,
      hasSocialSignal
        ? 0.4 * trend + 0.25 * recency + 0.15 * session + 0.2 * social
        : 0.5 * trend + 0.3 * recency + 0.2 * session,
    );
  }

  const rankedStories = input.graph.stories.slice().sort((a, b) => {
    const totalA = totalScore.get(a.id) ?? 0;
    const totalB = totalScore.get(b.id) ?? 0;
    if (totalA !== totalB) {
      return totalB - totalA;
    }
    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
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

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

async function triggerBackgroundIngestion() {
  const { getRedisClient, cacheJson } = await import("./redis");
  const redis = getRedisClient();
  if (!redis) return;

  // Try to acquire a lock for 2 minutes to prevent concurrent ingestions
  // Using a simple set with NX (not exists) and EX (expire)
  try {
    const locked = await redis.set(GRAPH_LOCK_KEY, "locked", "EX", 120, "NX");
    if (!locked) return;
  } catch (e) {
    // If Redis doesn't support NX/EX in one command or connection issue
    return;
  }

  try {
    const { buildLiveGraph } = await import("./source-adapters");
    const graph = await buildLiveGraph();
    await cacheJson(GRAPH_CACHE_KEY, graph, GRAPH_CACHE_TTL_SECONDS);
  } catch (error) {
    console.error("Background ingestion failed:", error);
  } finally {
    try {
      await redis.del(GRAPH_LOCK_KEY);
    } catch {
      // Ignore
    }
  }
}

export async function getGraphSnapshot(options?: {
  forceRefresh?: boolean;
  sessionId?: string;
  userId?: string;
}): Promise<GraphSnapshot> {
  noteDemoActivity();
  const recentSessionStories = await getSessionRecentStories(
    options?.sessionId,
  );

  const cached = options?.forceRefresh
    ? null
    : await getCachedJson<StoryGraph & { demoGeneration?: string }>(GRAPH_CACHE_KEY);
  // A cached graph built before the latest demo-news cycle still holds the
  // previous (deleted) generated stories, so it is treated as a cache miss.
  const cachedIsCurrent =
    !!cached && (cached.demoGeneration ?? "disabled") === (await getDemoGeneration());

  if (cached && cachedIsCurrent && cached.stories.length > 0 && !shouldBypassStoredStories(cached.stories)) {
    const [stories, metrics] = await Promise.all([
      readStoredStories(),
      readSourceMetrics(),
    ]);

    const rankedGraph = await rankGraphByScores({
      graph: cached,
      sessionId: options?.sessionId,
      userId: options?.userId,
    });
    const recommendationResult = await buildRetrievalRecommendations({
      graph: rankedGraph,
      startStoryIds: recentSessionStories,
      topK: 15,
      userId: options?.userId,
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
        socialRecommendations: recommendationResult.socialRecommendations,
        friendActivity: recommendationResult.friendActivity,
        retrieval: recommendationResult.retrieval,
      },
    };
  }

  // If no cache, return what we have in DB immediately and trigger background refresh
  const [dbStories, dbMetrics] = await Promise.all([
    readStoredStories(),
    readSourceMetrics(),
  ]);

  if (dbStories.length > 0) {
    const bypassStoredStories = shouldBypassStoredStories(dbStories);
    const preferredDbStories = bypassStoredStories
      ? filterSyntheticStories(dbStories)
      : dbStories;

    if (preferredDbStories.length > 0 && !options?.forceRefresh) {
      void triggerBackgroundIngestion();

      const { createStoryGraphFromStories } = await import("./graph");
      const baseGraph = createStoryGraphFromStories(preferredDbStories.slice(0, 200));
      
      const rankedGraph = await rankGraphByScores({
        graph: baseGraph,
        sessionId: options?.sessionId,
        userId: options?.userId,
      });
      const recommendationResult = await buildRetrievalRecommendations({
        graph: rankedGraph,
        startStoryIds: recentSessionStories,
        topK: 15,
        userId: options?.userId,
      });

      return {
        ...rankedGraph,
        meta: {
          cached: false,
          storage: bypassStoredStories ? "mongodb-sanitized" : "mongodb-fallback",
          plannedArchive: getPlannedS3Target(),
          totalStoriesInDb: dbStories.length,
          sourceMetricsCount: dbMetrics.length,
          recommendations: recommendationResult.recommendations,
          recommendationReasons: recommendationResult.reasons,
          socialRecommendations: recommendationResult.socialRecommendations,
          friendActivity: recommendationResult.friendActivity,
          retrieval: recommendationResult.retrieval,
        },
      };
    }
  }

  // Only block if we have absolutely nothing
  let graph: StoryGraph;
  try {
    graph = await withTimeout(
      buildLiveGraph(),
      options?.forceRefresh
        ? Math.max(LIVE_GRAPH_TIMEOUT_MS, FORCE_REFRESH_TIMEOUT_MS)
        : LIVE_GRAPH_TIMEOUT_MS,
      "buildLiveGraph",
    );
    await cacheJson(GRAPH_CACHE_KEY, graph, GRAPH_CACHE_TTL_SECONDS);
  } catch (error) {
    console.error("Failed to build live graph:", error);
    const { createStoryGraph } = await import("./graph");
    const fallback = createStoryGraph(42);
    return {
      ...fallback,
      meta: {
        cached: false,
        storage: "fallback",
        plannedArchive: null,
        totalStoriesInDb: fallback.stories.length,
        sourceMetricsCount: 0,
        recommendations: [],
        recommendationReasons: {},
        socialRecommendations: [],
        friendActivity: [],
        retrieval: {
          vectorBackend: "cosine",
          vectorCount: 0,
          graphSeedCount: 0,
          mode: "graph",
        },
      },
    };
  }
  const rankedGraph = await rankGraphByScores({
    graph,
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
  const recommendationResult = await buildRetrievalRecommendations({
    graph: rankedGraph,
    startStoryIds: recentSessionStories,
    topK: 15,
    userId: options?.userId,
  });

  return {
    ...rankedGraph,
    meta: {
      cached: false,
      storage: "live-blocking",
      plannedArchive: getPlannedS3Target(),
      totalStoriesInDb: dbStories.length,
      sourceMetricsCount: dbMetrics.length,
      recommendations: recommendationResult.recommendations,
      recommendationReasons: recommendationResult.reasons,
      socialRecommendations: recommendationResult.socialRecommendations,
      friendActivity: recommendationResult.friendActivity,
      retrieval: recommendationResult.retrieval,
    },
  };
}
