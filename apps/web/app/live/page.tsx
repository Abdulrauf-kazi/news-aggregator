"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

type Story = {
  id: string;
  title: string;
  content?: string;
  topic: string;
  sourceIds: string[];
  timestamp: string;
  url?: string;
};

type StreamInfo = {
  name: string;
  handle: string; // YouTube @handle
  channelId: string; // fallback channel ID
  region: string;
  videoId: string | null;
  isLive: boolean;
  loading: boolean;
  error: boolean;
};

// Verified news channels with both @handles and channel IDs
const CHANNEL_REGISTRY: Omit<StreamInfo, "videoId" | "isLive" | "loading" | "error">[] = [
  { name: "Al Jazeera English", handle: "@aljazeeraenglish", channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", region: "Global" },
  { name: "Bloomberg TV", handle: "@Bloomberg", channelId: "UCIALMKvObZNtJ6AmdCLP7Lg", region: "Finance" },
  { name: "Sky News", handle: "@SkyNews", channelId: "UCoMdktPbSTixAyNGwb-UYkQ", region: "UK" },
  { name: "TRT World", handle: "@trtworld", channelId: "UC7fWeaHhqgM4Ry-RMpM2YYw", region: "Global" },
  { name: "WION", handle: "@WIONews", channelId: "UC_gUM8rL-Lrg6O3adPW9K1g", region: "India/Global" },
  { name: "DW News", handle: "@dwnews", channelId: "UCknLrEdhRCp1aegoK979ARw", region: "Europe" },
  { name: "NDTV 24x7", handle: "@NDTV", channelId: "UCZ5uMhGAYl1SQTvZ2_8z2iA", region: "India" },
  { name: "India Today", handle: "@IndiaToday", channelId: "UCYPvAwZP8pZhSMW8qs7cVCw", region: "India" },
  { name: "Euronews", handle: "@euronews", channelId: "UCSrZ3UV4jOidv8ppoVuvW9Q", region: "Europe" },
  { name: "CNA", handle: "@channelnewsasia", channelId: "UCo8bcnLyZH8tBIH9V1mLgqQ", region: "Asia" },
  { name: "NBC News", handle: "@NBCNews", channelId: "UCeY0bbntWzzVIaj2z3QigXg", region: "US" },
  { name: "Aaj Tak", handle: "@aajtak", channelId: "UCt4t-jeY85JegMlZ-E5UWtA", region: "India" },
];

const DEFAULT_SELECTION = [0, 1, 3, 4, 2, 6]; // Al Jazeera, Bloomberg, TRT, WION, Sky News, NDTV

export default function LiveFeedPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>(DEFAULT_SELECTION);
  
  // Per-channel resolved state: keyed by channelId
  const [resolved, setResolved] = useState<Record<string, { videoId: string | null; isLive: boolean; loading: boolean }>>({});
  const resolvedCache = useRef<Record<string, { videoId: string | null; isLive: boolean; ts: number }>>({});

  // Resolve a single channel's live video ID
  const resolveSingleChannel = useCallback(async (channel: typeof CHANNEL_REGISTRY[number]) => {
    const cacheKey = channel.channelId;
    const cached = resolvedCache.current[cacheKey];
    // Use cache if fresh (5 minutes)
    if (cached && Date.now() - cached.ts < 300_000) {
      setResolved(prev => ({ ...prev, [cacheKey]: { videoId: cached.videoId, isLive: cached.isLive, loading: false } }));
      return;
    }

    // Mark as loading
    setResolved(prev => ({ ...prev, [cacheKey]: { videoId: null, isLive: false, loading: true } }));

    try {
      const res = await fetch(`/api/youtube-live?handle=${encodeURIComponent(channel.handle)}&channelId=${encodeURIComponent(channel.channelId)}`);
      if (res.ok) {
        const data = await res.json();
        const result = { videoId: data.videoId || null, isLive: data.isLive ?? false };
        resolvedCache.current[cacheKey] = { ...result, ts: Date.now() };
        setResolved(prev => ({ ...prev, [cacheKey]: { ...result, loading: false } }));
        return;
      }
    } catch (e) {
      console.error(`Failed to resolve ${channel.name}:`, e);
    }

    // Fallback: channel-based embed
    setResolved(prev => ({ ...prev, [cacheKey]: { videoId: null, isLive: false, loading: false } }));
  }, []);

  // Resolve all on initial mount only
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    selectedIndices.forEach(idx => {
      const channel = CHANNEL_REGISTRY[idx];
      if (channel) void resolveSingleChannel(channel);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build stream info from current state
  const streams: StreamInfo[] = selectedIndices.map(idx => {
    const channel = CHANNEL_REGISTRY[idx]!;
    const res = resolved[channel.channelId];
    return {
      ...channel,
      videoId: res?.videoId ?? null,
      isLive: res?.isLive ?? false,
      loading: res?.loading ?? true,
      error: false,
    };
  });

  // Build the embed URL for a stream
  const getEmbedUrl = (stream: StreamInfo): string => {
    if (stream.videoId) {
      return `https://www.youtube.com/embed/${stream.videoId}?autoplay=1&mute=1&rel=0`;
    }
    return `https://www.youtube.com/embed/live_stream?channel=${stream.channelId}&autoplay=1&mute=1`;
  };

  const updateStreamSelection = (slotIndex: number, channelIndex: number) => {
    setSelectedIndices(prev => {
      const next = [...prev];
      next[slotIndex] = channelIndex;
      return next;
    });
    // Resolve only this newly selected channel
    const channel = CHANNEL_REGISTRY[channelIndex];
    if (channel) {
      delete resolvedCache.current[channel.channelId]; // force fresh resolve
      void resolveSingleChannel(channel);
    }
  };

  const fetchLive = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/live?refresh=1");
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchLive();
    const interval = setInterval(() => void fetchLive(), 30000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  return (
    <main className="max-w-[1600px] mx-auto px-6 lg:px-12 py-12 min-h-screen">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between border-b border-neutral-300 pb-8 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_12px_rgba(220,38,38,0.6)]"></span>
            <span className="tag" style={{ background: '#dc2626', color: 'white', border: 'none' }}>● LIVE</span>
          </div>
          <h1 className="text-5xl font-black text-primary uppercase tracking-tighter font-headline leading-none">
            Real-Time <br /> Signal Stream
          </h1>
          <p className="text-sm text-secondary mt-3 max-w-2xl">
            Multi-vector live monitoring across 6 synchronized global news uplinks. 
            Select sources from the dropdown to pivot intelligence focus.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="px-6 py-3 bg-white text-primary border border-[#d6d3d1] font-headline text-[10px] uppercase tracking-widest hover:bg-[#f5f5f4] transition-all shadow-sm"
          >
            ← Dashboard
          </Link>
          <button 
            onClick={() => { resolvedCache.current = {}; selectedIndices.forEach(idx => { const ch = CHANNEL_REGISTRY[idx]; if (ch) void resolveSingleChannel(ch); }); void fetchLive(); }}
            disabled={isRefreshing}
            className="px-6 py-3 bg-primary text-white font-headline text-[10px] uppercase tracking-widest hover:bg-accent transition-all disabled:opacity-50 shadow-lg"
          >
            {isRefreshing ? "Synchronizing..." : "Force Sync"}
          </button>
        </div>
      </header>

      {/* 6 Streams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {streams.map((stream, idx) => (
          <div key={`slot-${idx}-${stream.channelId}`} className="flex flex-col gap-2">
            {/* Stream header with selector */}
            <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-[#d6d3d1]">
              <div className="flex items-center gap-2 pl-2">
                {stream.loading ? (
                  <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                ) : stream.videoId ? (
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                ) : (
                  <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                )}
                <span className="text-[10px] font-headline font-bold text-secondary uppercase tracking-wider">
                  {stream.region}
                </span>
              </div>
              <select 
                className="text-[10px] font-headline uppercase bg-[#f5f5f4] border border-[#e7e5e4] outline-none py-1.5 px-3 rounded-md cursor-pointer hover:bg-neutral-200 transition-colors max-w-[200px]"
                value={selectedIndices[idx]}
                onChange={(e) => updateStreamSelection(idx, parseInt(e.target.value))}
              >
                {CHANNEL_REGISTRY.map((ch, ci) => (
                  <option key={ci} value={ci}>{ch.name} ({ch.region})</option>
                ))}
              </select>
            </div>

            {/* Stream player */}
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-xl border border-neutral-800 relative group">
              {stream.loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-800 text-white">
                  <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                  <p className="text-xs font-headline uppercase tracking-wider text-neutral-400">Resolving {stream.name}...</p>
                </div>
              ) : (
                <iframe 
                  width="100%" height="100%" 
                  src={getEmbedUrl(stream)}
                  title={stream.name} 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  allowFullScreen
                ></iframe>
              )}
              {/* Stream label overlay on hover */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between">
                  <p className="text-white text-xs font-headline font-bold">{stream.name}</p>
                  {stream.videoId && (
                    <span className="text-[9px] text-green-400 font-headline uppercase tracking-wider">● Live</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status Banner */}
      <div className="mb-12 bg-primary p-8 rounded-2xl text-white shadow-xl flex flex-col md:flex-row items-center gap-8">
        <div className="flex-grow">
          <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-white/60 mb-2">Operational Protocol</p>
          <h2 className="text-3xl font-black font-headline mb-4 uppercase">Hex-Stream Monitoring Active</h2>
          <p className="text-sm opacity-80 leading-relaxed max-w-3xl">
            Concurrent multi-vector visual analysis initialized. Monitoring global satellite uplinks, 
            financial data streams, and geopolitical telemetry across 6 synchronized live nodes.
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-4 bg-white/10 px-6 py-4 rounded-xl border border-white/20">
          <span className={`w-3 h-3 rounded-full animate-pulse ${streams.filter(s => s.videoId).length > 0 ? 'bg-emerald-500' : 'bg-yellow-500'}`}></span>
          <span className="text-xs font-headline uppercase font-bold tracking-[0.2em]">
            {streams.filter(s => s.videoId).length}/{streams.length} Feeds Active
          </span>
        </div>
      </div>

      {/* Latest stories */}
      <div className="grid grid-cols-1 gap-px bg-[#d6d3d1] border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-2xl">
        {stories.length > 0 ? (
          stories.slice(0, 10).map((story, idx) => (
            <article 
              key={story.id + idx} 
              className="bg-white p-8 group hover:bg-[#fafaf9] transition-colors flex flex-col md:flex-row gap-8 items-start"
            >
              <div className="md:w-48 flex-shrink-0">
                <p className="text-[10px] font-headline font-black text-secondary uppercase mb-2">
                  {new Date(story.timestamp).toLocaleTimeString()}
                </p>
                <span className="tag text-[9px]">{story.topic}</span>
                <div className="mt-4 space-y-1">
                   {story.sourceIds.map(s => (
                     <p key={s} className="text-[9px] text-secondary font-headline uppercase opacity-60">SOURCE: {s}</p>
                   ))}
                </div>
              </div>
              <div className="flex-grow max-w-4xl">
                <h3 className="text-xl font-bold text-primary mb-3 font-headline group-hover:text-accent transition-colors leading-tight">
                  {story.title}
                </h3>
                <p className="text-sm text-secondary leading-relaxed line-clamp-3 mb-4 opacity-80">
                  {story.content || "Processing semantic context..."}
                </p>
                {story.url && (
                  <a 
                    href={story.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-headline font-bold text-accent uppercase tracking-wider flex items-center gap-1.5 hover:underline"
                  >
                    View Origin Link
                    <span className="text-[14px]">↗</span>
                  </a>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="bg-white p-24 text-center">
             <div className="inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-secondary font-headline text-sm uppercase tracking-widest">Awaiting satellite handshake...</p>
          </div>
        )}
      </div>
    </main>
  );
}
