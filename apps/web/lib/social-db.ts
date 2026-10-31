import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

// ── Types ────────────────────────────────────────────────────────────────────

export type FollowRelation = {
  followerId: string;
  followeeId: string;
  createdAt: Date;
};

export type UserInteraction = {
  userId: string;
  storyId: string;
  weight: number;
  topic?: string;
  createdAt: Date;
};

export type Like = {
  userId: string;
  storyId: string;
  topic: string;
  createdAt: Date;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  isFollowing?: boolean;
};

// ── Follow / Unfollow ────────────────────────────────────────────────────────

export async function followUser(
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  if (followerId === followeeId) return false;

  const db = await getDb();
  const collection = db.collection<FollowRelation>("follows");

  // Create unique index on first call (idempotent)
  await collection.createIndex(
    { followerId: 1, followeeId: 1 },
    { unique: true },
  );

  try {
    await collection.insertOne({
      followerId,
      followeeId,
      createdAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    // Duplicate key = already following
    const mongoErr = err as { code?: number };
    if (mongoErr.code === 11000) return false;
    throw err;
  }
}

export async function unfollowUser(
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<FollowRelation>("follows")
    .deleteOne({ followerId, followeeId });
  return (result.deletedCount ?? 0) > 0;
}

export async function isFollowing(
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  const db = await getDb();
  const doc = await db
    .collection<FollowRelation>("follows")
    .findOne({ followerId, followeeId });
  return doc !== null;
}

// ── Following / Followers Lists ──────────────────────────────────────────────

export async function getFollowing(userId: string): Promise<UserSummary[]> {
  const db = await getDb();
  const relations = await db
    .collection<FollowRelation>("follows")
    .find({ followerId: userId })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  if (relations.length === 0) return [];

  const followeeIds = relations.map((r) => {
    try {
      return new ObjectId(r.followeeId);
    } catch {
      return null;
    }
  }).filter(Boolean) as ObjectId[];

  const users = await db
    .collection("users")
    .find({ _id: { $in: followeeIds } })
    .project({ name: 1, email: 1, image: 1 })
    .toArray();

  return users.map((u) => ({
    id: u._id.toString(),
    name: (u.name as string) || "",
    email: (u.email as string) || "",
    image: (u.image as string | null) || null,
    isFollowing: true,
  }));
}

export async function getFollowers(userId: string): Promise<UserSummary[]> {
  const db = await getDb();
  const relations = await db
    .collection<FollowRelation>("follows")
    .find({ followeeId: userId })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  if (relations.length === 0) return [];

  const followerIds = relations.map((r) => {
    try {
      return new ObjectId(r.followerId);
    } catch {
      return null;
    }
  }).filter(Boolean) as ObjectId[];

  const users = await db
    .collection("users")
    .find({ _id: { $in: followerIds } })
    .project({ name: 1, email: 1, image: 1 })
    .toArray();

  // Check which of these followers the current user also follows back
  const followingBack = await db
    .collection<FollowRelation>("follows")
    .find({
      followerId: userId,
      followeeId: { $in: relations.map((r) => r.followerId) },
    })
    .toArray();
  const followingBackIds = new Set(followingBack.map((r) => r.followeeId));

  return users.map((u) => ({
    id: u._id.toString(),
    name: (u.name as string) || "",
    email: (u.email as string) || "",
    image: (u.image as string | null) || null,
    isFollowing: followingBackIds.has(u._id.toString()),
  }));
}

export async function getFollowCounts(
  userId: string,
): Promise<{ following: number; followers: number }> {
  const db = await getDb();
  const [following, followers] = await Promise.all([
    db.collection<FollowRelation>("follows").countDocuments({ followerId: userId }),
    db.collection<FollowRelation>("follows").countDocuments({ followeeId: userId }),
  ]);
  return { following, followers };
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const relations = await db
    .collection<FollowRelation>("follows")
    .find({ followerId: userId })
    .project({ followeeId: 1 })
    .limit(500)
    .toArray();
  return relations.map((r) => (r as unknown as FollowRelation).followeeId);
}

// ── User Search ──────────────────────────────────────────────────────────────

export async function searchUsers(
  query: string,
  currentUserId?: string,
  limit = 20,
): Promise<UserSummary[]> {
  const db = await getDb();
  const sanitized = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  if (!sanitized) return [];

  const users = await db
    .collection("users")
    .find({
      $or: [
        { name: { $regex: sanitized, $options: "i" } },
        { email: { $regex: sanitized, $options: "i" } },
      ],
    })
    .project({ name: 1, email: 1, image: 1 })
    .limit(limit)
    .toArray();

  // Filter out self
  const filtered = users.filter((u) => u._id.toString() !== currentUserId);

  // Check follow status for each result
  let followingSet = new Set<string>();
  if (currentUserId && filtered.length > 0) {
    const relations = await db
      .collection<FollowRelation>("follows")
      .find({
        followerId: currentUserId,
        followeeId: { $in: filtered.map((u) => u._id.toString()) },
      })
      .toArray();
    followingSet = new Set(relations.map((r) => r.followeeId));
  }

  return filtered.map((u) => ({
    id: u._id.toString(),
    name: (u.name as string) || "",
    email: (u.email as string) || "",
    image: (u.image as string | null) || null,
    isFollowing: followingSet.has(u._id.toString()),
  }));
}

// ── User Reading History (for CF) ────────────────────────────────────────────

export async function recordUserStoryInteraction(input: {
  userId: string;
  storyId: string;
  weight: number;
  topic?: string;
}): Promise<void> {
  const db = await getDb();
  const collection = db.collection<UserInteraction>("user_interactions");

  // Upsert: increment weight if exists, otherwise insert
  await collection.updateOne(
    { userId: input.userId, storyId: input.storyId },
    {
      $inc: { weight: input.weight },
      $set: { topic: input.topic, createdAt: new Date() },
      $setOnInsert: { userId: input.userId, storyId: input.storyId },
    },
    { upsert: true },
  );
}

export async function getUserReadingHistory(
  userId: string,
  limit = 100,
): Promise<UserInteraction[]> {
  const db = await getDb();
  return db
    .collection<UserInteraction>("user_interactions")
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getMultipleUsersReadingHistory(
  userIds: string[],
  limit = 50,
): Promise<Map<string, UserInteraction[]>> {
  if (userIds.length === 0) return new Map();

  const db = await getDb();
  const interactions = await db
    .collection<UserInteraction>("user_interactions")
    .find({ userId: { $in: userIds } })
    .sort({ createdAt: -1 })
    .toArray();

  const grouped = new Map<string, UserInteraction[]>();
  for (const interaction of interactions) {
    const list = grouped.get(interaction.userId) ?? [];
    if (list.length < limit) {
      list.push(interaction);
    }
    grouped.set(interaction.userId, list);
  }

  return grouped;
}

export async function getUserRecentStoryIds(
  userId: string,
  limit = 50,
): Promise<string[]> {
  const history = await getUserReadingHistory(userId, limit);
  return history.map((h) => h.storyId);
}

export async function getUserTopicInterests(userId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const interactions = await db
    .collection<UserInteraction>("user_interactions")
    .find({ userId })
    .toArray();

  const topicWeights: Record<string, number> = {};
  for (const interaction of interactions) {
    if (interaction.topic) {
      // log-damped so one heavily re-read story cannot define the whole profile
      topicWeights[interaction.topic] =
        (topicWeights[interaction.topic] || 0) + Math.log1p(Math.max(0, interaction.weight));
    }
  }
  return topicWeights;
}

// ── Likes ────────────────────────────────────────────────────────────────────

// High interaction weight for likes (used by recommendation logic)
export const LIKE_INTERACTION_WEIGHT = 10;

export async function toggleLike(
  userId: string,
  storyId: string,
  topic: string,
): Promise<{ liked: boolean }> {
  const db = await getDb();
  const collection = db.collection<Like>("likes");

  const existing = await collection.findOne({ userId, storyId });

  if (existing) {
    await collection.deleteOne({ userId, storyId });
    // Undo the like's interaction weight so like/unlike cycles cannot inflate it.
    await db.collection<UserInteraction>("user_interactions").updateOne(
      { userId, storyId },
      [{ $set: { weight: { $max: [0, { $subtract: ["$weight", LIKE_INTERACTION_WEIGHT] }] } } }],
    );
    return { liked: false };
  } else {
    await collection.insertOne({
      userId,
      storyId,
      topic,
      createdAt: new Date(),
    });
    // Record a high-weight interaction for recommendation logic
    await recordUserStoryInteraction({
      userId,
      storyId,
      topic,
      weight: LIKE_INTERACTION_WEIGHT,
    });
    return { liked: true };
  }
}

export async function isStoryLiked(
  userId: string,
  storyId: string,
): Promise<boolean> {
  const db = await getDb();
  const doc = await db.collection<Like>("likes").findOne({ userId, storyId });
  return doc !== null;
}

export async function getStoryLikeCounts(
  storyIds: string[],
): Promise<Record<string, number>> {
  if (storyIds.length === 0) return {};
  const db = await getDb();
  const counts = await db
    .collection<Like>("likes")
    .aggregate([
      { $match: { storyId: { $in: storyIds } } },
      { $group: { _id: "$storyId", count: { $sum: 1 } } },
    ])
    .toArray();
  const result: Record<string, number> = {};
  for (const c of counts) {
    result[c._id as string] = c.count as number;
  }
  return result;
}

// Used by collaborative-filtering to find which stories friends have liked
export async function getFriendsLikedStoryIdsByFriendIds(
  friendIds: string[],
): Promise<Map<string, Set<string>>> {
  if (friendIds.length === 0) return new Map();
  const db = await getDb();
  const likes = await db
    .collection<Like>("likes")
    .find({ userId: { $in: friendIds } })
    .toArray();
  const result = new Map<string, Set<string>>();
  for (const like of likes) {
    const existing = result.get(like.userId) ?? new Set<string>();
    existing.add(like.storyId);
    result.set(like.userId, existing);
  }
  return result;
}

export async function getFriendsLikes(userId: string, limit = 50): Promise<any[]> {
  const friendIds = await getFollowingIds(userId);
  if (friendIds.length === 0) return [];

  const db = await getDb();
  // Get recent likes from friends
  const likes = await db
    .collection<Like>("likes")
    .find({ userId: { $in: friendIds } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  if (likes.length === 0) return [];

  // Get story details for these likes
  const storyIds = likes.map((l) => l.storyId);
  const stories = await db
    .collection("stories")
    .find({ id: { $in: storyIds } })
    .toArray();

  const storyMap = new Map(stories.map((s) => [s.id, s]));
  
  // Get friend names
  const friendObjectIds = friendIds.map(id => {
    try { return new ObjectId(id); } catch { return null; }
  }).filter(Boolean) as ObjectId[];
  
  const friends = await db.collection("users").find({ _id: { $in: friendObjectIds } }).toArray();
  const friendMap = new Map(friends.map(f => [f._id.toString(), (f.name as string) || "Anonymous"]));

  return likes.map((l) => {
    const story = storyMap.get(l.storyId);
    if (!story) return null;
    
    // Convert StoryNode to HorizonItem-like object for FeedCard
    const mappedStory = {
      id: story.id,
      title: story.title,
      source: story.sourceIds?.[0] || "unknown",
      score: story.score || 50,
      timestamp: story.timestamp,
      origin: (story.topic || "Intelligence").toUpperCase(),
      url: story.url,
    };

    return {
      ...l,
      story: mappedStory,
      userName: friendMap.get(l.userId) || "A friend",
    };
  }).filter(Boolean);
}
