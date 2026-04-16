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
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [fullArticle, setFullArticle] = useState<{ 
    html: string; text: string; imageUrl?: string; 
    author?: string; publishedDate?: string; readingTime?: number; 
    siteName?: string; finalUrl?: string; byline?: string;
  } | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  
  // Loader states for interactive transition
  const [showInitialLoader, setShowInitialLoader] = useState(true);
  const [isExitingLoader, setIsExitingLoader] = useState(false);

  useEffect(() => {
    // Sequence the loader exit
    const exitTimer = setTimeout(() => {
      setIsExitingLoader(true);
      const removeTimer = setTimeout(() => {
        setShowInitialLoader(false);
      }, 1000); // Wait for exit animation to complete
      return () => clearTimeout(removeTimer);
    }, 1800); // Show loader for a bit to ensure it's seen

    return () => clearTimeout(exitTimer);
  }, []);

  const connectedStories = useMemo(() => {
    if (!selectedGraphNodeId) return [];
    const neighbors = new Set<string>([selectedGraphNodeId]);
    for (const edge of data.edges) {
      if (edge.from === selectedGraphNodeId) neighbors.add(edge.to);
      if (edge.to === selectedGraphNodeId) neighbors.add(edge.from);
    }
    // Filter stories from original array to keep order/full data
    return data.stories.filter((s) => neighbors.has(s.id));
  }, [selectedGraphNodeId, data.edges, data.stories]);

  const mainStory = connectedStories.find((s: StoryGraph["stories"][number]) => s.id === selectedGraphNodeId);
  const neighborStories = connectedStories.filter((s: StoryGraph["stories"][number]) => s.id !== selectedGraphNodeId);

  const getArticleUrl = useCallback((story: StoryGraph["stories"][number]) => {
    if (!story) return null;
    let url = "";
    if (story.url && /^https?:\/\//.test(story.url)) {
      url = story.url;
    } else {
      const urlMatch = story.id.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        url = urlMatch[0];
      }
    }

    if (url) {
      const utm = "utm_source=newsmonitor&utm_medium=referral&utm_campaign=intel";
      return url.includes("?") ? `${url}&${utm}` : `${url}?${utm}`;
    }
    return null;
  }, []);

  // Derive an actionable URL for the main story
  const articleUrl = useMemo(() => {
    return mainStory ? getArticleUrl(mainStory) : null;
  }, [mainStory, getArticleUrl]);

  useEffect(() => {
    let active = true;
    if (selectedGraphNodeId && articleUrl) {
      setIsLoadingArticle(true);
      setFullArticle(null);
      fetch(`/api/fetch-article?url=${encodeURIComponent(articleUrl)}`)
        .then(res => res.json())
        .then(res => {
           if (active && (res.text || res.html)) {
             setFullArticle({
               html: res.html,
               text: res.text,
               imageUrl: res.imageUrl,
               author: res.byline || res.author,
               publishedDate: res.publishedDate,
               readingTime: res.readingTime,
               siteName: res.siteName,
               finalUrl: res.finalUrl,
               byline: res.byline,
             });
           }
        })
        .catch(e => console.error(e))
        .finally(() => {
          if (active) setIsLoadingArticle(false);
        });
    } else {
      setFullArticle(null);
    }
    return () => { active = false; };
  }, [selectedGraphNodeId, articleUrl]);

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

  const stories = data.stories.slice(0, 80);
  const lead = stories[0];
  const graphNodes = data.nodes.filter((node) => node.type === "story").length;
  const recommendationStories = data.meta.recommendations
    .map((id) => data.stories.find((story) => story.id === id))
    .filter((story): story is StoryGraph["stories"][number] => Boolean(story))
    .slice(0, 15);

  return (
    <>
      <AnimatePresence>
        {showInitialLoader && (
          <motion.div
            key="initial-loader"
            className="rabbit-loader-overlay"
            style={{ zIndex: 10000 }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(12px)" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <RabbitLoaderScene isExiting={isExitingLoader} />
          </motion.div>
        )}
      </AnimatePresence>

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
            <NewsGraph nodes={data.nodes} edges={data.edges} onNodeClick={setSelectedGraphNodeId} />
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
        <article className="lg:col-span-3 lg:row-span-1 bento-shell rounded-2xl p-6 bg-white border-l-4 border-l-accent flex flex-col justify-center overflow-hidden group">
          <div className="flex justify-between items-center mb-3">
            <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-accent font-bold">
              Priority Alert
            </p>
            {lead && getArticleUrl(lead) && (
              <a 
                href={getArticleUrl(lead) ?? "#"} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#f5f5f4] border border-[#d6d3d1] text-secondary hover:text-accent hover:border-accent transition-all text-[9px] font-headline uppercase font-bold"
                title="Open Original"
              >
                Open Site
                <span className="text-[12px]">↗</span>
              </a>
            )}
          </div>
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
        <article className="lg:col-span-3 lg:row-span-1 bento-shell rounded-2xl p-6 bg-[#fafaf9] border border-[#d6d3d1] flex flex-col justify-center overflow-hidden">
          <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-4">
            Neural Matches
          </p>
          <div className="space-y-4 flex-grow flex flex-col justify-center">
            {recommendationStories.slice(0, 2).map((story) => (
              <div key={story.id} className="border-b border-[#e7e5e4] pb-3 last:border-0 last:pb-0 group" onClick={() => setSelectedGraphNodeId(story.id)}>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[8px] font-headline text-accent uppercase font-bold">Confidence: High</p>
                  {getArticleUrl(story) && (
                    <a 
                      href={getArticleUrl(story) ?? "#"} 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-secondary hover:text-accent transition-colors text-[8px] font-headline uppercase font-bold"
                      title="Open Source"
                    >
                      Open Site
                      <span className="text-[10px]">↗</span>
                    </a>
                  )}
                </div>
                <h4 className="text-[10px] font-bold leading-relaxed mb-2 line-clamp-2 text-primary group-hover:text-accent transition-colors cursor-pointer">{story.title}</h4>
                <p className="text-[8px] text-secondary italic line-clamp-1 opacity-70">
                  {data.meta.recommendationReasons[story.id] ?? "Graph overlap detected"}
                </p>
              </div>
            ))}
            {recommendationStories.length === 0 && (
              <p className="text-[10px] text-secondary font-headline uppercase opacity-50">Initializing engine...</p>
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
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-6 space-y-6">
            {stories.slice(1).map((story, i) => {
              const isHighlight = i === 0 || i === 5 || i === 12; // occasionally highlight some blocks
              
              return (
                <article
                  key={story.id}
                  className={`premium-card rounded-2xl p-5 md:p-6 group cursor-pointer flex flex-col justify-between hover:scale-[1.02] transition-transform break-inside-avoid w-full border ${isHighlight ? 'border-accent bg-[#fffdfc]' : 'border-[#d6d3d1]'}`}
                  onClick={() => {
                    void sendInteraction({ eventType: "click", storyId: story.id, topic: story.topic });
                    setSelectedGraphNodeId(story.id);
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <p className={`text-[10px] font-headline font-bold uppercase tracking-wider ${isHighlight ? 'text-accent' : 'text-primary'}`}>{story.topic}</p>
                    <button 
                      onClick={(e) => toggleBookmark(e, story.id)}
                      className={`text-[16px] leading-none transition-all hover:scale-125 ${bookmarks.includes(story.id) ? 'text-accent' : 'text-[#a8a29e] hover:text-primary'}`}
                    >
                      {bookmarks.includes(story.id) ? '★' : '☆'}
                    </button>
                  </div>
                  <div className="mb-4">
                    <h3 className={`font-bold text-primary leading-snug group-hover:text-accent transition-colors mb-2.5 ${isHighlight ? 'text-xl' : 'text-base'}`}>
                      {story.title}
                    </h3>
                    <p className="text-secondary text-[12px] opacity-85 leading-relaxed">
                      {story.content ? story.content : `New intel regarding ${story.topic} detected from ${story.sourceIds?.join(', ') || 'multiple sources'}. Semantic analysis suggests high relevance to ongoing trends.`}
                    </p>
                  </div>
                  <div className="mt-auto pt-3 border-t border-[#e7e5e4] flex items-center justify-between">
                     <div className="flex items-center gap-2 opacity-70">
                        <span className="text-[9px] uppercase font-headline font-semibold">{(story.sourceIds ?? [])[0] ?? 'Feed'}</span>
                        <span className="text-[10px] font-headline">·</span>
                        <span className="text-[9px] font-headline">{data.meta.fetchedAt ? new Date(data.meta.fetchedAt).toLocaleTimeString() : 'Now'}</span>
                     </div>
                     {getArticleUrl(story) && (
                       <a 
                         href={getArticleUrl(story) ?? "#"} 
                         target="_blank" 
                         rel="noreferrer"
                         onClick={(e) => e.stopPropagation()}
                         className="px-2.5 py-1.5 flex items-center gap-1 rounded-md bg-[#f5f5f4] text-secondary hover:bg-accent hover:text-white transition-all shadow-sm text-[8px] font-headline uppercase font-bold"
                         title="Open Original Site"
                       >
                         Open Site
                         <span className="text-[12px] leading-none">↗</span>
                       </a>
                     )}
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      </div>

      {/* Article Detail View — Medium-style */}
      {selectedGraphNodeId && mainStory && (
        <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-300 bg-white">
          {/* Main Content (Center) */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {/* Minimal top bar */}
            <header className="px-6 lg:px-10 py-4 border-b border-[#e7e5e4] bg-white sticky top-0 z-10 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setSelectedGraphNodeId(null)}
                  className="flex items-center gap-2 text-secondary hover:text-primary transition-colors text-sm"
                >
                  <span className="text-lg">←</span>
                  <span className="font-headline text-[11px] uppercase tracking-wider font-bold hidden sm:inline">Back to Feed</span>
                </button>
                <span className="w-px h-6 bg-[#e7e5e4] hidden sm:block"></span>
                <span className="tag text-[8px]">{mainStory.topic}</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => toggleBookmark(e, mainStory.id)}
                  className={`px-3 py-1.5 border text-[10px] font-headline uppercase tracking-wider rounded-full transition-colors flex items-center gap-1.5 ${bookmarks.includes(mainStory.id) ? 'bg-accent text-white border-accent' : 'bg-white text-secondary border-[#d6d3d1] hover:border-accent hover:text-accent'}`}
                >
                  {bookmarks.includes(mainStory.id) ? '★ Saved' : '☆ Save'}
                </button>
                {articleUrl && (
                  <a 
                    href={fullArticle?.finalUrl || articleUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-primary text-white text-[10px] font-headline uppercase tracking-wider rounded-full hover:bg-accent transition-colors flex items-center gap-1.5"
                  >
                    Original ↗
                  </a>
                )}
                <button 
                  onClick={() => setSelectedGraphNodeId(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f4] text-secondary hover:text-accent hover:bg-[#e7e5e4] transition-all text-sm"
                >
                  ✕
                </button>
              </div>
            </header>
            
            {/* Scrollable article body */}
            <div className="flex-grow overflow-y-auto">
              <article className="max-w-[720px] mx-auto px-6 lg:px-0 py-10">
                {/* Article Header */}
                <header className="mb-8">
                  <h1 className="text-[32px] sm:text-[40px] font-bold text-[#242424] leading-[1.2] tracking-[-0.01em] mb-6" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                    {mainStory.title}
                  </h1>
                  
                  {/* Author / Meta bar */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/80 to-accent flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {(fullArticle?.author || fullArticle?.siteName || mainStory.sourceIds[0] || 'N').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#242424]">
                        {fullArticle?.author || fullArticle?.byline || fullArticle?.siteName || mainStory.sourceIds.join(' · ')}
                      </p>
                      <div className="flex items-center gap-2 text-[13px] text-[#6b6b6b] mt-0.5">
                        {fullArticle?.readingTime && (
                          <>
                            <span>{fullArticle.readingTime} min read</span>
                            <span>·</span>
                          </>
                        )}
                        <span>
                          {fullArticle?.publishedDate 
                            ? new Date(fullArticle.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : new Date(mainStory.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          }
                        </span>
                        {fullArticle?.siteName && (
                          <>
                            <span>·</span>
                            <span className="text-accent">{fullArticle.siteName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-[#e7e5e4]"></div>
                </header>

                {/* Hero Image */}
                {fullArticle?.imageUrl && (
                  <figure className="mb-10 -mx-6 lg:-mx-16">
                    <img 
                      src={fullArticle.imageUrl} 
                      alt={mainStory.title}
                      className="w-full max-h-[480px] object-cover"
                    />
                  </figure>
                )}

                {/* Article Body */}
                <div className="article-body">
                  {isLoadingArticle ? (
                    <div className="space-y-6 animate-pulse">
                      <div className="space-y-3">
                        <div className="h-4 bg-[#f0f0f0] rounded w-full"></div>
                        <div className="h-4 bg-[#f0f0f0] rounded w-[95%]"></div>
                        <div className="h-4 bg-[#f0f0f0] rounded w-[88%]"></div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-4 bg-[#f0f0f0] rounded w-full"></div>
                        <div className="h-4 bg-[#f0f0f0] rounded w-[92%]"></div>
                        <div className="h-4 bg-[#f0f0f0] rounded w-[80%]"></div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-4 bg-[#f0f0f0] rounded w-[96%]"></div>
                        <div className="h-4 bg-[#f0f0f0] rounded w-full"></div>
                        <div className="h-4 bg-[#f0f0f0] rounded w-[70%]"></div>
                      </div>
                      <p className="text-center text-sm text-[#6b6b6b] mt-8">
                        Loading article content...
                      </p>
                    </div>
                  ) : fullArticle?.html ? (
                    <div 
                      className="article-prose"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(fullArticle.html, { ADD_TAGS: ['figure', 'figcaption'], ADD_ATTR: ['loading'] }) }}
                    />
                  ) : fullArticle?.text ? (
                    <div className="article-prose">
                      {fullArticle.text.split('\n\n').filter(Boolean).map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 px-8">
                      <div className="inline-block w-16 h-px bg-accent mb-8"></div>
                      <blockquote className="text-xl sm:text-2xl text-[#242424] leading-relaxed mb-6 max-w-lg mx-auto" style={{ fontFamily: "'Georgia', serif" }}>
                        {mainStory.content || `A signal regarding ${mainStory.topic} detected across ${mainStory.sourceIds.length} sources.`}
                      </blockquote>
                      <div className="inline-block w-16 h-px bg-accent mb-8"></div>
                      <p className="text-[13px] text-[#6b6b6b] max-w-md mx-auto">
                        Full article text could not be extracted from the original source. 
                        Click <strong>&quot;Original&quot;</strong> above to read on the publisher&apos;s site.
                      </p>
                    </div>
                  )}
                </div>

                {/* Article Footer */}
                <footer className="mt-12 pt-8 border-t border-[#e7e5e4]">
                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    <span className="text-[11px] font-headline uppercase tracking-wider text-[#6b6b6b]">Sources:</span>
                    {mainStory.sourceIds.map(src => (
                      <span key={src} className="px-3 py-1 bg-[#f5f5f4] text-[11px] font-medium text-[#6b6b6b] rounded-full border border-[#e7e5e4]">{src}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#6b6b6b]">
                    <span>Intelligence Score: {Math.round(mainStory.score)}%</span>
                    <span>Connected Signals: {neighborStories.length}</span>
                  </div>
                </footer>
              </article>
            </div>
          </div>
          
          {/* Related News Sidebar */}
          <aside className="w-full max-w-[380px] bg-[#fafaf9] h-full flex flex-col border-l border-[#e7e5e4] relative z-20 flex-shrink-0 hidden lg:flex">
             <header className="px-6 py-6 border-b border-[#e7e5e4] bg-white">
                <p className="text-sm font-bold text-[#242424]">Related Signals</p>
                <p className="text-[12px] text-[#6b6b6b] mt-1">{neighborStories.length} connected in network</p>
             </header>
             <div className="flex-grow overflow-y-auto p-4 space-y-3">
                {neighborStories.length > 0 ? neighborStories.map((story: StoryGraph["stories"][number]) => (
                    <article key={story.id} className="p-4 rounded-xl cursor-pointer bg-white hover:bg-[#f5f5f4] border border-[#e7e5e4] transition-all hover:border-accent hover:-translate-y-0.5 shadow-sm" onClick={() => setSelectedGraphNodeId(story.id)}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{story.topic}</span>
                        <span className="text-[10px] text-[#6b6b6b]">{new Date(story.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <h4 className="text-[13px] font-bold text-[#242424] leading-snug mb-2 line-clamp-3 hover:text-accent transition-colors">
                        {story.title}
                      </h4>
                      <p className="text-[11px] text-[#6b6b6b] line-clamp-2">
                        {story.content || `Signal regarding ${story.topic}.`}
                      </p>
                    </article>
                  )) : (
                    <div className="text-center py-12 px-6">
                       <p className="text-sm text-[#6b6b6b]">No connected signals found.</p>
                       <p className="text-[12px] text-[#6b6b6b] opacity-60 mt-1">This node is isolated in the graph.</p>
                    </div>
                  )}
             </div>
          </aside>
        </div>
      )}
    </main>
    </>
  );
}
