"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type Outcome = {
  name: string;
  price: number;
};

type HorizonItem = {
  id: string;
  title: string;
  source: string;
  score: number;
  timestamp: string;
  origin: string;
  url?: string;
  image?: string;
  outcomes?: Outcome[];
  volume?: string;
};

type HorizonSidebarProps = {
  polymarketItems?: HorizonItem[];
  onNewsClick?: (item: HorizonItem) => void;
};

type ImpactTone = {
  label: "LOW" | "MED" | "HIGH";
  border: string;
  text: string;
  glow: string;
};

type OriginMeta = {
  icon: string;
  bg: string;
  text: string;
};

const impactTone = (score: number): ImpactTone => {
  if (score >= 200) {
    return {
      label: "HIGH",
      border: "border-[#ef4444]",
      text: "text-[#ef4444]",
      glow: "shadow-[0_0_14px_rgba(239,68,68,0.35)]",
    };
  }
  if (score >= 90) {
    return {
      label: "MED",
      border: "border-[#f59e0b]",
      text: "text-[#f59e0b]",
      glow: "shadow-[0_0_14px_rgba(245,158,11,0.35)]",
    };
  }
  return {
    label: "LOW",
    border: "border-[#22c55e]",
    text: "text-[#22c55e]",
    glow: "shadow-[0_0_14px_rgba(34,197,94,0.35)]",
  };
};

const timeAgo = (value: string) => {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) {
    return "now";
  }
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const originMeta = (origin: string): OriginMeta => {
  const normalized = origin.toUpperCase();
  if (normalized.includes("HACKER")) {
    return { icon: "newspaper", bg: "bg-[#fff5f2]", text: "text-[#ff3e00]" };
  }
  if (normalized.includes("REDDIT")) {
    return { icon: "forum", bg: "bg-[#fff1e6]", text: "text-[#f97316]" };
  }
  if (normalized.includes("TELEGRAM")) {
    return { icon: "send", bg: "bg-[#eef6ff]", text: "text-[#2563eb]" };
  }
  if (normalized.includes("POLYMARKET")) {
    return { icon: "show_chart", bg: "bg-[#f0fdf4]", text: "text-[#22c55e]" };
  }
  if (normalized.includes("GITHUB")) {
    return { icon: "code", bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]" };
  }
  if (normalized === "X") {
    return { icon: "tag", bg: "bg-[#f8fafc]", text: "text-[#0f172a]" };
  }
  return { icon: "rss_feed", bg: "bg-[#f5f5f4]", text: "text-[#57534e]" };
};

const getHost = (url?: string) => {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const FeedCard = ({ item, onClick }: { item: HorizonItem, onClick?: (item: HorizonItem) => void }) => {
  const handle = item.source.startsWith("@") ? item.source : `@${item.source.replace(/^u\//, "")}`;
  const tone = impactTone(item.score);
  const origin = originMeta(item.origin);
  const host = getHost(item.url);

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border p-3 mb-3 transition-all duration-200 hover:shadow-md hover:border-gray-300 cursor-pointer ${tone.border}`}
      onClick={() => onClick?.(item)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${origin.bg}`}>
            <span className="material-symbols-outlined text-[16px]">{origin.icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#1c1917] leading-snug line-clamp-2">
              {item.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-[#a8a29e]">
              <span>{handle}</span>
              <span>·</span>
              <span className="font-mono">{timeAgo(item.timestamp)}</span>
              <span>·</span>
              <span className={`font-bold uppercase tracking-wider ${origin.text}`}>{item.origin}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#ff3e00]">LIVE</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#57534e] line-clamp-2">
        {host
          ? `Signal captured from ${item.origin}. Source: ${host}.`
          : `Signal captured from ${item.origin}.`}
      </p>
      {item.url && (
        <a
          className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff3e00] hover:text-[#d93500]"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          Open original
          <span className="material-symbols-outlined text-[14px]">north_east</span>
        </a>
      )}
    </div>
  );
};

const PolymarketCard = ({ item }: { item: HorizonItem }) => {
  const handleDirectClick = () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div 
      className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 hover:shadow-lg transition-all cursor-pointer group flex flex-col gap-4 shadow-sm"
      onClick={handleDirectClick}
    >
      <div className="flex items-start gap-3">
        {item.image ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-gray-50 shadow-sm">
            <img src={item.image} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-blue-500 text-[20px]">leaderboard</span>
          </div>
        )}
        <h4 className="text-[13px] font-bold text-gray-900 leading-tight flex-1 line-clamp-2 uppercase tracking-tight">
          {item.title}
        </h4>
      </div>
      
      <div className="flex flex-col gap-2">
        {item.outcomes && item.outcomes.length > 0 ? (
          item.outcomes.map((outcome, idx) => (
            <div key={idx} className="flex items-center justify-between group/row hover:bg-gray-50 p-1 rounded-lg transition-colors">
              <span className="text-[11px] font-bold text-gray-700 truncate max-w-[140px]">{outcome.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-black text-gray-900">{Math.round(outcome.price * 100)}%</span>
                <div className="flex gap-1">
                  <button className="px-3 py-1 bg-[#dcfce7] text-[#15803d] text-[9px] font-black rounded-md hover:bg-[#15803d] hover:text-white transition-all">YES</button>
                  <button className="px-3 py-1 bg-[#fee2e2] text-[#b91c1c] text-[9px] font-black rounded-md hover:bg-[#b91c1c] hover:text-white transition-all">NO</button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-2 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Signal processing...
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.volume || "$0"} VOL.</span>
          <span className="material-symbols-outlined text-[14px] text-gray-300">sync</span>
        </div>
        <div className="flex items-center gap-3">
           <span className="material-symbols-outlined text-[16px] text-gray-300 hover:text-blue-500 transition-colors">redeem</span>
           <span className="material-symbols-outlined text-[16px] text-gray-300 hover:text-blue-500 transition-colors">bookmark</span>
        </div>
      </div>
    </div>
  );
};

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#eaeaea] bg-white p-4 animate-pulse">
      <div className="h-3 bg-[#f3f3f3] rounded w-1/3 mb-3" />
      <div className="h-4 bg-[#f3f3f3] rounded w-full mb-2" />
      <div className="h-4 bg-[#f3f3f3] rounded w-5/6" />
    </div>
  );
}

export default function HorizonSidebar({ polymarketItems = [], onNewsClick }: HorizonSidebarProps) {
  const [activeTab, setActiveTab] = useState<"all" | "friends" | "polymarket" | "hackernews" | "reddit" | "github" | "telegram" | "x">("all");
  const [friendsLikes, setFriendsLikes] = useState<any[]>([]);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  const [feedItems, setFeedItems] = useState<HorizonItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [polymarketFeed, setPolymarketFeed] = useState<HorizonItem[]>([]);
  const [isPolyLoading, setIsPolyLoading] = useState(false);
  const [polyError, setPolyError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "friends" && friendsLikes.length === 0) {
      setIsFriendsLoading(true);
      fetch("/api/friends/likes")
        .then(res => res.json())
        .then(data => {
          if (data.likes) setFriendsLikes(data.likes);
        })
        .catch(err => console.error("Failed to fetch friends likes:", err))
        .finally(() => setIsFriendsLoading(false));
    }
  }, [activeTab, friendsLikes.length]);
  const pageSize = 35;

  const fetchFeed = async (nextOffset = 0, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/horizon?offset=${nextOffset}&limit=${pageSize}`);
      if (!res.ok) throw new Error("Failed to fetch feed");
      const data = await res.json();
      setFeedItems((prev) => {
        const merged = append ? [...prev, ...(data.items ?? [])] : (data.items ?? []);
        const seenIds = new Set<string>();
        const seenTitles = new Set<string>();
        return merged.filter((item: HorizonItem) => {
          const titleKey = item.title.toLowerCase().trim();
          if (seenIds.has(item.id) || seenTitles.has(titleKey)) return false;
          seenIds.add(item.id);
          seenTitles.add(titleKey);
          return true;
        });
      });
      const newOffset = nextOffset + (data.items?.length ?? 0);
      setOffset(newOffset);
      setHasMore(newOffset < (data.total ?? 0));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchFeed(0, false);
  }, []);

  const fetchPolymarket = async () => {
    setIsPolyLoading(true);
    setPolyError(null);
    try {
      const res = await fetch("/api/polymarket");
      if (!res.ok) throw new Error("Failed to fetch Polymarket");
      const data = await res.json();
      setPolymarketFeed(data.items ?? []);
    } catch (err: any) {
      setPolyError(err.message);
    } finally {
      setIsPolyLoading(false);
    }
  };

  useEffect(() => {
    if (polymarketItems.length === 0) {
      fetchPolymarket();
    }
  }, [polymarketItems.length]);

  const sortedFeed = useMemo(() => {
    return [...feedItems].sort((a, b) => b.score - a.score);
  }, [feedItems]);

  const effectivePolymarket = polymarketItems.length > 0 ? polymarketItems : polymarketFeed;

  const sortedPolymarket = useMemo(() => {
    if (!effectivePolymarket) return [];
    return [...effectivePolymarket].sort((a, b) => b.score - a.score);
  }, [effectivePolymarket]);

  const filteredByOrigin = useMemo(() => {
    if (activeTab === "all") return sortedFeed;
    const originMap: Record<string, string> = {
      hackernews: "HACKER NEWS",
      reddit: "REDDIT",
      github: "GITHUB",
      telegram: "TELEGRAM",
      x: "X",
    };
    const targetOrigin = originMap[activeTab];
    if (!targetOrigin) return sortedFeed;
    return sortedFeed.filter((item) => item.origin === targetOrigin);
  }, [sortedFeed, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sortedFeed.length };
    sortedFeed.forEach((item) => {
      const key = item.origin.toLowerCase().replace(/\s+/g, "");
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [sortedFeed]);

  const tabs = [
    { id: "all" as const, label: "All", count: tabCounts.all || 0 },
    { id: "friends" as const, label: "Friends", count: friendsLikes.length },
    { id: "polymarket" as const, label: "Polymarket", count: sortedPolymarket.length },
    { id: "hackernews" as const, label: "HackerNews", count: tabCounts.hackernews || 0 },
    { id: "reddit" as const, label: "Reddit", count: tabCounts.reddit || 0 },
    { id: "github" as const, label: "GitHub", count: tabCounts.github || 0 },
    { id: "telegram" as const, label: "Telegram", count: tabCounts.telegram || 0 },
    { id: "x" as const, label: "X", count: tabCounts.x || 0 },
  ];

  const renderFriendsContent = () => {
    if (isFriendsLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      );
    }
    if (friendsLikes.length === 0) {
      return (
        <div className="p-8 text-center text-gray-400 text-xs uppercase font-bold tracking-widest">
          No friend activity detected
        </div>
      );
    }
    return friendsLikes.map((like, idx) => (
      <div key={idx} className="relative mb-4">
        <div className="absolute -top-2 -left-2 z-10 bg-[#ff3e00] text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm uppercase tracking-tighter">
          Liked by {like.userName}
        </div>
        <FeedCard item={like.story} onClick={onNewsClick} />
      </div>
    ));
  };

  const renderFeedContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      );
    }
    if (error) {
      return (
        <div className="p-8 text-center bg-red-50 rounded-xl border border-red-100">
          <p className="text-red-500 text-xs font-bold uppercase tracking-wider">{error}</p>
        </div>
      );
    }
    if (filteredByOrigin.length === 0) {
      return (
        <div className="p-8 text-center text-gray-400 text-xs uppercase font-bold tracking-widest">
          No signals detected
        </div>
      );
    }
    return filteredByOrigin.map((item) => <FeedCard key={item.id} item={item} onClick={onNewsClick} />);
  };

  const renderPolymarketContent = () => {
    if (isPolyLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      );
    }
    if (polyError) {
      return (
        <div className="p-8 text-center bg-red-50 rounded-xl border border-red-100">
          <p className="text-red-500 text-xs font-bold uppercase tracking-wider">{polyError}</p>
        </div>
      );
    }
    if (sortedPolymarket.length === 0) {
      return (
        <div className="p-8 text-center text-gray-400 text-xs uppercase font-bold tracking-widest">
          No prediction markets active
        </div>
      );
    }
    return sortedPolymarket.map((item) => <PolymarketCard key={item.id} item={item} />);
  };

  const isPolymarketTab = activeTab === "polymarket";

  return (
    <div className="h-full w-full bg-[#fcfcfc] flex flex-col font-sans">
      <div className="flex-shrink-0 p-6 border-b border-gray-100 bg-white">
        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Signal Intelligence</h2>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Real-time event detection matrix</p>
      </div>

      <div className="flex-shrink-0 px-4 bg-white border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto custom-scrollbar py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap rounded-lg ${
                activeTab === tab.id
                  ? "bg-[#ff3e00] text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${
                  activeTab === tab.id ? "bg-white/20" : "bg-gray-100"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar" ref={scrollContainerRef}>
        {isPolymarketTab ? renderPolymarketContent() : activeTab === "friends" ? renderFriendsContent() : (
          <>
            {renderFeedContent()}
            
            {hasMore && !isLoading && activeTab === "all" && (
              <button
                className="w-full mt-4 py-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all bg-white shadow-sm"
                onClick={() => fetchFeed(offset, true)}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Synchronizing..." : "Load More Signals"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
