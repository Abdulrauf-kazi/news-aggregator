import type { StoryNode } from "./graph";
import { getJsonArray, storeJsonArray } from "./redis";
import { getDb } from "./mongodb";
import { isSyntheticStory } from "./story-quality";

const STORY_DB_KEY = "news:db:stories";
const SOURCE_METRICS_DB_KEY = "news:db:source-metrics";
const INGESTION_REPORT_DB_KEY = "news:db:ingestion-report";

export type SourceIngestionMetric = {
  sourceId: string;
  sourceLabel: string;
  endpoint: string;
  ok: boolean;
  mode: "live" | "fallback" | "google-news-fallback";
  storyCount: number;
  error?: string;
  lastFetchedAt: string;
};

export type IngestionRunReport = {
  runAt: string;
  totalSources: number;
  liveSources: number;
  fallbackSources: number;
  fetchedStories: number;
  canonicalStories: number;
  storedStories: number;
  sourceBreakdown: Array<{
    sourceId: string;
    sourceLabel: string;
    endpoint: string;
    mode: "live" | "fallback" | "google-news-fallback";
    fetchedStories: number;
    canonicalStories: number;
    error?: string;
  }>;
};

const toTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function readStoredStories(): Promise<StoryNode[]> {
  const cached = await getJsonArray<StoryNode>(STORY_DB_KEY);
  if (cached && cached.length > 0) {
    return cached
      .slice()
      .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));
  }

  const db = await getDb();
  const collection = db.collection<StoryNode>("stories");
  const dbStories = await collection.find({}).toArray();
  
  const formattedStories = dbStories.map(story => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = story as Record<string, unknown>;
    return rest as StoryNode;
  });

  const sorted = formattedStories.sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));
  
  if (sorted.length > 0) {
    await storeJsonArray(STORY_DB_KEY, sorted);
  }
  
  return sorted;
}

export async function mergeAndStoreStories(
  incomingStories: StoryNode[],
  maxStories = 800,
): Promise<StoryNode[]> {
  const existingStories = await readStoredStories();
  const hasRealIncomingStory = incomingStories.some((story) => !isSyntheticStory(story));
  const filteredExistingStories = hasRealIncomingStory
    ? existingStories.filter((story) => !isSyntheticStory(story))
    : existingStories;
  const map = new Map<string, StoryNode>();

  for (const story of filteredExistingStories) {
    map.set(story.id, story);
  }
  for (const story of incomingStories) {
    map.set(story.id, story);
  }

  const merged = Array.from(map.values())
    .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
    .slice(0, maxStories);

  const db = await getDb();
  const collection = db.collection<StoryNode>("stories");

  const operations = merged.map((story) => ({
    updateOne: {
      filter: { id: story.id },
      update: { $set: story },
      upsert: true,
    }
  }));

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }

  await storeJsonArray(STORY_DB_KEY, merged);
  return merged;
}

export async function storeSourceMetrics(
  metrics: SourceIngestionMetric[],
): Promise<void> {
  const db = await getDb();
  const collection = db.collection<SourceIngestionMetric>("source_metrics");
  await collection.deleteMany({});
  if (metrics.length > 0) {
    await collection.insertMany(metrics);
  }
  await storeJsonArray(SOURCE_METRICS_DB_KEY, metrics);
}

export async function readSourceMetrics(): Promise<SourceIngestionMetric[]> {
  const cached = await getJsonArray<SourceIngestionMetric>(SOURCE_METRICS_DB_KEY);
  if (cached && cached.length > 0) {
    return cached;
  }

  const db = await getDb();
  const collection = db.collection<SourceIngestionMetric>("source_metrics");
  const metrics = await collection.find({}).toArray();
  const formatted = metrics.map(m => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    const { _id, ...rest } = m as any;
    return rest as SourceIngestionMetric;
  });
  
  if (formatted.length > 0) {
    await storeJsonArray(SOURCE_METRICS_DB_KEY, formatted);
  }
  return formatted;
}

export async function storeIngestionReport(
  report: IngestionRunReport,
): Promise<void> {
  const db = await getDb();
  const collection = db.collection<IngestionRunReport>("ingestion_reports");
  await collection.insertOne(report);
  await storeJsonArray(INGESTION_REPORT_DB_KEY, [report]);
}

export async function readIngestionReport(): Promise<IngestionRunReport | null> {
  const cached = await getJsonArray<IngestionRunReport>(INGESTION_REPORT_DB_KEY);
  if (cached && cached.length > 0) {
    return cached[0] ?? null;
  }

  const db = await getDb();
  const collection = db.collection<IngestionRunReport>("ingestion_reports");
  const report = await collection.find({}).sort({ runAt: -1 }).limit(1).toArray();
  const result = report[0];
  
  if (result) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = result as Record<string, unknown>;
    const formatted = rest as IngestionRunReport;
    await storeJsonArray(INGESTION_REPORT_DB_KEY, [formatted]);
    return formatted;
  }
  return null;
}
