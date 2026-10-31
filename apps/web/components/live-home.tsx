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
import { getSourceLabel, getStoryPath } from "../lib/news-routing";
import { topicColor } from "../lib/topic-colors";
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

type FeedStory = StoryGraph["stories"][number] & { description?: string };

const PAGE_SIZE = 24;

const relativeTime = (timestamp: string) => {
  const ms = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ms)) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Generic preview text ("Cyber update from x.") repeats the chip and source; hide it.
const usefulSummary = (story: FeedStory) => {
  const text = story.description?.trim();
  if (!text || /^\w+ update from /i.test(text) || text === story.title) return null;
  return text;
};

function StoryCard({
  story,
  reason,
  isLiked,
  likeCount,
  canLike,
  onLike,
  onPrefetch,
}: {
  story: FeedStory;
  reason?: string;
  isLiked: boolean;
  likeCount: number;
  canLike: boolean;
  onLike: () => void;
  onPrefetch: () => void;
}) {
  const summary = usefulSummary(story);
  const color = topicColor(story.topic);
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-[#e7e5e4] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d6d3d1] hover:shadow-[0_12px_32px_-12px_rgba(28,25,23,0.25)] focus-within:border-[#ff3e00]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f4] px-2.5 py-1 text-[12px] font-semibold text-[#44403c]">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          {story.topic}
        </span>
        <time dateTime={story.timestamp} className="shrink-0 text-[12px] text-[#78716c]">
          {relativeTime(story.timestamp)}
        </time>
      </div>

      <h3 className="mb-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-[#1c1917] [text-wrap:pretty]">
        {/* Stretched link: the whole card is clickable, the like button stays separate. */}
        <Link
          href={getStoryPath(story)}
          prefetch
          onMouseEnter={onPrefetch}
          onFocus={onPrefetch}
          className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-[#c2410c]"
        >
          {story.title || "Untitled story"}
        </Link>
      </h3>

      {reason && (
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#047857]">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">group</span>
          {reason}
        </p>
      )}
      {summary && <p className="mb-4 line-clamp-3 text-[14px] leading-relaxed text-[#57534e]">{summary}</p>}

      <div className="mt-auto flex items-center justify-between border-t border-[#f5f5f4] pt-4">
        <span className="truncate text-[13px] font-medium text-[#57534e]">{getSourceLabel(story.sourceIds)}</span>
        <div className="relative z-10 flex items-center gap-1">
          {canLike ? (
            <button
              type="button"
              onClick={onLike}
              aria-pressed={isLiked}
              aria-label={isLiked ? `Unlike "${story.title}"` : `Like "${story.title}"`}
              className={`flex h-8 items-center gap-1 rounded-full px-2 transition-colors hover:bg-[#fef2f2] ${isLiked ? "text-[#dc2626]" : "text-[#78716c] hover:text-[#dc2626]"}`}
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true">favorite</span>
              {likeCount > 0 && <span className="text-[12px] font-semibold tabular-nums">{likeCount}</span>}
            </button>
          ) : likeCount > 0 ? (
            <span className="flex items-center gap-1 px-2 text-[#78716c]" aria-label={`${likeCount} likes`}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">favorite</span>
              <span className="text-[12px] font-semibold tabular-nums">{likeCount}</span>
            </span>
          ) : null}
          <span className="material-symbols-outlined text-[20px] text-[#a8a29e] transition-transform group-hover:translate-x-0.5 group-hover:text-[#c2410c]" aria-hidden="true">arrow_forward</span>
        </div>
      </div>
    </article>
  );
}

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
  const [activeTopic, setActiveTopic] = useState<string>("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const { setStories } = useStories();
  
  useEffect(() => {
    const handleToggle = () => setIsSidebarVisible((prev) => !prev);
    window.addEventListener("toggle-sidebar", handleToggle);

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(280, Math.min(900, window.innerWidth - e.clientX));
      setSidebarWidth(newWidth);
    };

    // Registered once for the component lifetime; mousedown on the resize
    // handle only flips resizingRef (previously each drag added new listeners).
    const onMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
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

  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const story of mainFeedStories) counts.set(story.topic, (counts.get(story.topic) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [mainFeedStories]);

  const filteredStories = useMemo(
    () => (activeTopic === "All" ? mainFeedStories : mainFeedStories.filter((s) => s.topic === activeTopic)),
    [mainFeedStories, activeTopic],
  );

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

  const shareBrief = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
    window.setTimeout(() => setShareState("idle"), 2500);
  }, []);

  const renderCard = (story: FeedStory, reason?: string) => (
    <StoryCard
      key={`${reason ? "social-" : ""}${story.id}`}
      story={story}
      reason={reason}
      isLiked={likesData.liked[story.id] ?? false}
      likeCount={likesData.counts[story.id] ?? 0}
      canLike={Boolean(session?.user)}
      onLike={() => handleLike(story.id, story.topic)}
      onPrefetch={() => prefetchStory(story)}
    />
  );

  const updatedLabel = data.meta.fetchedAt ? relativeTime(data.meta.fetchedAt) : null;

  return (
    <div className="font-body text-[#1c1917]">
      <div className="flex items-start">
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 md:py-10 lg:px-12">
            <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className="status-dot" aria-hidden="true"></span>
                  <span className="font-headline text-[11px] font-bold uppercase tracking-[0.2em] text-[#c2410c]">Live</span>
                  {updatedLabel && <span className="text-[12px] text-[#78716c]">· updated {updatedLabel}</span>}
                </div>
                <h1 className="font-headline text-[34px] font-black uppercase leading-none tracking-tight text-[#1c1917] sm:text-5xl">
                  Intelligence Terminal
                </h1>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#57534e]">
                  {mainFeedStories.length} stories from global sources, grouped by topic and linked by meaning.
                </p>
              </div>
              <button
                type="button"
                onClick={() => refresh(true)}
                disabled={isRefreshing}
                aria-busy={isRefreshing}
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-[#1c1917] px-5 py-3 font-headline text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#ff3e00] disabled:cursor-wait disabled:opacity-70"
              >
                <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true">refresh</span>
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </header>

            {/* Story network */}
            <section aria-label="Story network" className="mb-12 rounded-[1.5rem] border border-[#e7e5e4] bg-white p-2 shadow-[0_24px_48px_-24px_rgba(28,25,23,0.25)] sm:p-3">
              <div className="h-[340px] w-full sm:h-[440px] lg:h-[500px]">
                <NewsGraph nodes={data.nodes} edges={data.edges} onNodeClick={(id) => navigateToStory(id)} />
              </div>
            </section>

            {friendRecommendedStories.length > 0 && (
              <section aria-labelledby="friends-heading" className="mb-14">
                <div className="mb-6 flex items-end justify-between gap-4 border-b border-[#e7e5e4] pb-4">
                  <h2 id="friends-heading" className="flex items-center gap-3 font-headline text-[13px] font-bold uppercase tracking-[0.2em] text-[#1c1917]">
                    <span className="h-2 w-2 rounded-full bg-[#10b981]" aria-hidden="true"></span>
                    From your network
                  </h2>
                  <p className="text-[13px] text-[#78716c]">{friendRecommendedStories.length} recommended</p>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {friendRecommendedStories.slice(0, 6).map((story) =>
                    renderCard(story as FeedStory, socialReasonMap.get(story.id) ?? "Recommended by your network"),
                  )}
                </div>
              </section>
            )}

            <section aria-labelledby="feed-heading" className="mb-16">
              <div className="mb-5 flex items-end justify-between gap-4 border-b border-[#e7e5e4] pb-4">
                <h2 id="feed-heading" className="flex items-center gap-3 font-headline text-[13px] font-bold uppercase tracking-[0.2em] text-[#1c1917]">
                  <span className="h-2 w-2 rounded-full bg-[#ff3e00]" aria-hidden="true"></span>
                  Latest stories
                </h2>
                <p className="text-[13px] text-[#78716c]" aria-live="polite">
                  {activeTopic === "All" ? `${filteredStories.length} stories` : `${filteredStories.length} in ${activeTopic}`}
                </p>
              </div>

              {topicCounts.length > 1 && (
                <div role="group" aria-label="Filter by topic" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {[["All", mainFeedStories.length] as const, ...topicCounts].map(([topic, count]) => {
                    const active = activeTopic === topic;
                    return (
                      <button
                        key={topic}
                        type="button"
                        aria-pressed={active}
                        onClick={() => { setActiveTopic(topic); setVisibleCount(PAGE_SIZE); }}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                          active ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#d6d3d1] bg-white text-[#44403c] hover:border-[#a8a29e]"
                        }`}
                      >
                        {topic !== "All" && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: topicColor(topic) }} aria-hidden="true" />}
                        {topic}
                        <span className={`tabular-nums ${active ? "text-white/70" : "text-[#78716c]"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredStories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d6d3d1] bg-white/60 px-6 py-16 text-center">
                  <p className="text-[15px] font-medium text-[#1c1917]">No stories yet</p>
                  <p className="mt-1 text-[14px] text-[#57534e]">Sources are being fetched. Try refreshing in a minute.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredStories.slice(0, visibleCount).map((story) => renderCard(story as FeedStory))}
                  </div>
                  {visibleCount < filteredStories.length && (
                    <div className="mt-10 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                        className="rounded-lg border border-[#d6d3d1] bg-white px-6 py-3 text-[14px] font-semibold text-[#1c1917] transition-colors hover:border-[#1c1917]"
                      >
                        Show more stories
                        <span className="ml-2 text-[#78716c] tabular-nums">({filteredStories.length - visibleCount} left)</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </main>

        {/* Social & signals panel: desktop only, sticky beside the feed */}
        <AnimatePresence>
          {isSidebarVisible && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                onMouseDown={() => {
                  resizingRef.current = true;
                  document.body.style.cursor = "col-resize";
                }}
                className="sticky top-16 hidden h-[calc(100vh-4rem)] w-1.5 cursor-col-resize bg-transparent hover:bg-[#0000000a] lg:block"
              />
              <motion.aside
                aria-label="Social and market signals"
                initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] flex-col border-l border-[#d6d3d1] bg-white shadow-2xl lg:flex"
                style={{ width: sidebarWidth }}
              >
                <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#fcfcfc] p-4">
                  <div className="mb-6">
                    <h2 className="mb-4 flex items-center gap-2 font-headline text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1917]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" aria-hidden="true"></span>
                      Social
                    </h2>
                    <FriendsPanel friendActivity={friendActivity} onStoryClick={(storyId) => navigateToStory(storyId)} />
                  </div>
                  <div className="border-t border-[#e7e5e4] pt-4">
                    <HorizonSidebar polymarketItems={polymarketItems} onNewsClick={(item) => setSelectedSidebarItem(item)} />
                  </div>
                </div>
                <div className="border-t border-[#d6d3d1] bg-white p-4">
                  <button
                    type="button"
                    onClick={shareBrief}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1c1917] py-3.5 font-headline text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#ff3e00]"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{shareState === "copied" ? "check" : "link"}</span>
                    <span aria-live="polite">
                      {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link to this feed"}
                    </span>
                  </button>
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
