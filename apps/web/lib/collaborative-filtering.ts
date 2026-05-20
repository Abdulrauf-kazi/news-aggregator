import type { StoryNode } from "./graph";
import {
  getFollowingIds,
  getMultipleUsersReadingHistory,
  getUserReadingHistory,
  type UserInteraction,
} from "./social-db";

// ── Types ────────────────────────────────────────────────────────────────────

export type SocialRecommendation = {
  storyId: string;
  score: number;
  reason: string;
  friendIds: string[];
  friendNames: string[];
};

export type FriendActivity = {
  userId: string;
  userName: string;
  storyId: string;
  storyTitle: string;
  topic: string;
  readAt: string;
};

// ── Core ALS-Style Collaborative Filtering ───────────────────────────────────

/**
 * Computes Jaccard similarity between two users based on their reading history.
 * This mirrors the user-user similarity that ALS factorizes into latent vectors.
 */
function computeUserSimilarity(
  userAStories: Set<string>,
  userBStories: Set<string>,
): number {
  if (userAStories.size === 0 || userBStories.size === 0) return 0;

  let intersection = 0;
  for (const storyId of userAStories) {
    if (userBStories.has(storyId)) {
      intersection += 1;
    }
  }

  const union = userAStories.size + userBStories.size - intersection;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Weighted co-occurrence scoring: the core CF recommendation algorithm.
 *
 * For each candidate article that friends have read (but the current user hasn't),
 * compute a score based on:
 * 1. How many friends read it (popularity in social circle)
 * 2. How similar each friend's taste is to the user (ALS-style user similarity)
 * 3. The interaction weight of the friend with that article (implicit rating)
 */
export async function buildFriendRecommendations(input: {
  userId: string;
  stories: StoryNode[];
  topK: number;
  friendNames?: Map<string, string>;
}): Promise<{
  recommendations: SocialRecommendation[];
  friendActivity: FriendActivity[];
}> {
  // 1. Get the user's friend list
  const friendIds = await getFollowingIds(input.userId);
  if (friendIds.length === 0) {
    return { recommendations: [], friendActivity: [] };
  }

  // 2. Get reading histories: current user + all friends
  const [userHistory, friendHistories] = await Promise.all([
    getUserReadingHistory(input.userId, 100),
    getMultipleUsersReadingHistory(friendIds, 50),
  ]);

  const userStorySet = new Set(userHistory.map((h) => h.storyId));
  const storyById = new Map(input.stories.map((s) => [s.id, s]));

  // 3. Compute user similarity with each friend (ALS user-factor analog)
  const friendSimilarities = new Map<string, number>();
  for (const [friendId, friendHistory] of friendHistories) {
    const friendStorySet = new Set(friendHistory.map((h) => h.storyId));
    const similarity = computeUserSimilarity(userStorySet, friendStorySet);
    friendSimilarities.set(friendId, similarity);
  }

  // 4. Score candidate articles (ALS item-score prediction analog)
  const candidateScores = new Map<
    string,
    { score: number; friendIds: string[]; friendNames: string[] }
  >();

  for (const [friendId, friendHistory] of friendHistories) {
    const friendSim = friendSimilarities.get(friendId) ?? 0;
    // Base weight for friends with no reading overlap yet
    const effectiveSimilarity = Math.max(0.1, friendSim);

    for (const interaction of friendHistory) {
      // Skip articles the user already read
      if (userStorySet.has(interaction.storyId)) continue;
      // Skip articles not in current graph
      if (!storyById.has(interaction.storyId)) continue;

      const existing = candidateScores.get(interaction.storyId) ?? {
        score: 0,
        friendIds: [],
        friendNames: [],
      };

      // ALS-style score: user_similarity * item_interaction_weight
      existing.score += effectiveSimilarity * interaction.weight;
      if (!existing.friendIds.includes(friendId)) {
        existing.friendIds.push(friendId);
        const friendName =
          input.friendNames?.get(friendId) ?? friendId.slice(0, 6);
        existing.friendNames.push(friendName);
      }

      candidateScores.set(interaction.storyId, existing);
    }
  }

  // 5. Rank and return top-K
  const sorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, input.topK);

  const recommendations: SocialRecommendation[] = sorted.map(
    ([storyId, data]) => {
      const friendCount = data.friendIds.length;
      const story = storyById.get(storyId);

      let reason: string;
      if (friendCount === 1) {
        reason = `Read by ${data.friendNames[0]}`;
      } else if (friendCount <= 3) {
        reason = `Read by ${data.friendNames.join(" & ")}`;
      } else {
        reason = `Read by ${data.friendNames[0]} and ${friendCount - 1} others in your network`;
      }

      if (story) {
        reason += ` · ${story.topic}`;
      }

      return {
        storyId,
        score: data.score,
        reason,
        friendIds: data.friendIds,
        friendNames: data.friendNames,
      };
    },
  );

  // 6. Build friend activity feed (recent reads by friends)
  const friendActivity: FriendActivity[] = [];
  for (const [friendId, friendHistory] of friendHistories) {
    const friendName =
      input.friendNames?.get(friendId) ?? friendId.slice(0, 6);
    for (const interaction of friendHistory.slice(0, 5)) {
      const story = storyById.get(interaction.storyId);
      if (story) {
        friendActivity.push({
          userId: friendId,
          userName: friendName,
          storyId: interaction.storyId,
          storyTitle: story.title,
          topic: story.topic,
          readAt: interaction.createdAt.toISOString(),
        });
      }
    }
  }

  // Sort activity by recency
  friendActivity.sort(
    (a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime(),
  );

  return {
    recommendations,
    friendActivity: friendActivity.slice(0, 20),
  };
}

/**
 * Compute social relevance scores for all stories in the graph.
 * Returns a normalized [0, 1] score per story based on friend reading signals.
 */
export async function getSocialRelevanceScores(input: {
  userId?: string;
  stories: StoryNode[];
}): Promise<Record<string, number>> {
  if (!input.userId) return {};

  const { recommendations } = await buildFriendRecommendations({
    userId: input.userId,
    stories: input.stories,
    topK: 50,
  });

  if (recommendations.length === 0) return {};

  // Normalize scores to [0, 1]
  const maxScore = Math.max(...recommendations.map((r) => r.score));
  if (maxScore <= 0) return {};

  const scores: Record<string, number> = {};
  for (const rec of recommendations) {
    scores[rec.storyId] = rec.score / maxScore;
  }
  return scores;
}
