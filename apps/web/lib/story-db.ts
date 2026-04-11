import type { StoryNode } from "./graph";
import { getJsonArray, storeJsonArray } from "./redis";

const STORY_DB_KEY = "news:db:stories";
const SOURCE_METRICS_DB_KEY = "news:db:source-metrics";
const INGESTION_REPORT_DB_KEY = "news:db:ingestion-report";

export type SourceIngestionMetric = {
  sourceId: string;
  sourceLabel: string;
  endpoint: string;
  ok: boolean;
  mode: "live" | "fallback";
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
    mode: "live" | "fallback";
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
  const stories = await getJsonArray<StoryNode>(STORY_DB_KEY);
  return stories
    .slice()
    .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));
}

export async function mergeAndStoreStories(
  incomingStories: StoryNode[],
  maxStories = 800,
): Promise<StoryNode[]> {
  const existingStories = await readStoredStories();
  const map = new Map<string, StoryNode>();

  for (const story of existingStories) {
    map.set(story.id, story);
  }
  for (const story of incomingStories) {
    map.set(story.id, story);
  }

  const merged = Array.from(map.values())
    .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
    .slice(0, maxStories);

  await storeJsonArray(STORY_DB_KEY, merged);
  return merged;
}

export async function storeSourceMetrics(
  metrics: SourceIngestionMetric[],
): Promise<void> {
  await storeJsonArray(SOURCE_METRICS_DB_KEY, metrics);
}

export async function readSourceMetrics(): Promise<SourceIngestionMetric[]> {
  return getJsonArray<SourceIngestionMetric>(SOURCE_METRICS_DB_KEY);
}

export async function storeIngestionReport(
  report: IngestionRunReport,
): Promise<void> {
  await storeJsonArray(INGESTION_REPORT_DB_KEY, [report]);
}

export async function readIngestionReport(): Promise<IngestionRunReport | null> {
  const reports = await getJsonArray<IngestionRunReport>(
    INGESTION_REPORT_DB_KEY,
  );
  return reports[0] ?? null;
}
