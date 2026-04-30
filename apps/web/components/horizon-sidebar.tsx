"use client";

import { useEffect, useMemo, useState } from "react";

type HorizonItem = {
  id: string;
  title: string;
  source: string;
  score: number;
  timestamp: string;
  origin: string;
  url?: string;
};

type HorizonSidebarProps = {
  polymarketItems?: HorizonItem[];
};

type ImpactTone = {
  label: "LOW" | "MED" | "HIGH";
  border: string;
  text: string;
  glow: string;
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

const FeedCard = ({ item }: { item: HorizonItem }) => {
  const tone = impactTone(item.score);
  return (
    <article
      className="rounded-2xl border border-[#d6d3d1] bg-white p-4 transition-all hover:border-[#ff3e00] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#1c1917]">{item.source}</span>
            <span className="font-mono text-[10px] text-[#57534e]">{timeAgo(item.timestamp)}</span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-[#1c1917]">
            {item.title}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#d6d3d1] bg-[#f5f5f4] px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-[#57534e]">
          {item.origin}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] ${tone.border} ${tone.text} ${tone.glow}`}
        >
          Impact {tone.label}
        </span>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] uppercase tracking-[0.2em] text-[#ff3e00] hover:text-[#d33b0f]"
          >
            Open
          </a>
        ) : null}
      </div>
    </article>
  );
};

export function HorizonSidebar({ polymarketItems = [] }: HorizonSidebarProps) {
  const [items, setItems] = useState<HorizonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/horizon");
        if (!res.ok) {
          throw new Error("Failed to load Horizon feed");
        }
        const data = (await res.json()) as { items?: HorizonItem[] };
        if (isMounted) {
          setItems(data.items ?? []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load Horizon feed");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const horizonItems = useMemo(() => items.slice(0, 10), [items]);
  const polymarket = useMemo(() => polymarketItems.slice(0, 6), [polymarketItems]);

  return (
    <section className="rounded-2xl border border-[#d6d3d1] bg-[#fcfcfc] p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff3e00] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff3e00]" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#ff3e00]">LIVE</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-[#57534e]">Horizon</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#a8a29e]">Glint Feed</span>
      </div>

      {loading ? (
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#a8a29e]">Loading signals...</div>
      ) : error ? (
        <div className="rounded-xl border border-[#7f1d1d] bg-[#1f0a0a] px-3 py-2 text-[11px] text-[#fca5a5]">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {horizonItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {polymarket.length > 0 ? (
        <div className="mt-6 border-t border-[#e7e5e4] pt-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#ff3e00]">
              Polymarket
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-[#a8a29e]">Sidebar only</span>
          </div>
          <div className="space-y-3">
            {polymarket.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
