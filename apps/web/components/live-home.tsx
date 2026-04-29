"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { NewsGraph } from "./news-graph";
import type { StoryGraph } from "../lib/graph";
import { RabbitLoaderScene } from "./loader/RabbitLoaderScene";
import { AnimatePresence, motion } from "framer-motion";

type LivePayload = StoryGraph & {
  meta: {
    totalStoriesInDb: number;
    recommendations: string[];
    recommendationReasons: Record<string, string>;
    retrieval: {
      vectorBackend: string;
      graphSeedCount: number;
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

export function LiveHome({ initialData }: { initialData: LivePayload }) {
  const [data, setData] = useState<LivePayload>(withMetaDefaults(initialData));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Feed"); 
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  
  const [showInitialLoader, setShowInitialLoader] = useState(true);
  const [isExitingLoader, setIsExitingLoader] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExitingLoader(true);
      const removeTimer = setTimeout(() => setShowInitialLoader(false), 800);
      return () => clearTimeout(removeTimer);
    }, 1000);

    const handleToggle = () => setIsSidebarVisible(prev => !prev);
    window.addEventListener("toggle-sidebar", handleToggle);

    return () => {
      clearTimeout(exitTimer);
      window.removeEventListener("toggle-sidebar", handleToggle);
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
  const socialSourceIds = ["github", "x", "telegram"];
  const platformSourceIds = [...socialSourceIds, "polymarket"];

  const sidebarStories = useMemo(() => {
    return allStories.filter(s => 
      s.sourceIds.some(id => socialSourceIds.includes(id)) &&
      (s.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || 
       s.content?.toLowerCase().includes(sidebarSearch.toLowerCase()))
    );
  }, [allStories, sidebarSearch]);

  const polymarketStories = useMemo(() => {
    return allStories.filter(s => 
      s.sourceIds.includes("polymarket") &&
      (s.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || 
       s.content?.toLowerCase().includes(sidebarSearch.toLowerCase()))
    );
  }, [allStories, sidebarSearch]);

  const mainFeedStories = useMemo(() => {
    return allStories.filter(s => !s.sourceIds.some(id => platformSourceIds.includes(id)));
  }, [allStories]);

  const toggleBookmark = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBookmarks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedStory = useMemo(() => {
    return allStories.find(s => s.id === selectedGraphNodeId);
  }, [allStories, selectedGraphNodeId]);

  const openOriginal = (story: any) => {
    const url = getArticleUrl(story);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

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
      <AnimatePresence>
        {showInitialLoader && (
          <motion.div
            key="initial-loader"
            className="rabbit-loader-overlay bg-[#efefec] z-[5000]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <RabbitLoaderScene isExiting={isExitingLoader} />
          </motion.div>
        )}
      </AnimatePresence>

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
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {mainFeedStories.map((story) => (
                    <article 
                      key={story.id} 
                      onClick={() => setSelectedGraphNodeId(story.id)} 
                      className="premium-card rounded-2xl p-7 cursor-pointer group flex flex-col h-full bg-white shadow-sm border border-[#d6d3d1] hover:border-[#ff3e00] transition-all hover:shadow-xl"
                    >
                       <div className="flex justify-between items-start mb-5">
                          <span className="tag bg-[#f5f5f4] border-[#d6d3d1] text-[#57534e] text-[9px] font-black uppercase tracking-widest">{story.topic}</span>
                          <span className="text-[#a8a29e] text-[10px] font-headline font-bold">{new Date(story.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                       <h4 className="font-headline font-bold text-[#1c1917] text-[16px] mb-4 group-hover:text-[#ff3e00] transition-colors leading-tight line-clamp-3 uppercase tracking-tight">{story.title}</h4>
                       <p className="text-[13px] text-[#57534e] line-clamp-5 leading-relaxed font-medium mb-6">{story.content || "Semantic data pending extraction from node network..."}</p>
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
          <motion.aside 
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-[420px] bg-white border-l border-[#d6d3d1] flex flex-col z-[100] shadow-2xl"
          >
            <div className="sidebar-tabs-horizontal">
              <button className={`sidebar-tab-h ${activeTab === "Feed" ? "active" : ""}`} onClick={() => setActiveTab("Feed")}>Feed</button>
              <button className={`sidebar-tab-h ${activeTab === "Whale Tracker" ? "active" : ""}`} onClick={() => setActiveTab("Whale Tracker")}>Whale Tracker</button>
              <button className={`sidebar-tab-h ${activeTab === "Flights" ? "active" : ""}`} onClick={() => setActiveTab("Flights")}>Flights <span className="tab-count">(8)</span></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#fcfcfc] p-4">
              {activeTab === "Feed" ? (
                <>
                  <div className="flex items-center gap-3 mb-6 px-1">
                    <div className="flex bg-[#f5f5f4] border border-[#d6d3d1] rounded-xl p-1 shadow-inner">
                       <button className="w-9 h-9 flex items-center justify-center text-[#ff3e00] bg-white rounded-lg shadow-sm border border-[#d6d3d1]"><span className="material-symbols-outlined text-[20px]">grid_view</span></button>
                       <button className="w-9 h-9 flex items-center justify-center text-[#a8a29e] hover:text-[#1c1917] transition-colors"><span className="material-symbols-outlined text-[20px]">public</span></button>
                    </div>
                    <div className="flex-1 bg-white border border-[#d6d3d1] rounded-xl flex items-center px-4 h-11 shadow-sm focus-within:border-[#ff3e00] transition-all">
                       <span className="material-symbols-outlined text-[18px] text-[#a8a29e] mr-3">search</span>
                       <input 
                         value={sidebarSearch} 
                         onChange={e => setSidebarSearch(e.target.value)} 
                         placeholder="Filter stream..." 
                         className="bg-transparent border-none text-[13px] text-[#1c1917] outline-none w-full font-headline font-bold" 
                       />
                    </div>
                  </div>

                  <div className="flex gap-2 mb-8 px-1">
                    <button className="filter-pill border-l-[#ff3e00] text-[#ff3e00] bg-white px-4 py-2 text-[10px] font-black tracking-widest uppercase">Critical</button>
                    <button className="filter-pill border-l-[#f97316] text-[#f97316] bg-white px-4 py-2 text-[10px] font-black tracking-widest uppercase">High</button>
                    <button className="filter-pill border-l-[#22c55e] text-[#22c55e] bg-white px-4 py-2 text-[10px] font-black tracking-widest uppercase">Low</button>
                  </div>

                  <div className="space-y-4">
                    {sidebarStories.map((story, i) => (
                      <article key={story.id} className="feed-card group cursor-pointer border border-[#d6d3d1] bg-white p-5 rounded-2xl hover:border-[#ff3e00] transition-all" onClick={() => setSelectedGraphNodeId(story.id)}>
                        <div className="flex items-center gap-3 mb-4">
                          <span className="source-badge font-headline">NETWORK</span>
                          <span className="impact-badge uppercase">Low</span>
                          <span className="aggregator-tag uppercase font-black">Aggregator</span>
                          <span className="text-[#a8a29e] text-[9px] font-headline ml-auto">now</span>
                        </div>
                        <h4 className="feed-card-title text-[14px] group-hover:text-[#ff3e00] transition-colors line-clamp-2 uppercase tracking-tight font-black">{story.title}</h4>
                        <p className={`feed-card-summary text-[12px] text-[#57534e] font-medium leading-relaxed mt-3 ${expandedStoryId === story.id ? '' : 'line-clamp-2'}`}>
                          {story.content || "Node analytics pending deeper semantic extraction..."}
                        </p>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setExpandedStoryId(expandedStoryId === story.id ? null : story.id); }}
                          className="text-[#ff3e00] text-[9px] font-black mt-4 uppercase tracking-[0.2em] flex items-center gap-2 hover:translate-x-1 transition-all"
                        >
                          {expandedStoryId === story.id ? 'Collapse Data' : 'Deeper Analysis'}
                          <span className="material-symbols-outlined text-[12px]">trending_flat</span>
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                 <div className="p-20 text-center text-[#a8a29e] font-headline uppercase text-[12px] tracking-[0.3em] opacity-40">System Idle...</div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-[#d6d3d1]">
              <button className="w-full py-4 bg-[#1c1917] text-white font-headline text-[11px] font-black uppercase tracking-[0.3em] rounded-xl hover:bg-[#ff3e00] transition-all shadow-xl active:scale-[0.98]">Share Intelligence Brief</button>
            </div>
          </motion.aside>
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
                      {selectedStory.content || "Semantic node data extraction successful. Intelligence markers show high correlation with network trajectories. Primary source verification complete."}
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
