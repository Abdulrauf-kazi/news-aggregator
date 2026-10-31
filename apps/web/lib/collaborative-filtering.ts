import type { StoryNode } from "./graph";
import {
  LIKE_INTERACTION_WEIGHT,
  getFollowingIds,
  getMultipleUsersReadingHistory,
  getUserReadingHistory,
  getFriendsLikedStoryIdsByFriendIds,
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
  type?: "read" | "liked";
};

// ── Core ALS-Style Collaborative Filtering ───────────────────────────────────

const dampWeight = (weight: number) => Math.log1p(Math.max(0, weight));

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

  // 2. Get reading histories + liked story IDs for all friends in parallel
  const [userHistory, friendHistories, friendLikeMap] = await Promise.all([
    getUserReadingHistory(input.userId, 100),
    getMultipleUsersReadingHistory(friendIds, 50),
    getFriendsLikedStoryIdsByFriendIds(friendIds),
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

  // 4. Score candidate articles — likes get a 1.5× multiplier on top of their weight=10
  const candidateScores = new Map<
    string,
    {
      score: number;
      friendIds: string[];
      friendNames: string[];
      likedByFriendIds: string[];
      likedByFriendNames: string[];
    }
  >();

  for (const [friendId, friendHistory] of friendHistories) {
    const friendSim = friendSimilarities.get(friendId) ?? 0;
    const effectiveSimilarity = Math.max(0.1, friendSim);
    const friendLikes = friendLikeMap.get(friendId) ?? new Set<string>();
    const friendName = input.friendNames?.get(friendId) ?? friendId.slice(0, 6);

    for (const interaction of friendHistory) {
      if (userStorySet.has(interaction.storyId)) continue;
      if (!storyById.has(interaction.storyId)) continue;

      const isLiked = friendLikes.has(interaction.storyId);
      const likeBoost = isLiked ? 1.5 : 1.0;

      const existing = candidateScores.get(interaction.storyId) ?? {
        score: 0,
        friendIds: [],
        friendNames: [],
        likedByFriendIds: [],
        likedByFriendNames: [],
      };

      // log-damped implicit rating: weights grow without bound via $inc
      existing.score += effectiveSimilarity * dampWeight(interaction.weight) * likeBoost;

      if (!existing.friendIds.includes(friendId)) {
        existing.friendIds.push(friendId);
        existing.friendNames.push(friendName);
      }
      if (isLiked && !existing.likedByFriendIds.includes(friendId)) {
        existing.likedByFriendIds.push(friendId);
        existing.likedByFriendNames.push(friendName);
      }

      candidateScores.set(interaction.storyId, existing);
    }
  }

  // Also surface stories that friends liked but haven't yet generated
  // a user_interaction record (race between toggleLike and CF)
  for (const [friendId, likedIds] of friendLikeMap) {
    const friendSim = friendSimilarities.get(friendId) ?? 0;
    const effectiveSimilarity = Math.max(0.1, friendSim);
    const friendName = input.friendNames?.get(friendId) ?? friendId.slice(0, 6);

    for (const storyId of likedIds) {
      if (userStorySet.has(storyId)) continue;
      if (!storyById.has(storyId)) continue;
      if (candidateScores.has(storyId)) continue; // already scored via interactions

      candidateScores.set(storyId, {
        score: effectiveSimilarity * dampWeight(LIKE_INTERACTION_WEIGHT) * 1.5,
        friendIds: [friendId],
        friendNames: [friendName],
        likedByFriendIds: [friendId],
        likedByFriendNames: [friendName],
      });
    }
  }

  // 5. Rank and return top-K
  const sorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, input.topK);

  const recommendations: SocialRecommendation[] = sorted.map(
    ([storyId, data]) => {
      const story = storyById.get(storyId);
      const likedBy = data.likedByFriendNames;
      const readBy = data.friendNames;

      let reason: string;
      if (likedBy.length > 0) {
        if (likedBy.length === 1) {
          reason = `Liked by ${likedBy[0]}`;
        } else if (likedBy.length <= 3) {
          reason = `Liked by ${likedBy.join(" & ")}`;
        } else {
          reason = `Liked by ${likedBy[0]} and ${likedBy.length - 1} others`;
        }
      } else {
        const friendCount = readBy.length;
        if (friendCount === 1) {
          reason = `Read by ${readBy[0]}`;
        } else if (friendCount <= 3) {
          reason = `Read by ${readBy.join(" & ")}`;
        } else {
          reason = `Read by ${readBy[0]} and ${friendCount - 1} others in your network`;
        }
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

  // 6. Build friend activity feed — merge reads and likes, most recent first
  const activityMap = new Map<string, FriendActivity>(); // key: friendId+storyId

  for (const [friendId, friendHistory] of friendHistories) {
    const friendName = input.friendNames?.get(friendId) ?? friendId.slice(0, 6);
    for (const interaction of friendHistory.slice(0, 5)) {
      const story = storyById.get(interaction.storyId);
      if (!story) continue;
      const key = `${friendId}:${interaction.storyId}`;
      activityMap.set(key, {
        userId: friendId,
        userName: friendName,
        storyId: interaction.storyId,
        storyTitle: story.title,
        topic: story.topic,
        readAt: interaction.createdAt.toISOString(),
        type: "read",
      });
    }
  }

  // Overlay liked entries — they take priority over plain "read" entries
  for (const [friendId, likedIds] of friendLikeMap) {
    const friendName = input.friendNames?.get(friendId) ?? friendId.slice(0, 6);
    for (const storyId of likedIds) {
      const story = storyById.get(storyId);
      if (!story) continue;
      const key = `${friendId}:${storyId}`;
      const existing = activityMap.get(key);
      activityMap.set(key, {
        userId: friendId,
        userName: friendName,
        storyId,
        storyTitle: story.title,
        topic: story.topic,
        readAt: existing?.readAt ?? new Date().toISOString(),
        type: "liked",
      });
    }
  }

  const friendActivity = Array.from(activityMap.values())
    .sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())
    .slice(0, 20);

  return {
    recommendations,
    friendActivity,
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
