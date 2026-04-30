"use client";

import { Suspense, useState } from "react";
import { LiveHome } from "../components/live-home";
import NewsModal, { type NewsModalItem } from "../components/NewsModal/NewsModal";
import type { StoryGraph } from "../lib/graph";

type LivePayload = StoryGraph & {
    meta: {
      cached?: boolean;
      storage?: string;
      plannedArchive?: { bucket: string; region: string; prefix?: string } | null;
      totalStoriesInDb: number;
      sourceMetricsCount?: number;
      recommendations: string[];
      recommendationReasons: Record<string, string>;
      retrieval: {
        vectorBackend: string;
        vectorCount?: number;
        graphSeedCount: number;
        mode?: "vector+graph" | "graph";
      };
      fetchedAt?: string;
      sessionId?: string;
    };
  };

export default function HomeClient({ initialData }: { initialData: LivePayload }) {
  const [selectedNews, setSelectedNews] = useState<NewsModalItem | null>(null);

  const handleNewsClick = (item: NewsModalItem) => {
    setSelectedNews(item);
  };

  const handleCloseModal = () => {
    setSelectedNews(null);
  };

  return (
    <Suspense fallback={null}>
      <LiveHome initialData={initialData} onNewsClick={handleNewsClick} />
      <NewsModal item={selectedNews} onClose={handleCloseModal} />
    </Suspense>
  );
}
