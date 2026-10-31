"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { NewsGraph } from "./news-graph";
import HorizonSidebar from "./horizon-sidebar-v2";
import { FriendsPanel } from "./friends-panel";
import NewsModal, { type NewsModalItem } from "./NewsModal/NewsModal";
import type { StoryGraph } from "../lib/graph";
import { getStoryPath } from "../lib/news-routing";
import { AnimatePresence, motion } from "framer-motion";
import { useStories } from "../lib/stories-context";

type SocialRecommendation = {
  storyId: string;
  score: number;
  reason: string;
  friendIds: string[];
  friendNames: string[];
};

type FriendActivity = {
  userId: string;
  userName: string;
  storyId: string;
  storyTitle: string;
  topic: string;
  readAt: string;
};

type LivePayload = StoryGraph & {
  meta: {
    cached?: boolean;
    storage?: string;
    plannedArchive?: { bucket: string; region: string; prefix?: string } | null;
    totalStoriesInDb: number;
    sourceMetricsCount?: number;
    recommendations: string[];
    recommendationReasons: Record<string, string>;
    socialRecommendations?: SocialRecommendation[];
    friendActivity?: FriendActivity[];
    retrieval: {
      vectorBackend: string;
      vectorCount?: number;
      graphSeedCount: number;
      mode?: "vector+graph" | "graph" | "vector+graph+social" | "graph+social";
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
      socialRecommendations: payload.meta?.socialRecommendations ?? [],
      friendActivity: payload.meta?.friendActivity ?? [],
      retrieval: {
        vectorBackend: payload.meta?.retrieval?.vectorBackend ?? "cosine",
        graphSeedCount: payload.meta?.retrieval?.graphSeedCount ?? 0,
      },
      fetchedAt: payload.meta?.fetchedAt,
      sessionId: payload.meta?.sessionId,
    },
  };
};

type LikesData = {
  liked: Record<string, boolean>;
  counts: Record<string, number>;
};

export function LiveHome({ initialData }: { initialData: LivePayload }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [data, setData] = useState<LivePayload>(withMetaDefaults(initialData));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [selectedSidebarItem, setSelectedSidebarItem] = useState<NewsModalItem | null>(null);
  const [likesData, setLikesData] = useState<LikesData>({ liked: {}, counts: {} });
  const resizingRef = useRef(false);
  const { setStories } = useStories();
  
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

  useEffect(() => {
    setStories(data.stories);
  }, [data.stories, setStories]);

  // Batch-load like counts + user's liked state for all visible stories
  useEffect(() => {
    const storyIds = data.stories.map((s) => s.id).slice(0, 80);
    if (storyIds.length === 0) return;
    const params = new URLSearchParams({ storyIds: storyIds.join(",") });
    fetch(`/api/like?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d) setLikesData({ liked: d.liked ?? {}, counts: d.counts ?? {} });
      })
      .catch(() => {});
  }, [data.stories]);

  const handleLike = useCallback(async (storyId: string, topic: string) => {
    if (!session?.user) return;

    let wasLiked = false;
    setLikesData((prev) => {
      wasLiked = prev.liked[storyId] ?? false;
      return {
        liked: { ...prev.liked, [storyId]: !wasLiked },
        counts: {
          ...prev.counts,
          [storyId]: Math.max(0, (prev.counts[storyId] ?? 0) + (wasLiked ? -1 : 1)),
        },
      };
    });

    try {
      const res = await fetch("/api/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, topic }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Rollback optimistic update
      setLikesData((prev) => ({
        liked: { ...prev.liked, [storyId]: wasLiked },
        counts: {
          ...prev.counts,
          [storyId]: Math.max(0, (prev.counts[storyId] ?? 0) + (wasLiked ? 1 : -1)),
        },
      }));
    }
  }, [session]);

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
  const platformSourceIds = useMemo(() => ["github", "x", "telegram", "polymarket"], []);

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
  }, [allStories, platformSourceIds]);

  const getStorySummary = useCallback((story: StoryGraph["stories"][number]) => {
    const description = (story as StoryGraph["stories"][number] & { description?: string }).description?.trim();
    if (description) return description;
    const sources = story.sourceIds?.length ? story.sourceIds.slice(0, 3).join(", ") : "Global feed";
    return `${story.title}. Topic: ${story.topic}. Sources: ${sources}.`;
  }, []);

  const navigateToStory = useCallback((storyId: string) => {
    const story = data.stories.find((s) => s.id === storyId);
    if (story) {
      router.push(getStoryPath(story));
    }
  }, [data.stories, router]);

  const prefetchStory = useCallback((story: StoryGraph["stories"][number]) => {
    router.prefetch(getStoryPath(story));
  }, [router]);

  // Social recommendations from friends
  const socialRecommendations = useMemo(() => data.meta.socialRecommendations ?? [], [data.meta.socialRecommendations]);
  const friendActivity = useMemo(() => data.meta.friendActivity ?? [], [data.meta.friendActivity]);
  const friendRecommendedStories = useMemo(() => {
    const socialStoryIds = new Set(socialRecommendations.map(r => r.storyId));
    return allStories.filter(s => socialStoryIds.has(s.id));
  }, [allStories, socialRecommendations]);
  const socialReasonMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of socialRecommendations) {
      map.set(r.storyId, r.reason);
    }
    return map;
  }, [socialRecommendations]);

  

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
                       navigateToStory(id);
                    }} />
                  </div>
               </div>
            </div>

            {/* Friends Also Reading Section (only shown when there are social recs) */}
            {friendRecommendedStories.length > 0 && (
              <div className="mb-20">
                <div className="flex items-center justify-between mb-10 pb-4 border-b border-[#d6d3d1]">
                  <h3 className="font-headline text-[12px] text-[#1c1917] uppercase font-black tracking-[0.3em] flex items-center gap-4">
                    <span className="w-2 h-2 bg-[#10b981] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                    Friends Also Reading
                  </h3>
                  <p className="text-[10px] font-headline text-[#a8a29e] uppercase font-bold tracking-widest">
                    {friendRecommendedStories.length} Social Signals
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {friendRecommendedStories.slice(0, 6).map((story) => {
                    const isLiked = likesData.liked[story.id] ?? false;
                    const likeCount = likesData.counts[story.id] ?? 0;
                    return (
                    <Link
                      key={`social-${story.id}`}
                      href={getStoryPath(story)}
                      prefetch
                      onMouseEnter={() => prefetchStory(story)}
                      className="block h-full"
                    >
                      <article
                        className="premium-card h-full rounded-2xl p-6 cursor-pointer group flex flex-col bg-white shadow-sm border border-[#d6d3d1] hover:border-[#10b981] transition-all hover:shadow-xl relative overflow-hidden"
                      >
                        {/* Social badge */}
                        <div className="absolute top-0 right-0 bg-gradient-to-bl from-[#10b981] to-[#059669] text-white text-[8px] font-headline font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-xl">
                          👥 Network
                        </div>
                        <div className="flex justify-between items-start mb-5">
                          <span className="tag bg-[#ecfdf5] border-[#a7f3d0] text-[#047857] text-[9px] font-black uppercase tracking-widest">{story.topic}</span>
                          <span className="text-[#a8a29e] text-[10px] font-headline font-bold">{new Date(story.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className="min-h-0">
                          <h4 className="font-headline font-bold text-[#1c1917] text-[15px] mb-2 group-hover:text-[#059669] transition-colors leading-tight line-clamp-2 uppercase tracking-tight">
                            {story.title || "Signal pending classification"}
                          </h4>
                          <p className="text-[10px] text-[#10b981] font-headline font-bold mb-3 flex items-center gap-1">
                            <span>👥</span> {socialReasonMap.get(story.id) ?? "Recommended by your network"}
                          </p>
                          <p className="text-[12px] text-[#57534e] line-clamp-2 leading-relaxed font-medium mb-5">
                            {getStorySummary(story)}
                          </p>
                        </div>
                        <div className="mt-auto pt-5 border-t border-[#ecfdf5] flex justify-between items-center">
                          <span className="text-[9px] font-headline font-black text-[#a8a29e] uppercase tracking-widest">{story.sourceIds?.[0] || "NETWORK"}</span>
                          <div className="flex items-center gap-2">
                            {session?.user && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(story.id, story.topic); }}
                                className="flex items-center gap-1 transition-colors"
                                style={{ color: isLiked ? "#ef4444" : "#a8a29e" }}
                                aria-label={isLiked ? "Unlike" : "Like"}
                              >
                                <span
                                  className="material-symbols-outlined text-[16px]"
                                  style={{ fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0" }}
                                >favorite</span>
                                {likeCount > 0 && <span className="text-[9px] font-headline font-black">{likeCount}</span>}
                              </button>
                            )}
                            {!session?.user && likeCount > 0 && (
                              <span className="flex items-center gap-1 text-[#a8a29e]">
                                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 0" }}>favorite</span>
                                <span className="text-[9px] font-headline font-black">{likeCount}</span>
                              </span>
                            )}
                            <span className="material-symbols-outlined text-[18px] text-[#d6d3d1] group-hover:text-[#10b981] transition-colors">arrow_right_alt</span>
                          </div>
                        </div>
                      </article>
                    </Link>
                    );
                  })}
                </div>
              </div>
            )}

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
                {mainFeedStories.map((story) => {
                  const isLiked = likesData.liked[story.id] ?? false;
                  const likeCount = likesData.counts[story.id] ?? 0;
                  return (
                  <Link
                    key={story.id}
                    href={getStoryPath(story)}
                    prefetch
                    onMouseEnter={() => prefetchStory(story)}
                    className="block h-full"
                  >
                    <article
                      className="premium-card h-full rounded-2xl p-6 cursor-pointer group flex flex-col bg-white shadow-sm border border-[#d6d3d1] hover:border-[#ff3e00] transition-all hover:shadow-xl"
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
                          <div className="flex items-center gap-2">
                            {session?.user && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(story.id, story.topic); }}
                                className="flex items-center gap-1 transition-colors"
                                style={{ color: isLiked ? "#ef4444" : "#a8a29e" }}
                                aria-label={isLiked ? "Unlike" : "Like"}
                              >
                                <span
                                  className="material-symbols-outlined text-[16px]"
                                  style={{ fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0" }}
                                >favorite</span>
                                {likeCount > 0 && <span className="text-[9px] font-headline font-black">{likeCount}</span>}
                              </button>
                            )}
                            {!session?.user && likeCount > 0 && (
                              <span className="flex items-center gap-1 text-[#a8a29e]">
                                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 0" }}>favorite</span>
                                <span className="text-[9px] font-headline font-black">{likeCount}</span>
                              </span>
                            )}
                            <span className="material-symbols-outlined text-[18px] text-[#d6d3d1] group-hover:text-[#ff3e00] transition-colors">arrow_right_alt</span>
                          </div>
                       </div>
                    </article>
                  </Link>
                  );
                })}
               </div>
            </div>
          </div>
        </main>

        {/* Intelligence Sidebar (CREAM/LIGHT UI) */}
        <AnimatePresence>
        {isSidebarVisible && (
          <>
          <div
            onMouseDown={() => {
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
              <div className="mb-6">
                <h3 className="font-headline text-[10px] text-[#1c1917] uppercase font-black tracking-[0.2em] mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full"></span>
                  Social Intelligence
                </h3>
                <FriendsPanel
                  friendActivity={friendActivity}
                  onStoryClick={(storyId) => navigateToStory(storyId)}
                />
              </div>
              <div className="border-t border-[#e7e5e4] pt-4">
                <HorizonSidebar
                  polymarketItems={polymarketItems}
                  onNewsClick={(item) => setSelectedSidebarItem(item)}
                />
              </div>
            </div>

            <div className="p-6 bg-white border-t border-[#d6d3d1]">
              <button className="w-full py-4 bg-[#1c1917] text-white font-headline text-[11px] font-black uppercase tracking-[0.3em] rounded-xl hover:bg-[#ff3e00] transition-all shadow-xl active:scale-[0.98]">Share Intelligence Brief</button>
            </div>
          </motion.aside>
          </>
        )}
        </AnimatePresence>
      </div>

      <NewsModal 
        item={selectedSidebarItem} 
        onClose={() => setSelectedSidebarItem(null)} 
      />
    </div>
  );
}
