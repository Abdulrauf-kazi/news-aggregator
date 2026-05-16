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

  const [bookmarkedStories, setBookmarkedStories] = useState<Set<string>>(new Set());
  const [article, setArticle] = useState<any>(null);
  const [isArticleLoading, setIsArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  
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

  const getArticleUrl = useCallback((story: any): string | null => {
    if (!story) return null;
    // 1. Direct url field
    if (story.url && typeof story.url === "string" && story.url.startsWith("http")) {
      return story.url;
    }
    // 2. URL embedded in the story id (e.g. "story:gdelt:https://tass.com/...")
    if (story.id && typeof story.id === "string") {
      const httpMatch = story.id.match(/https?:\/\/.+/);
      if (httpMatch) return httpMatch[0];
    }
    // 3. ID itself is a URL
    if (story.id && typeof story.id === "string" && story.id.startsWith("http")) {
      return story.id;
    }
    return null;
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

  // Fetch full article when a story is selected.
  // Depend on selectedGraphNodeId (stable string) NOT selectedStory (new object ref on refresh).
  useEffect(() => {
    if (!selectedGraphNodeId) {
      setArticle(null);
      setArticleError(null);
      setIsArticleLoading(false);
      return;
    }
    const story = data.stories.find((s) => s.id === selectedGraphNodeId);
    if (!story) {
      setArticle(null);
      return;
    }
    const url = getArticleUrl(story);
    if (!url) {
      // No URL at all — show what we have, don't fetch
      setArticle(null);
      setIsArticleLoading(false);
      setArticleError(null);
      return;
    }

    let isActive = true;
    setIsArticleLoading(true);
    setArticleError(null);
    setArticle(null);

    fetch(`/api/fetch-article?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((articleData) => {
        if (!isActive) return;
        // Check if the response has usable content (html or text)
        const hasContent = (articleData.html && articleData.html.trim().length > 50) || (articleData.text && articleData.text.trim().length > 50);
        if (hasContent) {
          setArticle(articleData);
          setArticleError(null);
        } else {
          // API returned but no parseable content — set article for metadata but show error
          setArticle(articleData.finalUrl ? articleData : null);
          setArticleError(articleData.error || null);
        }
      })
      .catch((err) => {
        if (isActive) {
          setArticleError(err instanceof Error ? err.message : "Unable to load article");
          setArticle(null);
        }
      })
      .finally(() => {
        if (isActive) setIsArticleLoading(false);
      });

    return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGraphNodeId]);

  const toggleBookmark = useCallback((storyId: string) => {
    setBookmarkedStories(prev => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  }, []);

  const openOriginal = (story: any) => {
    const url = article?.finalUrl || getArticleUrl(story);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      alert("Original source URL is not available for this story.");
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

      {/* ── REDESIGNED NEWS ARTICLE READER ── */}
      {selectedStory && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="node-analysis-overlay">
          {/* ─── Sticky top bar ─── */}
          <header className="analysis-header flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={() => setSelectedGraphNodeId(null)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#f5f5f4] border border-[#d6d3d1] text-[#57534e] hover:text-[#ff3e00] hover:border-[#ff3e00] transition-all">
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <span className="bg-[#fff5f2] text-[#ff3e00] px-3 py-1 rounded-full text-[9px] font-headline font-black uppercase tracking-widest border border-[#ff3e00]/20">{selectedStory.topic}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleBookmark(selectedStory.id)} className={`px-5 py-2.5 text-white font-headline text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all ${bookmarkedStories.has(selectedStory.id) ? "bg-[#ff3e00]" : "bg-[#a8a29e] hover:bg-[#ff3e00]"}`}>
                <span className="material-symbols-outlined text-[16px]">{bookmarkedStories.has(selectedStory.id) ? "bookmark_added" : "bookmark"}</span>
                {bookmarkedStories.has(selectedStory.id) ? "Saved" : "Save"}
              </button>
              <button onClick={() => openOriginal(selectedStory)} className="px-5 py-2.5 bg-[#1c1917] text-white font-headline text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-[#ff3e00] transition-all">
                Original <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            </div>
          </header>

          {/* ─── Scrollable content ─── */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <article className="max-w-[820px] mx-auto w-full px-6 py-16">

              {/* Hero image */}
              {!isArticleLoading && article?.imageUrl && (
                <div className="mb-10 -mx-6 rounded-2xl overflow-hidden shadow-lg">
                  <img src={article.imageUrl} alt="" className="w-full object-cover max-h-[480px]" loading="lazy" />
                </div>
              )}

              {/* Title */}
              <h1 className="font-headline text-[36px] md:text-[44px] font-black text-[#1c1917] leading-[1.15] tracking-tight mb-6">
                {article?.title || selectedStory.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3 mb-10 pb-8 border-b border-[#e7e5e4]">
                {article?.siteName && <span className="text-[12px] font-headline font-bold text-[#ff3e00] uppercase tracking-wider">{article.siteName}</span>}
                {!article?.siteName && <span className="text-[12px] font-headline font-bold text-[#ff3e00] uppercase tracking-wider">{selectedStory.sourceIds?.[0] || "Signal"}</span>}
                {(article?.byline || article?.author) && <><span className="text-[#d6d3d1]">·</span><span className="text-[12px] font-body text-[#57534e]">{article.byline || article.author}</span></>}
                <span className="text-[#d6d3d1]">·</span>
                <span className="text-[12px] font-body text-[#78716c]">{article?.publishedDate ? new Date(article.publishedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : new Date(selectedStory.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                {article?.readingTime && <><span className="text-[#d6d3d1]">·</span><span className="text-[12px] font-body text-[#78716c]">{article.readingTime} min read</span></>}
              </div>

              {/* Loading state */}
              {isArticleLoading && (
                <div className="py-20 flex flex-col items-center gap-5">
                  <div className="w-10 h-10 border-[3px] border-[#ff3e00] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[12px] font-headline font-black text-[#a8a29e] uppercase tracking-[0.3em]">Loading article...</p>
                </div>
              )}

              {/* Error banner */}
              {articleError && !isArticleLoading && (
                <div className="mb-8 px-5 py-4 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-[13px] text-[#b91c1c] font-medium">
                  Could not load full article — showing available data.
                </div>
              )}

              {/* ─── Article body ─── */}
              {!isArticleLoading && (
                <div className="article-body">
                  {article?.html && article.html.trim().length > 50 ? (
                    <div className="text-[17px] font-body text-[#292524] leading-[1.85] [&_p]:mb-5 [&_h2]:font-headline [&_h2]:text-[24px] [&_h2]:font-black [&_h2]:text-[#1c1917] [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:font-headline [&_h3]:text-[20px] [&_h3]:font-bold [&_h3]:mt-8 [&_h3]:mb-3 [&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-8 [&_img]:max-w-full [&_blockquote]:border-l-4 [&_blockquote]:border-[#ff3e00] [&_blockquote]:pl-5 [&_blockquote]:my-6 [&_blockquote]:italic [&_blockquote]:text-[#57534e] [&_a]:text-[#ff3e00] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_li]:mb-2 [&_figure]:my-8 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-[#a8a29e] [&_figcaption]:mt-2 [&_video]:rounded-xl [&_video]:my-8 [&_video]:max-w-full" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.html, { USE_PROFILES: { html: true } }) }} />
                  ) : article?.text && article.text.trim().length > 50 ? (
                    <p className="text-[17px] font-body text-[#292524] leading-[1.85] whitespace-pre-wrap">{article.text}</p>
                  ) : selectedStory.content && selectedStory.content.trim().length > 50 ? (
                    <div className="text-[17px] font-body text-[#292524] leading-[1.85] [&_p]:mb-4">
                      {selectedStory.content.split('\n').filter(p => p.trim()).map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  ) : article?.description ? (
                    <p className="text-[17px] font-body text-[#57534e] leading-[1.85] mb-8 italic">{article.description}</p>
                  ) : (
                    <div>
                      <p className="text-[17px] font-body text-[#57534e] leading-[1.85] mb-8 italic">Full article content could not be extracted. View the original source for the complete story.</p>
                      <div className="grid grid-cols-2 gap-5 p-6 bg-[#fafaf9] rounded-2xl border border-[#e7e5e4]">
                        <div><p className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-[0.25em] mb-1">Topic</p><p className="text-[15px] font-headline font-bold text-[#1c1917]">{selectedStory.topic}</p></div>
                        <div><p className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-[0.25em] mb-1">Score</p><p className="text-[15px] font-headline font-bold text-[#1c1917]">{selectedStory.score}/100</p></div>
                        <div><p className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-[0.25em] mb-1">Sources</p><p className="text-[15px] font-headline font-bold text-[#1c1917]">{selectedStory.sourceIds?.join(", ")}</p></div>
                        <div><p className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-[0.25em] mb-1">Published</p><p className="text-[15px] font-headline font-bold text-[#1c1917]">{new Date(selectedStory.timestamp).toLocaleString()}</p></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Bottom actions ─── */}
              <div className="mt-12 pt-8 border-t border-[#e7e5e4] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleBookmark(selectedStory.id)} className={`px-4 py-2 rounded-lg border text-[11px] font-headline font-black uppercase tracking-widest transition-all flex items-center gap-2 ${bookmarkedStories.has(selectedStory.id) ? "bg-[#ff3e00] text-white border-[#ff3e00]" : "bg-white text-[#57534e] border-[#d6d3d1] hover:border-[#ff3e00] hover:text-[#ff3e00]"}`}>
                    <span className="material-symbols-outlined text-[16px]">{bookmarkedStories.has(selectedStory.id) ? "bookmark_added" : "bookmark"}</span>
                    {bookmarkedStories.has(selectedStory.id) ? "Saved" : "Save"}
                  </button>
                </div>
                <button onClick={() => openOriginal(selectedStory)} className="px-5 py-2.5 bg-[#1c1917] text-white font-headline text-[11px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-[#ff3e00] transition-all">
                  Read on original site <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </button>
              </div>

              {/* ─── Recommendations ─── */}
              {recommendedStories.length > 0 && (
                <div className="mt-16 pt-10 border-t border-[#e7e5e4]">
                  <h4 className="font-headline text-[11px] text-[#1c1917] uppercase font-black tracking-[0.3em] mb-8 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 bg-[#ff3e00] rounded-full" />Related Stories
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {recommendedStories.map(s => (
                      <div key={s.id} onClick={() => setSelectedGraphNodeId(s.id)} className="bg-white border border-[#e7e5e4] p-6 rounded-xl cursor-pointer hover:border-[#ff3e00] transition-all group">
                        <span className="text-[9px] font-headline font-black text-[#ff3e00] uppercase tracking-widest">{s.topic}</span>
                        <h5 className="font-headline font-bold text-[14px] text-[#1c1917] line-clamp-2 mt-2 group-hover:text-[#ff3e00] transition-colors">{s.title}</h5>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </div>
        </motion.div>
      )}
    </div>
  );
}
