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
  const getStorySummary = (story: StoryGraph["stories"][number]) => {
    const trimmed = story.content?.trim();
    if (trimmed) return trimmed;
    const sources = story.sourceIds?.length ? story.sourceIds.slice(0, 3).join(", ") : "Global feed";
    return `${story.title}. Topic: ${story.topic}. Sources: ${sources}.`;
  };
  const [data, setData] = useState<LivePayload>(withMetaDefaults(initialData));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [localSessionId] = useState(() => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const activeSessionId = data.meta.sessionId || localSessionId;

  const refresh = useCallback(
    async (force = false) => {
      setIsRefreshing(true);
      try {
        const res = await fetch(force ? "/api/live?refresh=1" : "/api/live", {
          cache: "no-store",
          headers: activeSessionId
            ? { "x-session-id": activeSessionId }
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
    [activeSessionId],
  );

  const handleNodeClick = useCallback(async (nodeId: string) => {
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "story") return;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (activeSessionId) {
        headers["x-session-id"] = activeSessionId;
      }
      
      const response = await fetch("/api/live", {
        method: "POST",
        headers,
        body: JSON.stringify({
          eventType: "click",
          storyId: nodeId,
          topic: node.topic,
        }),
      });
      
      if (!response.ok) {
        console.error("POST /api/live failed with status", response.status);
      }
      
      // Refresh to fetch new recommendations
      void refresh(false);
    } catch (e) {
      console.error("Failed to record interaction", e);
    }
  }, [data.nodes, activeSessionId, refresh]);

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
            <span className="status-dot"></span>
            <span className="tag text-[#ff3e00]">Matrix View</span>
          </div>
          <h1 className="font-headline text-5xl font-black text-[#1c1917] tracking-tight leading-none mb-3 uppercase">
            RELATIONSHIP <br /> TOPOLOGY
          </h1>
          <p className="text-sm text-[#57534e] max-w-xl font-medium uppercase tracking-[0.2em]">
            Dynamic story-to-story linking based on semantic overlap and temporal proximity.
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => void refresh(true)}
            className="px-6 py-3 bg-[#1c1917] text-white font-headline text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[#ff3e00] rounded-lg shadow-lg"
            disabled={isRefreshing}
          >
            {isRefreshing ? "Syncing Topology..." : "Refresh Matrix"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 auto-rows-[160px] gap-6 mb-8">
        <section className="md:col-span-8 md:row-span-3 bento-shell rounded-[2rem] p-4 bg-white shadow-xl overflow-hidden">
          <div className="w-full h-full min-h-[520px]">
            <NewsGraph nodes={data.nodes} edges={data.edges} onNodeClick={handleNodeClick} />
          </div>
        </section>

        <article className="md:col-span-4 md:row-span-1 bento-shell rounded-2xl p-6 shadow-sm">
          <p className="font-headline text-[10px] uppercase tracking-[0.3em] text-[#a8a29e] font-black mb-4">
            Graph Density
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] font-headline text-[#57534e] font-bold uppercase tracking-widest mb-1">NODES</p>
              <p className="text-3xl font-headline font-black text-[#1c1917]">
                {data.nodes.filter((node) => node.type === "story").length}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-headline text-[#57534e] font-bold uppercase tracking-widest mb-1">EDGES</p>
              <p className="text-3xl font-headline font-black text-[#1c1917]">{data.edges.length}</p>
            </div>
          </div>
        </article>

        <article className="md:col-span-4 md:row-span-1 bento-shell rounded-2xl p-6 shadow-sm">
          <p className="font-headline text-[10px] uppercase tracking-[0.3em] text-[#a8a29e] font-black mb-4">
            Signal Streams
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] font-headline text-[#57534e] font-bold uppercase tracking-widest mb-1">STORIES</p>
              <p className="text-3xl font-headline font-black text-[#1c1917]">{data.meta.totalStoriesInDb}</p>
            </div>
            <div>
              <p className="text-[9px] font-headline text-[#57534e] font-bold uppercase tracking-widest mb-1">SOURCES</p>
              <p className="text-3xl font-headline font-black text-[#1c1917]">{data.meta.sourceMetricsCount}</p>
            </div>
          </div>
        </article>

        <article className="md:col-span-4 md:row-span-1 rounded-2xl p-6 bg-[#1c1917] text-white shadow-xl border-none">
          <p className="font-headline text-[10px] uppercase tracking-[0.3em] text-white/50 font-black mb-4">
            Retrieval Vector
          </p>
          <p className="text-[11px] font-headline font-black text-[#ff3e00] uppercase mb-3 tracking-widest">
            {data.meta.retrieval.mode}
          </p>
          <div className="space-y-1">
            <p className="text-[10px] text-white/60 font-headline leading-relaxed uppercase font-bold">
              Backend: <span className="text-white">{data.meta.retrieval.vectorBackend}</span>
            </p>
            <p className="text-[10px] text-white/60 font-headline leading-relaxed uppercase font-bold">
              Seeds: <span className="text-white">{data.meta.retrieval.graphSeedCount}</span>
            </p>
            <p className="text-[10px] text-white/60 font-headline leading-relaxed uppercase font-bold">
              Pool: <span className="text-white">{data.meta.retrieval.vectorCount}</span>
            </p>
          </div>
        </article>
      </div>

      <section className="bento-shell rounded-[2rem] p-10 shadow-sm">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#f5f5f4]">
           <h3 className="font-headline text-[11px] text-[#1c1917] uppercase font-black tracking-[0.3em] flex items-center gap-4">
              <span className="w-2 h-2 bg-[#ff3e00] rounded-full shadow-[0_0_10px_rgba(255,62,0,0.5)]"></span>
              Neural Pathway Recommendations
           </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
          {data.meta.recommendations
            .map((storyId) => data.stories.find((story) => story.id === storyId))
            .filter((story): story is StoryGraph["stories"][number] => Boolean(story))
            .slice(0, 4)
            .map((story) => (
              <article key={story.id} className="premium-card rounded-2xl p-6 group cursor-pointer border-l-4 border-l-[#ff3e00] shadow-sm hover:shadow-xl transition-all">
                <div className="flex justify-between items-start mb-4">
                   <span className="text-[9px] font-headline font-black text-[#ff3e00] uppercase tracking-widest">{story.topic}</span>
                   <span className="material-symbols-outlined text-[14px] text-[#d6d3d1] group-hover:text-[#ff3e00]">hub</span>
                </div>
                <h3 className="text-[14px] font-headline font-bold text-[#1c1917] leading-tight line-clamp-3 mb-4 group-hover:text-[#ff3e00] transition-colors uppercase tracking-tight">
                  {story.title}
                </h3>
                <p className="text-[12px] text-[#57534e] leading-relaxed line-clamp-3 mb-4">
                  {getStorySummary(story)}
                </p>
                {data.meta.recommendationReasons[story.id] && (
                  <p className="text-[10px] text-[#57534e] font-headline font-bold leading-relaxed border-t border-[#f5f5f4] pt-3">
                    {data.meta.recommendationReasons[story.id]}
                  </p>
                )}
              </article>
            ))}
          {data.meta.recommendations.length === 0 && (
            <div className="col-span-full py-20 border border-dashed border-[#d6d3d1] rounded-2xl text-center bg-[#fbfbf9]">
              <p className="text-[10px] font-headline text-[#a8a29e] font-black uppercase tracking-[0.3em]">
                Interact with the matrix to generate neural recommendations
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
