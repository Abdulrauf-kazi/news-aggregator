import { createStoryGraph } from "../lib/graph";
import { getGraphSnapshot } from "../lib/graph-service";
import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

async function HomeContent() {
  try {
    const initialData = await getGraphSnapshot();
    return <HomeClient initialData={initialData} />;
  } catch (error) {
    console.error("Failed to fetch initial graph data:", error);
    const fallback = createStoryGraph(42);
    return (
      <HomeClient
        initialData={{
          ...fallback,
          meta: {
            cached: false,
            storage: "fallback",
            plannedArchive: null,
            totalStoriesInDb: fallback.stories.length,
            sourceMetricsCount: 0,
            recommendations: [],
            recommendationReasons: {},
            retrieval: {
              vectorBackend: "cosine",
              vectorCount: 0,
              graphSeedCount: 0,
              mode: "graph",
            },
            fetchedAt: new Date().toISOString(),
          },
        }}
      />
    );
  }
}

export default function Home() {
  return <HomeContent />;
}
