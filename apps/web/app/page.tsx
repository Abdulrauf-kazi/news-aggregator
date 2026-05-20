import { createStoryGraph } from "../lib/graph";
import { getGraphSnapshot } from "../lib/graph-service";
import { toPreviewGraph } from "../lib/news-preview";
import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

async function HomeContent() {
  try {
    const initialData = await getGraphSnapshot();
    return <HomeClient initialData={toPreviewGraph(initialData)} />;
  } catch (error) {
    console.error("Failed to fetch initial graph data:", error);
    const fallback = createStoryGraph(42);
    const previewFallback = toPreviewGraph(fallback);
    const fixedTimestamp = new Date("2026-05-17T00:00:00.000Z").toISOString();
    return (
      <HomeClient
        initialData={{
          ...previewFallback,
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
            fetchedAt: fixedTimestamp,
          },
        }}
      />
    );
  }
}

export default function Home() {
  return <HomeContent />;
}
