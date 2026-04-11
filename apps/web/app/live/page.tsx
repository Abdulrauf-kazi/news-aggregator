"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DOMPurify from "isomorphic-dompurify";

type Story = {
  id: string;
  title: string;
  content?: string;
  topic: string;
  sourceIds: string[];
  timestamp: string;
  url?: string;
};

export default function LiveFeedPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      <header className="mb-12 flex items-end justify-between border-b border-neutral-300 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]"></span>
            <span className="tag">Live Uplink</span>
          </div>
          <h1 className="text-5xl font-black text-primary uppercase tracking-tighter font-headline leading-none">
            Real-Time <br /> Signal Stream
          </h1>
        </div>
        <button 
          onClick={() => void fetchLive()}
          disabled={isRefreshing}
          className="px-6 py-3 bg-primary text-white font-headline text-[10px] uppercase tracking-widest hover:bg-accent transition-all disabled:opacity-50 shadow-lg"
        >
          {isRefreshing ? "Synchronizing..." : "Manual Force Sync"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Live Embeds */}
           <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-xl border border-neutral-800">
              <iframe 
                width="100%" height="100%" 
                src="https://www.youtube.com/embed/live_stream?channel=UC83Ph_GiitndatSdseS-IdA" 
                title="Sky News Live" frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
              ></iframe>
           </div>
           <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-xl border border-neutral-800">
              <iframe 
                width="100%" height="100%" 
                src="https://www.youtube.com/embed/live_stream?channel=UC70REUMIs-X_IdawidZAnxA" 
                title="France 24 Live" frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
              ></iframe>
           </div>
        </div>
        <div className="bg-primary p-6 rounded-2xl flex flex-col justify-center text-white shadow-xl">
           <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-white/60 mb-2">Live Status</p>
           <h2 className="text-2xl font-black font-headline mb-4 uppercase">Direct Feeds Active</h2>
           <p className="text-xs opacity-80 leading-relaxed mb-6">
             Monitoring global satellite uplinks and social telemetry in real-time. 
             Direct visual feeds from London and Paris nodes are currently synchronized.
           </p>
           <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-headline uppercase font-bold tracking-widest">Network Operational</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-[#d6d3d1] border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-2xl">
        {stories.length > 0 ? (
          stories.map((story, idx) => (
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
                    href={story.url + (story.url.includes('?') ? '&' : '?') + 'utm_source=newsmonitor&utm_medium=referral&utm_campaign=live'}
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
