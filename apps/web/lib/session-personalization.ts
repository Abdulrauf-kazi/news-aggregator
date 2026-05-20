import type { StoryNode } from "./graph";
import { getJsonValue, setJsonValue } from "./redis";

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 45 * 60);

type SessionTopicWeights = Record<string, number>;
type SessionStoryWeights = Record<string, number>;
type SessionTimestamps = {
  lastSeenAt: string;
  lastEventAt: string;
  recentStories?: string[];
};

export type SessionEventType = "click" | "dwell";

const topicsKey = (sessionId: string) => `session:${sessionId}:topics`;
const storiesKey = (sessionId: string) => `session:${sessionId}:stories`;
const timestampsKey = (sessionId: string) => `session:${sessionId}:timestamps`;

const clampSessionId = (sessionId: string) => sessionId.trim().slice(0, 80);

const scoreIncrement = (eventType: SessionEventType, dwellMs?: number) => {
  if (eventType === "click") {
    return 1;
  }
  const dwellSeconds = Math.min(
    120,
    Math.max(1, Math.floor((dwellMs ?? 0) / 1000)),
  );
  return Math.max(1, Math.round(dwellSeconds / 4));
};

export async function recordSessionInteraction(input: {
  sessionId: string;
  storyId: string;
  topic?: string;
  eventType: SessionEventType;
  dwellMs?: number;
  userId?: string;
}) {
  const sessionId = clampSessionId(input.sessionId);
  if (!sessionId || !input.storyId) {
    return;
  }

  const [topicWeights, storyWeights, timestamps] = await Promise.all([
    getJsonValue<SessionTopicWeights>(topicsKey(sessionId)),
    getJsonValue<SessionStoryWeights>(storiesKey(sessionId)),
    getJsonValue<SessionTimestamps>(timestampsKey(sessionId)),
  ]);

  const topicMap: SessionTopicWeights = topicWeights ?? {};
  const storyMap: SessionStoryWeights = storyWeights ?? {};
  const delta = scoreIncrement(input.eventType, input.dwellMs);
  const recentStories = [
    input.storyId,
    ...(timestamps?.recentStories ?? []).filter((id) => id !== input.storyId),
  ].slice(0, 24);

  storyMap[input.storyId] = (storyMap[input.storyId] ?? 0) + delta;
  if (input.topic) {
    topicMap[input.topic] = (topicMap[input.topic] ?? 0) + delta;
  }

  const now = new Date().toISOString();
  await Promise.all([
    setJsonValue(topicsKey(sessionId), topicMap, SESSION_TTL_SECONDS),
    setJsonValue(storiesKey(sessionId), storyMap, SESSION_TTL_SECONDS),
    setJsonValue(
      timestampsKey(sessionId),
      {
        lastSeenAt: now,
        lastEventAt: now,
        recentStories,
      } satisfies SessionTimestamps,
      SESSION_TTL_SECONDS,
    ),
  ]);

  // Bridge to user-level CF: if authenticated, also record in user interactions
  if (input.userId) {
    try {
      const { recordUserStoryInteraction } = await import("./social-db");
      await recordUserStoryInteraction({
        userId: input.userId,
        storyId: input.storyId,
        weight: delta,
        topic: input.topic,
      });
    } catch {
      // Non-blocking: CF recording failure shouldn't break session tracking
    }
  }
}

export async function getSessionRecentStories(sessionIdRaw?: string) {
  const sessionIdTrimmed = sessionIdRaw?.trim();
  if (!sessionIdTrimmed) {
    return [] as string[];
  }
  const sessionId = clampSessionId(sessionIdTrimmed);
  if (!sessionId) {
    return [] as string[];
  }

  const timestamps = await getJsonValue<SessionTimestamps>(
    timestampsKey(sessionId),
  );
  return timestamps?.recentStories ?? [];
}

export async function personalizeStoriesForSession(input: {
  sessionId?: string;
  stories: StoryNode[];
}): Promise<StoryNode[]> {
  const relevance = await getSessionRelevanceByStory({
    sessionId: input.sessionId,
    stories: input.stories,
  });

  if (Object.keys(relevance).length === 0) {
    return input.stories;
  }

  return input.stories.slice().sort((a, b) => {
    const aBoost = relevance[a.id] ?? 0;
    const bBoost = relevance[b.id] ?? 0;
    if (aBoost !== bBoost) {
      return bBoost - aBoost;
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

export async function getSessionRelevanceByStory(input: {
  sessionId?: string;
  userId?: string;
  stories: StoryNode[];
}): Promise<Record<string, number>> {
  const sessionIdRaw = input.sessionId?.trim();
  const userId = input.userId;
  
  const [topicWeights, storyWeights, userTopicInterests] = await Promise.all([
    sessionIdRaw ? getJsonValue<SessionTopicWeights>(topicsKey(clampSessionId(sessionIdRaw))) : Promise.resolve(null),
    sessionIdRaw ? getJsonValue<SessionStoryWeights>(storiesKey(clampSessionId(sessionIdRaw))) : Promise.resolve(null),
    userId ? import("./social-db").then(m => m.getUserTopicInterests(userId)) : Promise.resolve(null),
  ]);

  if (!topicWeights && !storyWeights && !userTopicInterests) {
    return {};
  }

  const topicMap = topicWeights ?? {};
  const storyMap = storyWeights ?? {};
  const userTopicMap = userTopicInterests ?? {};

  const rawScores: Record<string, number> = {};
  let maxScore = 0;
  for (const story of input.stories) {
    const value = (topicMap[story.topic] ?? 0) + (storyMap[story.id] ?? 0) + (userTopicMap[story.topic] ?? 0);
    rawScores[story.id] = value;
    if (value > maxScore) {
      maxScore = value;
    }
  }

  if (maxScore <= 0) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const story of input.stories) {
    normalized[story.id] = (rawScores[story.id] ?? 0) / maxScore;
  }
  return normalized;
}
