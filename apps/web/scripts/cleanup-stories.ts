/**
 * One-off cleanup of stories stored before the model fixes.
 *
 *   bun run cleanup:stories            # dry run: report what would change
 *   bun run cleanup:stories --apply    # write changes to MongoDB + clear Redis caches
 *
 * Reads MONGODB_URI / REDIS_URL / embedding settings from the environment
 * (bun auto-loads apps/web/.env.local). For every stored story it:
 *   1. deletes synthetic placeholder stories (fallback generator output),
 *   2. strips fabricated co-source attributions (sourceIds -> the ingesting source;
 *      the old adapters tagged e.g. every RSS item with "rss2json"),
 *   3. re-embeds title + content with the current model and records embeddingModel
 *      (old rows may hold lexical hash vectors from the retired HF endpoint),
 *   4. re-classifies the topic (keyword + neural hybrid) and recomputes the base score,
 * then clears the Redis keys that cache stories, the graph, the vector index and
 * the legacy embedding cache (`embedding:text:*`).
 */
import type { StoryNode } from "../lib/graph";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

const { getDb } = await import("../lib/mongodb");
const { getRedisClient } = await import("../lib/redis");
const { embedTexts, embeddingProviderInfo } = await import("../lib/embeddings");
const { classifyTopic, refineTopicsWithEmbeddings } = await import("../lib/topic-classifier");
const { baseSignalScore, isSyntheticStory } = await import("../lib/story-quality");
const { SOURCE_DEFINITIONS } = await import("../lib/sources");

const knownSources = new Set(SOURCE_DEFINITIONS.map((source) => source.id));

/** Ids are `story:<sourceId>:<externalId>`; the ingesting source is the only trustworthy attribution. */
const primarySourceOf = (story: StoryNode) => {
  const fromId = story.id.split(":")[1];
  if (fromId && knownSources.has(fromId)) return fromId;
  return story.sourceIds[0] ?? fromId ?? "unknown";
};

const db = await getDb();
const collection = db.collection<StoryNode>("stories");
const stored = (await collection.find({}, { projection: { _id: 0 } }).toArray()) as StoryNode[];
console.log(`Embedding provider: ${JSON.stringify(embeddingProviderInfo())}`);
console.log(`Loaded ${stored.length} stories from MongoDB (${APPLY ? "APPLY" : "dry run"})`);

const synthetic = stored.filter((story) => isSyntheticStory(story));
const real = stored.filter((story) => !isSyntheticStory(story));

const stats = {
  total: stored.length,
  syntheticRemoved: synthetic.length,
  sourceIdsStripped: 0,
  topicChanged: 0,
  scoreChanged: 0,
  reEmbedded: 0,
  embeddedWithModel: 0,
  embeddedLexicalFallback: 0,
  previousEmbeddingSpaces: {} as Record<string, number>,
};
const topicTransitions: Record<string, number> = {};
const samples: string[] = [];

const cleaned: StoryNode[] = [];
for (let offset = 0; offset < real.length; offset += BATCH) {
  const chunk = real.slice(offset, offset + BATCH);
  const embeddings = await embedTexts(chunk.map((story) => `${story.title}\n${story.content ?? ""}`));

  const rebuilt = chunk.map((story, index) => {
    const sourceId = primarySourceOf(story);
    const { topic, strength } = classifyTopic({ title: story.title, content: story.content, sourceId });
    const embedding = embeddings[index]!;
    const previousSpace = story.embeddingModel ?? (story.embedding?.length ? "unknown (pre-fix)" : "none");
    stats.previousEmbeddingSpaces[previousSpace] = (stats.previousEmbeddingSpaces[previousSpace] ?? 0) + 1;
    return {
      ...story,
      sourceIds: [sourceId],
      topic,
      score: baseSignalScore(strength, story.content),
      embedding: embedding.embedding,
      embeddingModel: embedding.model,
    } satisfies StoryNode;
  });

  const refined = await refineTopicsWithEmbeddings(
    rebuilt,
    (story) => classifyTopic({ title: story.title, content: story.content }).strength,
  );

  refined.forEach((next, index) => {
    const before = chunk[index]!;
    if (before.sourceIds.length !== next.sourceIds.length) stats.sourceIdsStripped += 1;
    if (before.topic !== next.topic) {
      stats.topicChanged += 1;
      const key = `${before.topic} -> ${next.topic}`;
      topicTransitions[key] = (topicTransitions[key] ?? 0) + 1;
      if (samples.length < 8) samples.push(`  [${before.topic} -> ${next.topic}] ${next.title}`);
    }
    if (before.score !== next.score) stats.scoreChanged += 1;
    stats.reEmbedded += 1;
    if (embeddings[index]!.fromModel) stats.embeddedWithModel += 1;
    else stats.embeddedLexicalFallback += 1;
    cleaned.push(next);
  });
}

console.log("\nSummary:");
const { previousEmbeddingSpaces, ...counts } = stats;
console.table(counts);
console.log("Previous embedding spaces:", previousEmbeddingSpaces);
const topTransitions = Object.entries(topicTransitions).sort((a, b) => b[1] - a[1]).slice(0, 10);
if (topTransitions.length) {
  console.log("Most common topic corrections:");
  for (const [transition, count] of topTransitions) console.log(`  ${transition}: ${count}`);
}
if (samples.length) console.log("Sample topic corrections:\n" + samples.join("\n"));
if (stats.embeddedLexicalFallback > 0) {
  console.warn(
    `\nWARNING: ${stats.embeddedLexicalFallback} stories fell back to lexical embeddings. ` +
      "Check EMBEDDING_PROVIDER / HUGGINGFACE_API_KEY before applying.",
  );
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write these changes.");
  process.exit(0);
}

if (synthetic.length > 0) {
  await collection.deleteMany({ id: { $in: synthetic.map((story) => story.id) } });
}
for (let offset = 0; offset < cleaned.length; offset += BATCH) {
  const chunk = cleaned.slice(offset, offset + BATCH);
  await collection.bulkWrite(
    chunk.map((story) => ({
      updateOne: {
        filter: { id: story.id },
        update: {
          $set: {
            sourceIds: story.sourceIds,
            topic: story.topic,
            score: story.score,
            embedding: story.embedding,
            embeddingModel: story.embeddingModel,
          },
        },
      },
    })),
    { ordered: false },
  );
}
console.log(`\nMongoDB: deleted ${synthetic.length}, updated ${cleaned.length} stories.`);

const redis = getRedisClient();
if (!redis) {
  console.warn("REDIS_URL not set: skipped Redis cache invalidation (restart the app to clear its in-memory cache).");
} else {
  const fixedKeys = ["news:db:stories", "news:graph:live", "vector:stories:embeddings"];
  let removed = await redis.del(...fixedKeys);
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "embedding:text:*", "COUNT", 500);
    cursor = next;
    if (keys.length) removed += await redis.del(...keys);
  } while (cursor !== "0");
  console.log(`Redis: removed ${removed} cached keys (story cache, graph, vector index, legacy embedding cache).`);
  redis.disconnect();
}

process.exit(0);
