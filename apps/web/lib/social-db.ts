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
