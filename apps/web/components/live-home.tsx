"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

export function LiveHome({ initialData }: { initialData: LivePayload }) {
  const [data, setData] = useState<LivePayload>(withMetaDefaults(initialData));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const dwellStartRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const saved = localStorage.getItem("news-bookmarks");
    if (saved) {
      try {
        setBookmarks(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load bookmarks", e);
      }
    }
  }, []);

  const toggleBookmark = (e: React.MouseEvent, storyId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const newBookmarks = bookmarks.includes(storyId)
      ? bookmarks.filter((id) => id !== storyId)
      : [...bookmarks, storyId];
    setBookmarks(newBookmarks);
    localStorage.setItem("news-bookmarks", JSON.stringify(newBookmarks));
  };

  const sendInteraction = useCallback(
    async (event: {
      eventType: "click" | "dwell";
      storyId: string;
      topic?: string;
      dwellMs?: number;
    }) => {
      try {
        await fetch("/api/live", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(data.meta.sessionId
              ? { "x-session-id": data.meta.sessionId }
              : {}),
          },
          body: JSON.stringify(event),
        });
      } catch {
        // ignore interaction transport errors
      }
    },
    [data.meta.sessionId],
  );

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

  const stories = data.stories.slice(0, 48);
  const lead = stories[0];
  const graphNodes = data.nodes.filter((node) => node.type === "story").length;
  const recommendationStories = data.meta.recommendations
    .map((id) => data.stories.find((story) => story.id === id))
    .filter((story): story is StoryGraph["stories"][number] => Boolean(story))
    .slice(0, 4);

  return (
    <main className="max-w-[1600px] mx-auto px-6 lg:px-12 py-12">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="status-dot animate-pulse"></span>
            <span className="tag">Live Nexus</span>
          </div>
          <h1 className="font-headline text-4xl font-bold text-primary tracking-tight leading-none mb-3">
            GLOBAL INTELLIGENCE <br /> MONITOR
          </h1>
          <p className="text-sm text-secondary max-w-xl font-medium">
            Real-time cross-platform ingestion of high-fidelity feeds with 
            semantic relationship mapping.
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => void refresh(true)}
            className="group relative px-6 py-3 bg-primary text-white font-headline text-xs tracking-widest uppercase transition-all hover:bg-accent"
            disabled={isRefreshing}
          >
            <span className="relative z-10">
              {isRefreshing ? "Synchronizing..." : "Refresh Matrix"}
            </span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[300px_220px_auto] gap-6">
        {/* Intro & Stats Panel */}
        <article className="lg:col-span-3 lg:row-span-1 bento-shell rounded-2xl p-6 flex flex-col justify-between overflow-hidden">
          <div>
            <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-secondary mb-4">
              Network Telemetry
            </p>
            <div className="grid grid-cols-2 gap-px bg-[#d6d3d1] border border-[#d6d3d1] rounded-lg overflow-hidden">
              <div className="bg-white p-4">
                <p className="text-[9px] font-headline text-secondary mb-1">STREAMS</p>
                <p className="text-2xl font-headline font-bold text-primary">{data.stories.length}</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-[9px] font-headline text-secondary mb-1">ARCHIVE</p>
                <p className="text-2xl font-headline font-bold text-primary">{data.meta.totalStoriesInDb}</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-[9px] font-headline text-secondary mb-1">NODES</p>
                <p className="text-2xl font-headline font-bold text-primary">{graphNodes}</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-[9px] font-headline text-secondary mb-1">EDGES</p>
                <p className="text-2xl font-headline font-bold text-primary">{data.edges.length}</p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-[#d6d3d1]">
            <p className="text-[9px] font-headline text-secondary mb-3 uppercase">System Status</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-secondary uppercase">Vector Backend</span>
                <span className="font-headline font-bold">{data.meta.retrieval.vectorBackend}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-secondary uppercase">Graph Seeds</span>
                <span className="font-headline font-bold">{data.meta.retrieval.graphSeedCount}</span>
              </div>
            </div>
          </div>
        </article>

        {/* Visualizer Panel */}
        <section className="lg:col-span-6 lg:row-span-2 bento-shell rounded-2xl p-2 group relative overflow-hidden">
          <div className="absolute top-6 left-6 z-10 pointer-events-none">
            <span className="tag">Graph Matrix v2.0</span>
          </div>
          <div className="w-full h-full bg-white/50 backdrop-blur-sm">
            <NewsGraph nodes={data.nodes} edges={data.edges} />
          </div>
          <div className="absolute bottom-6 right-6 z-10">
            <Link
              href="/news-graph"
              className="px-4 py-2 bg-white border border-[#d6d3d1] font-headline text-[10px] uppercase tracking-wider hover:bg-primary hover:text-white transition-colors rounded-lg shadow-sm"
            >
              Full Visualizer
            </Link>
          </div>
        </section>

        {/* Pulse Panel */}
        <article className="lg:col-span-3 lg:row-span-1 bento-shell rounded-2xl p-6 flex flex-col justify-between overflow-hidden">
          <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-secondary mb-4">
            Topic Density
          </p>
          <div className="space-y-3 flex-grow flex flex-col justify-center">
            {Array.from(
              stories.reduce((acc, story) => {
                acc.set(story.topic, (acc.get(story.topic) ?? 0) + 1);
                return acc;
              }, new Map<string, number>()),
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([topic, count]) => (
                <div key={topic} className="group cursor-default">
                  <div className="flex items-end justify-between mb-1.5">
                    <span className="text-[10px] font-headline font-bold uppercase tracking-tight text-primary">
                      {topic}
                    </span>
                    <span className="text-[9px] font-headline text-secondary">{count}</span>
                  </div>
                  <div className="h-1 bg-[#d6d3d1] w-full rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent transition-all duration-500 rounded-full" 
                      style={{ width: `${(count / stories.length) * 300}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </article>

        {/* Lead Story Panel */}
        <article className="lg:col-span-3 lg:row-span-1 bento-shell rounded-2xl p-6 bg-white border-l-4 border-l-accent flex flex-col justify-center overflow-hidden">
          <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-accent font-bold mb-3">
            Priority Alert
          </p>
          <h2 className="font-headline text-lg text-primary font-bold leading-tight mb-4 line-clamp-3">
            {lead?.title ?? "Awaiting Signal..."}
          </h2>
          <div className="space-y-3 mt-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="tag text-[8px]">{lead?.topic ?? "Unknown"}</span>
              <span className="text-[9px] text-secondary uppercase tracking-tighter">
                {(lead?.sourceIds ?? []).slice(0, 2).join(" • ")}
              </span>
            </div>
            <p className="text-[10px] text-secondary font-headline">
              Timestamp: {data.meta.fetchedAt ? new Date(data.meta.fetchedAt).toLocaleTimeString() : "Pending"}
            </p>
          </div>
        </article>

        {/* Recommendations Panel */}
        <article className="lg:col-span-3 lg:row-span-1 bento-shell rounded-2xl p-6 bg-primary text-white flex flex-col justify-center overflow-hidden">
          <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-white/60 mb-4">
            Neural Matches
          </p>
          <div className="space-y-4 flex-grow flex flex-col justify-center">
            {recommendationStories.slice(0, 2).map((story) => (
              <div key={story.id} className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
                <p className="text-[8px] font-headline text-accent uppercase mb-1.5">Confidence: High</p>
                <h4 className="text-[10px] font-bold leading-relaxed mb-2 line-clamp-2">{story.title}</h4>
                <p className="text-[8px] text-white/40 italic line-clamp-1">
                  {data.meta.recommendationReasons[story.id] ?? "Graph overlap detected"}
                </p>
              </div>
            ))}
            {recommendationStories.length === 0 && (
              <p className="text-[10px] text-white/40 font-headline uppercase">Initializing engine...</p>
            )}
          </div>
        </article>

        {/* Stories Feed Panel */}
        <article className="lg:col-span-12 lg:row-span-1 bento-shell rounded-2xl p-8 flex flex-col mt-2">
          <div className="flex items-center justify-between mb-8">
            <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-secondary">
              Latest Ingestions
            </p>
            <Link href="/bookmarks" className="tag hover:bg-accent hover:text-white transition-colors">
              Saved {bookmarks.length > 0 ? `(${bookmarks.length})` : ''}
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 auto-rows-[140px] grid-flow-dense">
            {stories.slice(1).map((story, i) => {
              const pattern = i % 12;
              const isHero = pattern === 0 || pattern === 7;
              const isTall = pattern === 1 || pattern === 4 || pattern === 9;
              const isWide = pattern === 2 || pattern === 6 || pattern === 10;
              
              let colSpan = "col-span-1";
              let rowSpan = "row-span-1";
              
              if (isHero) {
                colSpan = "md:col-span-2 lg:col-span-2 xl:col-span-2";
                rowSpan = "row-span-2";
              } else if (isTall) {
                colSpan = "col-span-1";
                rowSpan = "row-span-2";
              } else if (isWide) {
                colSpan = "md:col-span-2 lg:col-span-2 xl:col-span-2";
                rowSpan = "row-span-1";
              }
              
              return (
                <article
                  key={story.id}
                  className={`premium-card rounded-2xl p-5 group cursor-pointer flex flex-col justify-between hover:scale-[1.02] transition-transform ${colSpan} ${rowSpan}`}
                  onClick={() => void sendInteraction({ eventType: "click", storyId: story.id, topic: story.topic })}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-headline font-bold text-accent uppercase tracking-wider">{story.topic}</p>
                    <button 
                      onClick={(e) => toggleBookmark(e, story.id)}
                      className={`text-[16px] leading-none transition-all hover:scale-125 ${bookmarks.includes(story.id) ? 'text-accent' : 'text-[#d6d3d1] hover:text-secondary'}`}
                    >
                      {bookmarks.includes(story.id) ? '★' : '☆'}
                    </button>
                  </div>
                  <div>
                    <h3 className={`font-bold text-primary leading-snug group-hover:text-accent transition-colors ${isHero ? 'text-xl line-clamp-2 mb-2' : 'text-sm line-clamp-2 mb-1'}`}>
                      {story.title}
                    </h3>
                    <p className={`text-secondary text-xs opacity-80 ${isHero ? 'line-clamp-3' : 'line-clamp-2'}`}>
                      {story.content ? story.content : `New intel regarding ${story.topic} detected from ${story.sourceIds?.join(', ') || 'multiple sources'}. Semantic analysis suggests high relevance to ongoing trends.`}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between opacity-60">
                     <span className="text-[10px] uppercase font-headline">{(story.sourceIds ?? [])[0] ?? 'Feed'}</span>
                     <span className="text-[10px] font-headline">{data.meta.fetchedAt ? new Date(data.meta.fetchedAt).toLocaleTimeString() : 'Now'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      </div>
    </main>
  );
}
