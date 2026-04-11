import { LiveNewsGraphPage } from "../../components/live-news-graph-page";
import { createStoryGraph } from "../../lib/graph";
import { getGraphSnapshot } from "../../lib/graph-service";

export const dynamic = "force-dynamic";

export default async function NewsGraphPage() {
  try {
    const initialData = await getGraphSnapshot();
    return <LiveNewsGraphPage initialData={initialData} />;
  } catch {
    const fallback = createStoryGraph(42);
    return (
      <LiveNewsGraphPage
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
