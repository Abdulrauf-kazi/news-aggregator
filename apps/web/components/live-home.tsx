"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import { NewsGraph } from "./news-graph";
import HorizonSidebar from "./horizon-sidebar-v2";
import type { StoryGraph } from "../lib/graph";
import { AnimatePresence, motion } from "framer-motion";

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

const withMetaDefaults = (payload: LivePayload): LivePayload => {
  return {
    ...payload,
    meta: {
      totalStoriesInDb: payload.meta?.totalStoriesInDb ?? 0,
      recommendations: payload.meta?.recommendations ?? [],
      recommendationReasons: payload.meta?.recommendationReasons ?? {},
      retrieval: {
        vectorBackend: payload.meta?.retrieval?.vectorBackend ?? "cosine",
        graphSeedCount: payload.meta?.retrieval?.graphSeedCount ?? 0,
      },
      fetchedAt: payload.meta?.fetchedAt,
      sessionId: payload.meta?.sessionId,
    },
  };
};

export function LiveHome({ initialData, onNewsClick }: { initialData: LivePayload, onNewsClick: (item: any) => void }) {
  const [data, setData] = useState<LivePayload>(withMetaDefaults(initialData));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const resizingRef = useRef(false);
  
  useEffect(() => {
    const handleToggle = () => setIsSidebarVisible((prev) => !prev);
    window.addEventListener("toggle-sidebar", handleToggle);

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(280, Math.min(900, window.innerWidth - e.clientX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("toggle-sidebar", handleToggle);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const getArticleUrl = useCallback((story: any) => {
    if (!story) return null;
    let url = story.url || "";
    if (!url && story.id.startsWith("http")) url = story.id;
    return url || null;
  }, []);

  const refresh = useCallback(async (force = false) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(force ? "/api/live?refresh=1" : "/api/live", {
        headers: data.meta.sessionId ? { "x-session-id": data.meta.sessionId } : undefined,
      });
      if (res.ok) {
        const json = await res.json();
        setData(withMetaDefaults(json));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [data.meta.sessionId]);

  const allStories = data.stories;
  const platformSourceIds = ["github", "x", "telegram", "polymarket"];

  const polymarketStories = useMemo(() => {
    return allStories.filter(s => 
      s.sourceIds.includes("polymarket")
    );
  }, [allStories]);

  const polymarketItems = useMemo(() => {
    return polymarketStories.slice(0, 6).map((story) => ({
      id: story.id,
      title: story.title,
      source: "@polymarket",
      score: story.score ?? 40,
      timestamp: story.timestamp,
      origin: "POLYMARKET",
      url: story.url,
    }));
  }, [polymarketStories]);

  const mainFeedStories = useMemo(() => {
    return allStories.filter(s => !s.sourceIds.some(id => platformSourceIds.includes(id)));
  }, [allStories]);

  const selectedStory = useMemo(() => {
    if (!selectedGraphNodeId) return null;
    return data.stories.find((s) => s.id === selectedGraphNodeId) || null;
  }, [selectedGraphNodeId, data.stories]);

  const openOriginal = (story: any) => {
    const url = getArticleUrl(story);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const getStorySummary = useCallback((story: StoryGraph["stories"][number]) => {
    const trimmed = story.content?.trim();
    if (trimmed) return trimmed;
    const sources = story.sourceIds?.length ? story.sourceIds.slice(0, 3).join(", ") : "Global feed";
    return `${story.title}. Topic: ${story.topic}. Sources: ${sources}.`;
  }, []);

  const recommendedStories = useMemo(() => {
    if (!data.meta.recommendations || data.meta.recommendations.length === 0) {
      return allStories.slice(0, 4).filter(s => s.id !== selectedGraphNodeId);
    }
    return data.meta.recommendations
      .map(id => allStories.find(s => s.id === id))
      .filter((s): s is any => !!s && s.id !== selectedGraphNodeId)
      .slice(0, 4);
  }, [allStories, data.meta.recommendations, selectedGraphNodeId]);

  

  return (
    <div className="min-h-screen text-[#1c1917] font-body bg-[#efefec] transition-colors duration-500">
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Main Terminal Workspace (Light/Cream) */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
            <header className="mb-10 flex justify-between items-end">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="status-dot"></span>
                  <span className="tag text-[#ff3e00]">Live Nexus</span>
                </div>
                <h1 className="font-headline text-5xl font-black text-[#1c1917] tracking-tight leading-none mb-3 uppercase">Intelligence Terminal</h1>
                <p className="text-sm text-[#57534e] font-medium uppercase tracking-[0.2em]">Semantic relationship mapping across global signal feeds.</p>
              </div>
              <button onClick={() => refresh(true)} className="px-6 py-3 bg-[#1c1917] text-white font-headline text-[10px] uppercase tracking-widest hover:bg-[#ff3e00] transition-all rounded-lg font-black shadow-lg">
                {isRefreshing ? "Synchronizing..." : "Sync Matrix"}
              </button>
            </header>

            {/* Visualizer Section */}
            <div className="grid grid-cols-12 gap-6 mb-16">
               <div className="col-span-12 bg-white border border-[#d6d3d1] rounded-[2rem] p-4 relative h-[500px] shadow-2xl overflow-hidden group">
                  <div className="absolute top-8 left-10 z-10">
                    <span className="tag bg-white border-[#d6d3d1] text-[#1c1917] font-headline text-[10px] py-2 px-4 shadow-sm">Relational Graph v2.0</span>
                  </div>
                  <div className="w-full h-full opacity-90 group-hover:opacity-100 transition-opacity">
                    <NewsGraph nodes={data.nodes} edges={data.edges} onNodeClick={(id) => {
                       setSelectedGraphNodeId(id);
                    }} />
                  </div>
               </div>
            </div>

            {/* Main Signal Grid (INTELLIGENCE POOL) */}
            <div className="mb-20">
               <div className="flex items-center justify-between mb-10 pb-4 border-b border-[#d6d3d1]">
                  <h3 className="font-headline text-[12px] text-[#1c1917] uppercase font-black tracking-[0.3em] flex items-center gap-4">
                     <span className="w-2 h-2 bg-[#ff3e00] rounded-full shadow-[0_0_10px_rgba(255,62,0,0.5)]"></span>
                     Global Intelligence Feed
                  </h3>
                  <p className="text-[10px] font-headline text-[#a8a29e] uppercase font-bold tracking-widest">{mainFeedStories.length} Global Signals Linked</p>
               </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mainFeedStories.map((story) => (
                    <article 
                      key={story.id} 
                      onClick={() => setSelectedGraphNodeId(story.id)} 
                   className="premium-card rounded-2xl p-6 cursor-pointer group flex flex-col bg-white shadow-sm border border-[#d6d3d1] hover:border-[#ff3e00] transition-all hover:shadow-xl"
                    >
                       <div className="flex justify-between items-start mb-5">
                          <span className="tag bg-[#f5f5f4] border-[#d6d3d1] text-[#57534e] text-[9px] font-black uppercase tracking-widest">{story.topic}</span>
                          <span className="text-[#a8a29e] text-[10px] font-headline font-bold">{new Date(story.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                    <div className="min-h-0">
                      <h4 className="font-headline font-bold text-[#1c1917] text-[15px] mb-2 group-hover:text-[#ff3e00] transition-colors leading-tight line-clamp-2 uppercase tracking-tight">
                        {story.title || "Signal pending classification"}
                      </h4>
                      <p className="text-[12px] text-[#57534e] line-clamp-3 leading-relaxed font-medium mb-5">
                        {getStorySummary(story)}
                      </p>
                    </div>
                       <div className="mt-auto pt-5 border-t border-[#f5f5f4] flex justify-between items-center">
                          <span className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-widest">{story.sourceIds?.[0] || "NETWORK"}</span>
                          <span className="material-symbols-outlined text-[18px] text-[#d6d3d1] group-hover:text-[#ff3e00] transition-colors">arrow_right_alt</span>
                       </div>
                    </article>
                  ))}
               </div>
            </div>
          </div>
        </main>

        {/* Intelligence Sidebar (CREAM/LIGHT UI) */}
        <AnimatePresence>
        {isSidebarVisible && (
          <>
          <div
            onMouseDown={(e) => {
              resizingRef.current = true;
              document.body.style.cursor = "col-resize";
              window.addEventListener("mousemove", (ev) => {
                if (!resizingRef.current) return;
                const newWidth = Math.max(280, Math.min(900, window.innerWidth - ev.clientX));
                setSidebarWidth(newWidth);
              });
              window.addEventListener("mouseup", () => {
                resizingRef.current = false;
                document.body.style.cursor = "";
              });
            }}
            className="z-50 bg-transparent hover:bg-[#0000000a] cursor-col-resize"
            style={{ width: 6 }}
          />

          <motion.aside 
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="bg-white border-l border-[#d6d3d1] flex flex-col z-[100] shadow-2xl"
            style={{ width: sidebarWidth }}
          >
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#fcfcfc] p-4">
              <HorizonSidebar onNewsClick={onNewsClick} />
            </div>

            <div className="p-6 bg-white border-t border-[#d6d3d1]">
              <button className="w-full py-4 bg-[#1c1917] text-white font-headline text-[11px] font-black uppercase tracking-[0.3em] rounded-xl hover:bg-[#ff3e00] transition-all shadow-xl active:scale-[0.98]">Share Intelligence Brief</button>
            </div>
          </motion.aside>
          </>
        )}
        </AnimatePresence>
      </div>

      {/* NODE ANALYSIS DETAIL VIEW (Matches Screenshot Perfectly) */}
      {selectedStory && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="node-analysis-overlay">
          <header className="analysis-header flex justify-between items-center">
             <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                   <span className="w-2.5 h-2.5 bg-[#ff3e00] rounded-full shadow-[0_0_10px_#ff3e00]"></span>
                   <span className="text-[11px] font-headline font-black text-[#ff3e00] uppercase tracking-[0.3em]">Node Analysis</span>
                </div>
                <span className="tag bg-[#f5f5f4] border-[#d6d3d1] text-[#a8a29e] text-[9px] font-black px-2 py-0.5">AI</span>
             </div>
             <div className="flex items-center gap-4">
                <button className="px-6 py-3 bg-[#ff3e00] text-white font-headline text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 shadow-lg">
                   <span className="text-[14px]">★</span> BOOKMARKED
                </button>
                <button onClick={() => openOriginal(selectedStory)} className="px-6 py-3 bg-[#1c1917] text-white font-headline text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-3 hover:bg-[#ff3e00] transition-all">
                   READ ORIGINAL <span className="material-symbols-outlined text-[14px]">north_east</span>
                </button>
                <button onClick={() => setSelectedGraphNodeId(null)} className="w-11 h-11 flex items-center justify-center bg-[#f5f5f4] border border-[#d6d3d1] rounded-xl text-[#57534e] hover:text-[#ff3e00] transition-all">
                   <span className="material-symbols-outlined">close</span>
                </button>
             </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col py-20">
             <div className="max-w-[1100px] mx-auto w-full px-12">
                <h2 className="font-headline text-[48px] font-black text-[#1c1917] leading-[1.1] tracking-tight mb-20">
                   {selectedStory.title}
                </h2>

                <div className="bg-white border-l-[6px] border-l-[#ff3e00] border border-[#d6d3d1] rounded-[2rem] p-16 shadow-2xl relative">
                   <p className="text-[10px] font-headline font-black text-[#a8a29e] uppercase tracking-[0.4em] mb-12">Primary Signal Data</p>
                   <div className="font-headline text-[22px] font-bold text-[#1c1917] leading-relaxed mb-16">
                     {getStorySummary(selectedStory)}
                   </div>
                   
                   <div className="pt-10 border-t border-[#f5f5f4] flex justify-between items-center font-headline text-[10px] text-[#a8a29e] uppercase font-bold tracking-widest">
                      <div>Ingestion Sources: {selectedStory.sourceIds?.join(", ") || "Global Stream"}</div>
                      <div>Timestamp: {new Date(selectedStory.timestamp).toLocaleString()}</div>
                   </div>
                </div>

                {/* Intelligent Recommendations */}
                <div className="mt-20">
                   <h4 className="font-headline text-[11px] text-[#1c1917] uppercase font-black tracking-[0.3em] mb-10 flex items-center gap-4">
                      <span className="w-1.5 h-1.5 bg-[#ff3e00] rounded-full"></span>
                      Intelligent Recommendations
                   </h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {recommendedStories.map(s => (
                        <div key={s.id} onClick={() => setSelectedGraphNodeId(s.id)} className="bg-white border border-[#d6d3d1] p-8 rounded-2xl cursor-pointer hover:border-[#ff3e00] transition-all shadow-sm group">
                           <div className="flex justify-between items-start mb-4">
                              <span className="text-[9px] font-headline font-black text-[#ff3e00] uppercase tracking-widest">
                                 {data.meta.recommendationReasons[s.id] ? "Contextual Match" : "Semantic Match"}
                              </span>
                              <span className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-widest">{s.topic}</span>
                           </div>
                           <h5 className="font-headline font-bold text-[14px] text-[#1c1917] line-clamp-2 uppercase tracking-tight group-hover:text-[#ff3e00] transition-colors mb-3">{s.title}</h5>
                           {data.meta.recommendationReasons[s.id] && (
                             <p className="text-[10px] text-[#57534e] italic border-l-2 border-[#ff3e00] pl-3 py-1 bg-[#fff5f2]">
                               {data.meta.recommendationReasons[s.id]}
                             </p>
                           )}
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
