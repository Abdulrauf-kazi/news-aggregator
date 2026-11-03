/**
 * Demo news generator.
 *
 * For sources whose live feed is broken (see docs/source-audit.md), the app
 * stops ingesting them and instead shows one OpenRouter-generated story per
 * source, written in that outlet's beat and style. Every cycle
 * (DEMO_NEWS_INTERVAL_MINUTES, default 15) each source's previous generated
 * story is deleted and replaced with a new one. A source whose generation
 * fails keeps its previous story, so the feed is never left empty.
 *
 * Working sources (BBC, Guardian, Sky, Al Jazeera, ...) are untouched.
 *
 * Config (apps/web/.env.local):
 *   OPENROUTER_API_KEY              required; the generator is off without it
 *   OPENROUTER_MODEL                default nvidia/nemotron-3-ultra-550b-a55b:free
 *   DEMO_NEWS_ENABLED=0             turn the whole feature off (live ingestion for all sources)
 *   DEMO_NEWS_INTERVAL_MINUTES      default 15
 *   DEMO_NEWS_BATCH_SIZE            sources per API call, default 8 (31 sources -> 4 calls/cycle)
 *   DEMO_NEWS_SOURCES               optional comma list overriding DEMO_SOURCE_IDS
 *   DEMO_NEWS_IDLE_MINUTES          skip cycles when nobody has loaded the app for this long, default 30
 *
 * Stories live in their own Mongo collection (`demo_generated_stories`) and are
 * merged into what readers see by `withDemoStories`; the real `stories`
 * collection is never written to or deleted from by this module.
 */
import { getDb } from "./mongodb";
import { TOPICS } from "./sources";
import type { StoryNode } from "./graph";

// ── Configuration ───────────────────────────────────────────────────────────

/** Sources audited as not working on 2026-11-03 (docs/source-audit.md). */
export const DEMO_SOURCE_IDS = [
  "cnn",
  "wsj",
  "reuters",
  "bloomberg",
  "alarabiya",
  "aajtak",
  "wion",
  "ndtv",
  "yahoo-finance",
  "fred",
  "acled",
  "ucdp",
  "unhcr",
  "faa",
  "ais",
  "abusech",
  "alienvault-otx",
  "abuseipdb",
  "c2intelfeeds",
  "usaspending",
  "x",
  "telegram",
  "polymarket",
  "opensky",
  "gdelt-conflict",
  "gdelt-tech",
  "gdelt-eco",
  "gdelt-climate",
  "github",
  "coingecko",
  "eia",
] as const;

/** What each outlet covers and how it writes. Used only in the prompt. */
const SOURCE_BEATS: Record<string, { label: string; beat: string; language?: string }> = {
  cnn: { label: "CNN World", beat: "international breaking news and world affairs; clear, conversational broadcast-newsroom style" },
  wsj: { label: "WSJ World", beat: "global business, economics, trade and policy; measured, analytical Wall Street Journal tone" },
  reuters: { label: "Reuters", beat: "world news wire copy; terse, strictly factual, inverted pyramid, opens with a dateline such as \"LONDON (Reuters) -\"" },
  bloomberg: { label: "Bloomberg", beat: "markets, finance, central banks and corporate deals; numbers-led, brisk Bloomberg style" },
  alarabiya: { label: "Al Arabiya", beat: "Middle East and Gulf politics, diplomacy, energy and economy (English edition)" },
  aajtak: { label: "Aaj Tak", beat: "Indian national news (politics, states, society, cricket); Hindi news-channel style", language: "Hindi (Devanagari script)" },
  wion: { label: "WION", beat: "world news from an Indian perspective: geopolitics, diplomacy, South Asia" },
  ndtv: { label: "NDTV India", beat: "Indian national news: politics, courts, economy, infrastructure" },
  "yahoo-finance": { label: "Yahoo Finance", beat: "US stock market moves, earnings, sectors and personal finance" },
  fred: { label: "FRED", beat: "US macroeconomic data releases (inflation, jobs, rates, GDP) explained as a data note" },
  acled: { label: "ACLED", beat: "armed-conflict and political-violence monitoring briefing on regional trends" },
  ucdp: { label: "UCDP", beat: "peace and conflict research analysis on long-run conflict trends" },
  unhcr: { label: "UNHCR", beat: "refugees, displacement and humanitarian response updates" },
  faa: { label: "FAA", beat: "US aviation safety advisories, air traffic operations and airspace notices" },
  ais: { label: "AIS Vessels", beat: "maritime shipping, vessel traffic, ports, chokepoints and freight" },
  abusech: { label: "abuse.ch", beat: "malware, botnet and threat-intelligence briefs for security teams" },
  "alienvault-otx": { label: "AlienVault OTX", beat: "community threat-intelligence pulse: new campaigns and indicators" },
  abuseipdb: { label: "AbuseIPDB", beat: "IP abuse and attack-traffic trend reports (scanning, brute force, DDoS)" },
  c2intelfeeds: { label: "C2IntelFeeds", beat: "tracking of command-and-control infrastructure used by attackers" },
  usaspending: { label: "USASpending.gov", beat: "US federal contracts, grants and spending trends" },
  x: { label: "X (Twitter)", beat: "what is trending on X: social-media buzz around tech, culture and world events" },
  telegram: { label: "Telegram", beat: "digest of updates from public Telegram news channels on tech and world events" },
  polymarket: { label: "Polymarket", beat: "prediction-market activity on economics, technology and world events" },
  opensky: { label: "OpenSky", beat: "air-traffic and flight-tracking observations (traffic volumes, diversions, busy corridors)" },
  "gdelt-conflict": { label: "GDELT (Conflict)", beat: "global media-monitoring digest on conflict and security" },
  "gdelt-tech": { label: "GDELT (Cyber & Tech)", beat: "global media-monitoring digest on cyberattacks and artificial intelligence" },
  "gdelt-eco": { label: "GDELT (Economy)", beat: "global media-monitoring digest on inflation, recession risk and markets" },
  "gdelt-climate": { label: "GDELT (Climate)", beat: "global media-monitoring digest on climate change and natural disasters" },
  github: { label: "GitHub", beat: "open-source and developer news: notable releases, trending projects, tooling" },
  coingecko: { label: "CoinGecko", beat: "crypto market movers, sector trends and token news" },
  eia: { label: "EIA", beat: "US energy data: oil and gas inventories, electricity demand, fuel prices" },
};

const env = (name: string) => process.env[name]?.trim() || undefined;

export const demoConfig = () => {
  const ids = env("DEMO_NEWS_SOURCES")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [...DEMO_SOURCE_IDS];
  return {
    enabled: env("DEMO_NEWS_ENABLED") !== "0" && Boolean(env("OPENROUTER_API_KEY")),
    apiKey: env("OPENROUTER_API_KEY"),
    model: env("OPENROUTER_MODEL") ?? "nvidia/nemotron-3-ultra-550b-a55b:free",
    baseUrl: (env("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    intervalMs: Math.max(1, Number(env("DEMO_NEWS_INTERVAL_MINUTES") ?? 15)) * 60_000,
    batchSize: Math.max(1, Math.min(31, Number(env("DEMO_NEWS_BATCH_SIZE") ?? 8))),
    idleMs: Math.max(1, Number(env("DEMO_NEWS_IDLE_MINUTES") ?? 30)) * 60_000,
    requestTimeoutMs: Number(env("DEMO_NEWS_TIMEOUT_MS") ?? 180_000),
    sourceIds: ids,
  };
};

const demoSourceSet = () => new Set(demoConfig().sourceIds);

/** True when this source's live feed is replaced by generated stories. */
export const isDemoSource = (sourceId: string) => demoConfig().enabled && demoSourceSet().has(sourceId);

/** The source that ingested a story: ids look like `story:<sourceId>:<externalId>`. */
export const storyOwner = (story: Pick<StoryNode, "id" | "sourceIds">) =>
  story.id.split(":")[1] ?? story.sourceIds[0] ?? "";

// ── Storage ─────────────────────────────────────────────────────────────────

const COLLECTION = "demo_generated_stories";
const META_COLLECTION = "demo_generated_meta";
const META_ID = "demo-news";

type DemoStoryDoc = StoryNode & {
  generated: true;
  demoSourceId: string;
  cycleId: string;
  generatedAt: string;
  model: string;
};

type DemoMeta = {
  _id: string;
  generation: string;
  lastCycleAt?: string;
  lastCycleId?: string;
  lastResult?: CycleResult;
};

const CACHE_MS = 20_000;
type Cache = { at: number; stories: StoryNode[]; generation: string };
const globalDemo = globalThis as typeof globalThis & {
  __demoNewsCache?: Cache;
  __demoNewsRunning?: Promise<CycleResult>;
  __demoNewsTimer?: ReturnType<typeof setInterval>;
  __demoNewsLastActivity?: number;
};

const stripDoc = (doc: Record<string, unknown>): StoryNode => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, demoSourceId, cycleId, generatedAt, model, ...story } = doc;
  return story as unknown as StoryNode;
};

async function loadDemoState(): Promise<Cache> {
  const cached = globalDemo.__demoNewsCache;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  try {
    const db = await getDb();
    const [docs, meta] = await Promise.all([
      db.collection(COLLECTION).find({}, { projection: { _id: 0 } }).toArray(),
      db.collection<DemoMeta>(META_COLLECTION).findOne({ _id: META_ID }),
    ]);
    const state: Cache = {
      at: Date.now(),
      stories: docs.map((doc) => stripDoc(doc as Record<string, unknown>)),
      generation: meta?.generation ?? "none",
    };
    globalDemo.__demoNewsCache = state;
    return state;
  } catch (error) {
    console.warn("[demo-news] could not read generated stories:", error instanceof Error ? error.message : error);
    return cached ?? { at: Date.now(), stories: [], generation: "unavailable" };
  }
}

/** Identifies the current set of generated stories; changes after every cycle. */
export async function getDemoGeneration(): Promise<string> {
  if (!demoConfig().enabled) return "disabled";
  return (await loadDemoState()).generation;
}

/**
 * What readers see: real stories minus anything still stored for a demo source,
 * plus the current generated story for each demo source, newest first.
 */
export async function withDemoStories(stories: StoryNode[]): Promise<StoryNode[]> {
  if (!demoConfig().enabled) return stories;
  const demoIds = demoSourceSet();
  const { stories: generated } = await loadDemoState();
  const real = stories.filter((story) => !story.generated && !demoIds.has(storyOwner(story)));
  return [...generated, ...real].sort(
    (left, right) => (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0),
  );
}

/** Called on page and API reads so idle servers don't spend the free API quota. */
export const noteDemoActivity = () => {
  globalDemo.__demoNewsLastActivity = Date.now();
};

// ── Generation ──────────────────────────────────────────────────────────────

export type CycleResult = {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  model: string;
  requested: number;
  generated: string[];
  failed: Array<{ sourceId: string; reason: string }>;
  calls: Array<{ sources: string[]; ok: boolean; ms: number; error?: string }>;
  skipped?: string;
};

type GeneratedItem = { sourceId: string; title: string; content: string; topic?: string };

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

export const buildPrompt = (sourceIds: string[], now: Date) => {
  const dateLine = now.toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, "");
  const sources = sourceIds
    .map((id) => {
      const info = SOURCE_BEATS[id] ?? { label: id, beat: "general news" };
      return `- sourceId "${id}" (${info.label}): ${info.beat}.${info.language ? ` Write this one in ${info.language}.` : ""}`;
    })
    .join("\n");
  const system = [
    "You write short news articles for a news-aggregator product demo.",
    "Each article must read like a typical piece from the named outlet: match its beat, tone and structure.",
    "Rules:",
    "- One article per requested sourceId; each on a different subject.",
    "- Headline: 6-16 words, no outlet name, no clickbait.",
    "- Body: 3-5 paragraphs, 180-280 words, separated by a blank line. No markdown, no bullet points, no headings.",
    "- Do not invent direct quotes attributed to real, named people.",
    "- Do not allege crimes, deaths, injuries, scandals or misconduct involving real, named people or companies.",
    "- Do not report election results, vote counts, polls, or who is winning any election.",
    "- Do not invent precise official statistics (CPI, unemployment, GDP, casualty counts); describe trends instead.",
    "- Prefer analysis, explainers, market colour, data trends and routine developments over dramatic breaking events.",
    `- topic must be exactly one of: ${TOPICS.join(", ")}.`,
    'Reply with JSON only, no prose and no code fences: {"stories":[{"sourceId":"...","title":"...","topic":"...","content":"..."}]}',
  ].join("\n");
  const user = `Today is ${dateLine}. Write one article for each of these sources:\n${sources}`;
  return { system, user };
};

/** Pulls the JSON object out of a model reply (tolerates code fences and stray text). */
export const parseModelJson = (text: string): GeneratedItem[] => {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("reply contained no JSON object");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { stories?: unknown };
  if (!Array.isArray(parsed.stories)) throw new Error("reply JSON has no stories array");
  return parsed.stories.filter(
    (item): item is GeneratedItem =>
      !!item &&
      typeof (item as GeneratedItem).sourceId === "string" &&
      typeof (item as GeneratedItem).title === "string" &&
      typeof (item as GeneratedItem).content === "string",
  );
};

const normalizeContent = (content: string) =>
  content
    .replace(/\r\n/g, "\n")
    .replace(/[*_#`]+/g, "")
    .split(/\n\s*\n|\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

async function callOpenRouter(sourceIds: string[], now: Date): Promise<GeneratedItem[]> {
  const config = demoConfig();
  const { system, user } = buildPrompt(sourceIds, now);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "News Aggregator Demo",
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.8,
          max_tokens: Math.min(16000, 900 * sourceIds.length + 1500),
          reasoning: { effort: "low", exclude: true },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        // 429 = free-tier rate limit; 5xx = provider hiccup. Both are worth a retry.
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}`);
        if (!retryable) break;
        const retryAfter = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000 * (attempt + 1)));
        continue;
      }
      const payload = JSON.parse(body) as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
        error?: { message?: string };
      };
      if (payload.error) throw new Error(`OpenRouter error: ${payload.error.message}`);
      const content = payload.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error(`empty reply (finish_reason ${payload.choices?.[0]?.finish_reason ?? "?"})`);
      return parseModelJson(content);
    } catch (error) {
      lastError = error;
      if (controller.signal.aborted) lastError = new Error(`OpenRouter request timed out after ${config.requestTimeoutMs}ms`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function toStories(items: GeneratedItem[], cycleId: string, now: Date): Promise<DemoStoryDoc[]> {
  const { classifyTopic } = await import("./topic-classifier");
  const { baseSignalScore } = await import("./story-quality");
  const config = demoConfig();
  return items.map((item, index) => {
    const title = item.title.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
    const content = normalizeContent(item.content);
    const keyword = classifyTopic({ title, content, sourceId: item.sourceId });
    const topic = (TOPICS as readonly string[]).includes(item.topic ?? "") ? (item.topic as string) : keyword.topic;
    // Spread timestamps over the cycle so the feed doesn't show 31 identical times.
    const timestamp = new Date(now.getTime() - index * 29_000).toISOString();
    return {
      id: `story:${item.sourceId}:gen-${cycleId}`,
      title,
      content,
      topic,
      score: baseSignalScore(keyword.strength, content),
      sourceIds: [item.sourceId],
      timestamp,
      generated: true as const,
      demoSourceId: item.sourceId,
      cycleId,
      generatedAt: now.toISOString(),
      model: config.model,
    };
  });
}

async function addEmbeddings(stories: DemoStoryDoc[]): Promise<DemoStoryDoc[]> {
  try {
    const { addEmbeddingsToStories } = await import("./embeddings");
    return (await addEmbeddingsToStories(stories)) as DemoStoryDoc[];
  } catch (error) {
    console.warn("[demo-news] embeddings failed, storing without:", error instanceof Error ? error.message : error);
    return stories;
  }
}

/** Generates one story per demo source and replaces each source's previous one. */
export async function runDemoNewsCycle(options: { reason?: string } = {}): Promise<CycleResult> {
  if (globalDemo.__demoNewsRunning) return globalDemo.__demoNewsRunning;
  const config = demoConfig();
  const startedAt = new Date();
  const cycleId = startedAt.toISOString().replace(/[-:.]/g, "").slice(0, 15);
  const result: CycleResult = {
    cycleId,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    model: config.model,
    requested: config.sourceIds.length,
    generated: [],
    failed: [],
    calls: [],
  };
  if (!config.enabled) {
    return { ...result, skipped: config.apiKey ? "DEMO_NEWS_ENABLED=0" : "OPENROUTER_API_KEY not set" };
  }

  const run = (async () => {
    console.log(`[demo-news] cycle ${cycleId} started (${options.reason ?? "scheduled"}), ${config.sourceIds.length} sources`);
    const accepted: GeneratedItem[] = [];
    for (const batch of chunk(config.sourceIds, config.batchSize)) {
      const t0 = Date.now();
      try {
        const items = await callOpenRouter(batch, startedAt);
        const seen = new Set<string>();
        for (const item of items) {
          if (!batch.includes(item.sourceId) || seen.has(item.sourceId)) continue;
          if (item.title.trim().length < 12 || normalizeContent(item.content).length < 300) continue;
          seen.add(item.sourceId);
          accepted.push(item);
        }
        for (const id of batch.filter((id) => !seen.has(id))) {
          result.failed.push({ sourceId: id, reason: "missing or too short in model reply" });
        }
        result.calls.push({ sources: batch, ok: true, ms: Date.now() - t0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.calls.push({ sources: batch, ok: false, ms: Date.now() - t0, error: message });
        for (const id of batch) result.failed.push({ sourceId: id, reason: message });
      }
    }

    if (accepted.length > 0) {
      const stories = await addEmbeddings(await toStories(accepted, cycleId, startedAt));
      const db = await getDb();
      // Per source: delete the previous generated story, insert the new one.
      await db.collection<DemoStoryDoc>(COLLECTION).bulkWrite(
        stories.flatMap((story) => [
          { deleteMany: { filter: { demoSourceId: story.demoSourceId } } },
          { insertOne: { document: story } },
        ]),
        { ordered: true },
      );
      result.generated = stories.map((story) => story.demoSourceId);
    }
    // Sources removed from the demo list lose their generated stories.
    try {
      const db = await getDb();
      await db.collection(COLLECTION).deleteMany({ demoSourceId: { $nin: config.sourceIds } });
    } catch {
      // non-fatal
    }

    result.finishedAt = new Date().toISOString();
    const db = await getDb();
    const changed = result.generated.length > 0;
    await db.collection<DemoMeta>(META_COLLECTION).updateOne(
      { _id: META_ID },
      {
        // Only a cycle that changed stories invalidates the cached graph.
        $set: { ...(changed ? { generation: cycleId } : {}), lastCycleAt: result.startedAt, lastCycleId: cycleId, lastResult: result },
        // (Mongo rejects an empty operator, so $setOnInsert is only added when needed.)
        ...(changed ? {} : { $setOnInsert: { generation: "none" } }),
      },
      { upsert: true },
    );
    globalDemo.__demoNewsCache = undefined;
    console.log(
      `[demo-news] cycle ${cycleId} done in ${Math.round((Date.parse(result.finishedAt) - startedAt.getTime()) / 1000)}s: ` +
        `${result.generated.length} generated, ${result.failed.length} failed` +
        (result.failed.length ? ` (${[...new Set(result.failed.map((f) => f.reason))].join(" | ").slice(0, 300)})` : ""),
    );
    return result;
  })();

  globalDemo.__demoNewsRunning = run;
  try {
    return await run;
  } finally {
    globalDemo.__demoNewsRunning = undefined;
  }
}

export async function getDemoStatus() {
  const config = demoConfig();
  let meta: DemoMeta | null = null;
  let count = 0;
  try {
    const db = await getDb();
    [meta, count] = await Promise.all([
      db.collection<DemoMeta>(META_COLLECTION).findOne({ _id: META_ID }),
      db.collection(COLLECTION).countDocuments(),
    ]);
  } catch {
    // reported as nulls
  }
  const lastCycleAt = meta?.lastCycleAt ? Date.parse(meta.lastCycleAt) : null;
  return {
    enabled: config.enabled,
    model: config.model,
    intervalMinutes: config.intervalMs / 60_000,
    batchSize: config.batchSize,
    callsPerCycle: Math.ceil(config.sourceIds.length / config.batchSize),
    sources: config.sourceIds,
    storedGeneratedStories: count,
    lastCycleAt: meta?.lastCycleAt ?? null,
    nextDueAt: lastCycleAt ? new Date(lastCycleAt + config.intervalMs).toISOString() : "now",
    running: Boolean(globalDemo.__demoNewsRunning),
    lastActivityAt: globalDemo.__demoNewsLastActivity ? new Date(globalDemo.__demoNewsLastActivity).toISOString() : null,
    lastResult: meta?.lastResult ?? null,
  };
}

// ── Scheduler ───────────────────────────────────────────────────────────────

const TICK_MS = 60_000;

async function tick() {
  const config = demoConfig();
  if (!config.enabled || globalDemo.__demoNewsRunning) return;
  try {
    const db = await getDb();
    const meta = await db.collection<DemoMeta>(META_COLLECTION).findOne({ _id: META_ID });
    const count = await db.collection(COLLECTION).countDocuments();
    const last = meta?.lastCycleAt ? Date.parse(meta.lastCycleAt) : 0;
    const due = Date.now() - last >= config.intervalMs;
    if (!due) return;
    // Nothing generated yet: always run. Otherwise only while someone is using the app.
    const lastActivity = globalDemo.__demoNewsLastActivity ?? 0;
    if (count > 0 && Date.now() - lastActivity > config.idleMs) return;
    await runDemoNewsCycle({ reason: count === 0 ? "initial" : "scheduled" });
  } catch (error) {
    console.warn("[demo-news] scheduler tick failed:", error instanceof Error ? error.message : error);
  }
}

/** Starts the 1-minute scheduler once per server process (safe across hot reloads). */
export function startDemoNewsScheduler() {
  const config = demoConfig();
  if (globalDemo.__demoNewsTimer) return;
  if (!config.enabled) {
    console.log(
      `[demo-news] off (${config.apiKey ? "DEMO_NEWS_ENABLED=0" : "OPENROUTER_API_KEY not set"}); all sources use live ingestion`,
    );
    return;
  }
  console.log(
    `[demo-news] on: ${config.sourceIds.length} sources, model ${config.model}, every ${config.intervalMs / 60_000} min, ` +
      `${Math.ceil(config.sourceIds.length / config.batchSize)} API calls per cycle`,
  );
  // unref: never keep a script's process alive just for the scheduler.
  const unref = (timer: unknown) => (timer as { unref?: () => void }).unref?.();
  globalDemo.__demoNewsTimer = setInterval(() => void tick(), TICK_MS);
  unref(globalDemo.__demoNewsTimer);
  unref(setTimeout(() => void tick(), 5_000));
}
