import { Suspense } from "react";
import { LiveHome } from "../components/live-home";
import { createStoryGraph } from "../lib/graph";
import { getGraphSnapshot } from "../lib/graph-service";
import Loading from "./loading";

export const dynamic = "force-dynamic";

async function HomeContent() {
  try {
    const initialData = await getGraphSnapshot();
    return <LiveHome initialData={initialData} />;
  } catch (error) {
    console.error("Failed to fetch initial graph data:", error);
    const fallback = createStoryGraph(42);
    return (
      <LiveHome
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
  return (
    <Suspense fallback={<Loading />}>
      <HomeContent />
    </Suspense>
  );
}
