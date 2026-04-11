"use client";

import { useCallback, useEffect, useState } from "react";
import { NewsGraph } from "./news-graph";
import type { StoryGraph } from "../lib/graph";

type LivePayload = StoryGraph & {
  meta: {
    cached: boolean;
    storage: string;
    plannedArchive: { bucket: string; region: string; prefix?: string } | null;
    totalStoriesInDb: number;
    sourceMetricsCount: number;
    recommendations: string[];
    recommendationReasons: Record<string, string>;
    retrieval: {
      vectorBackend: string;
      vectorCount: number;
      graphSeedCount: number;
      mode: "vector+graph" | "graph";
    };
    fetchedAt?: string;
    sessionId?: string;
  };
};

const withMetaDefaults = (payload: LivePayload): LivePayload => {
  return {
    ...payload,
    meta: {
      cached: payload.meta?.cached ?? false,
      storage: payload.meta?.storage ?? "unknown",
      plannedArchive: payload.meta?.plannedArchive ?? null,
      totalStoriesInDb: payload.meta?.totalStoriesInDb ?? 0,
      sourceMetricsCount: payload.meta?.sourceMetricsCount ?? 0,
      recommendations: payload.meta?.recommendations ?? [],
      recommendationReasons: payload.meta?.recommendationReasons ?? {},
      retrieval: {
        vectorBackend: payload.meta?.retrieval?.vectorBackend ?? "cosine",
        vectorCount: payload.meta?.retrieval?.vectorCount ?? 0,
        graphSeedCount: payload.meta?.retrieval?.graphSeedCount ?? 0,
        mode: payload.meta?.retrieval?.mode ?? "graph",
      },
      fetchedAt: payload.meta?.fetchedAt,
      sessionId: payload.meta?.sessionId,
    },
  };
};

export function LiveNewsGraphPage({
  initialData,
}: {
  initialData: LivePayload;
}) {
  const [data, setData] = useState<LivePayload>(withMetaDefaults(initialData));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(
    async (force = false) => {
      setIsRefreshing(true);
      try {
        const res = await fetch(force ? "/api/live?refresh=1" : "/api/live", {
          cache: "no-store",
          headers: data.meta.sessionId
            ? { "x-session-id": data.meta.sessionId }
            : undefined,
        });
        if (!res.ok) {
          return;
        }
        const json = (await res.json()) as LivePayload;
        setData(withMetaDefaults(json));
      } finally {
        setIsRefreshing(false);
      }
    },
    [data.meta.sessionId],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh(false);
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <main className="max-w-[1600px] mx-auto px-6 lg:px-12 py-12">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="status-dot animate-pulse"></span>
            <span className="tag">Matrix View</span>
          </div>
          <h1 className="font-headline text-4xl font-bold text-primary tracking-tight leading-none mb-3">
            RELATIONSHIP <br /> TOPOLOGY
          </h1>
          <p className="text-sm text-secondary max-w-xl font-medium">
            Dynamic story-to-story linking based on semantic overlap and temporal proximity.
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => void refresh(true)}
            className="px-6 py-3 bg-primary text-white font-headline text-xs tracking-widest uppercase transition-all hover:bg-accent"
            disabled={isRefreshing}
          >
            {isRefreshing ? "Syncing Topology..." : "Refresh Matrix"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
        <section className="md:col-span-9 bento-shell rounded-sm p-2 bg-white/30 backdrop-blur-sm">
          <div className="w-full h-[600px]">
            <NewsGraph nodes={data.nodes} edges={data.edges} />
          </div>
        </section>

        <section className="md:col-span-3 space-y-6">
          <article className="bento-shell rounded-sm p-6 bg-white">
            <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-secondary mb-4">
              Graph Density
            </p>
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-headline text-secondary mb-1">NODES</p>
                <p className="text-3xl font-headline font-bold text-primary">
                  {data.nodes.filter((node) => node.type === "story").length}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-headline text-secondary mb-1">EDGES</p>
                <p className="text-3xl font-headline font-bold text-primary">{data.edges.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-headline text-secondary mb-1">TOTAL STORIES</p>
                <p className="text-3xl font-headline font-bold text-primary">{data.meta.totalStoriesInDb}</p>
              </div>
            </div>
          </article>

          <article className="bento-shell rounded-sm p-6 bg-primary text-white">
            <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-white/60 mb-4">
              Retrieval Vector
            </p>
            <p className="text-sm font-headline font-bold text-accent uppercase mb-2">
              {data.meta.retrieval.mode}
            </p>
            <p className="text-[10px] text-white/40 font-headline leading-relaxed uppercase">
              Backend: {data.meta.retrieval.vectorBackend} <br />
              Seeds: {data.meta.retrieval.graphSeedCount} <br />
              Pool: {data.meta.retrieval.vectorCount}
            </p>
          </article>
        </section>
      </div>

      <section className="bento-shell rounded-sm p-8">
        <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-secondary mb-6">
          Neural Pathway Recommendations
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {data.meta.recommendations
            .map((storyId) => data.stories.find((story) => story.id === storyId))
            .filter((story): story is StoryGraph["stories"][number] => Boolean(story))
            .slice(0, 4)
            .map((story) => (
              <article key={story.id} className="premium-card rounded-sm p-5 group cursor-pointer border-t-2 border-t-accent">
                <p className="text-[9px] font-headline font-bold text-accent uppercase mb-2">{story.topic}</p>
                <h3 className="text-xs font-bold text-primary leading-snug line-clamp-3 mb-4 group-hover:text-accent transition-colors">
                  {story.title}
                </h3>
                <p className="text-[9px] text-secondary font-headline italic">
                  Reason: {data.meta.recommendationReasons[story.id] ?? "Topological proximity"}
                </p>
              </article>
            ))}
          {data.meta.recommendations.length === 0 && (
            <div className="col-span-full py-12 border border-dashed border-[#d6d3d1] text-center">
              <p className="text-[10px] font-headline text-secondary uppercase tracking-widest">
                Interact with the matrix to generate neural recommendations
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
