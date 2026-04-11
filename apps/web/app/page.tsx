import { LiveHome } from "../components/live-home";
import { createStoryGraph } from "../lib/graph";
import { getGraphSnapshot } from "../lib/graph-service";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const initialData = await getGraphSnapshot();
    return <LiveHome initialData={initialData} />;
  } catch {
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
