"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { TOPIC_COLORS as SHARED_TOPIC_COLORS } from "../../lib/topic-colors";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { SOURCE_DEFINITIONS, TOPICS } from "../../lib/sources";

// ── Types ─────────────────────────────────────────────────────────────────────

type Story = {
  id: string;
  title: string;
  topic: string;
  score: number;
  sourceIds: string[];
  timestamp: string;
};

type Analytics = {
  topicCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  topicAvgScores: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  hourlyActivity: number[];
  topicHourly: Record<string, number[]>;
  scatterPoints: { topic: string; score: number; ageHours: number; title: string }[];
  totalStories: number;
  activeSources: number;
  overallAvgScore: number;
};

type Tooltip = { x: number; y: number; label: string; value: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const TOPIC_COLORS: Record<string, string> = SHARED_TOPIC_COLORS;

const CATEGORY_COLORS: Record<string, string> = {
  news: "#ff3e00",
  finance: "#f59e0b",
  science: "#10b981",
  geopolitics: "#ef4444",
  transport: "#f97316",
  cyber: "#8b5cf6",
  government: "#3b82f6",
};

const SOURCE_LABEL_MAP = Object.fromEntries(SOURCE_DEFINITIONS.map((s) => [s.id, s.label]));
const SOURCE_CATEGORY_MAP = Object.fromEntries(SOURCE_DEFINITIONS.map((s) => [s.id, s.category]));

const TABS = [
  { id: "topology", label: "Signal Topology", icon: "radar" },
  { id: "sources", label: "Source Ranking", icon: "bar_chart" },
  { id: "dna", label: "Source DNA", icon: "donut_large" },
  { id: "spectrum", label: "Signal Spectrum", icon: "scatter_plot" },
  { id: "heatmap", label: "Temporal Map", icon: "grid_on" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Compute Analytics ─────────────────────────────────────────────────────────

function computeAnalytics(stories: Story[]): Analytics {
  const topicCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const topicScoreSums: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  const hourlyActivity = Array<number>(24).fill(0);
  const topicHourly: Record<string, number[]> = {};
  const scatterPoints: Analytics["scatterPoints"] = [];

  for (const t of TOPICS) topicHourly[t] = Array<number>(24).fill(0);

  const now = Date.now();

  for (const story of stories) {
    topicCounts[story.topic] = (topicCounts[story.topic] ?? 0) + 1;
    topicScoreSums[story.topic] = (topicScoreSums[story.topic] ?? 0) + story.score;

    for (const srcId of story.sourceIds) {
      sourceCounts[srcId] = (sourceCounts[srcId] ?? 0) + 1;
      const cat = SOURCE_CATEGORY_MAP[srcId] ?? "news";
      categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;
    }

    const ageMs = now - new Date(story.timestamp).getTime();
    const ageHours = ageMs / 3_600_000;

    if (ageHours >= 0 && ageHours < 24) {
      const bucket = Math.floor(ageHours);
      hourlyActivity[bucket] = (hourlyActivity[bucket] ?? 0) + 1;
      const th = topicHourly[story.topic];
      if (th) th[bucket] = (th[bucket] ?? 0) + 1;
    }

    if (ageHours >= 0 && ageHours <= 72) {
      scatterPoints.push({ topic: story.topic, score: story.score, ageHours, title: story.title });
    }
  }

  const topicAvgScores: Record<string, number> = {};
  for (const topic of Object.keys(topicCounts)) {
    topicAvgScores[topic] = (topicScoreSums[topic] ?? 0) / (topicCounts[topic] ?? 1);
  }

  const totalScore = stories.reduce((s, st) => s + st.score, 0);

  return {
    topicCounts,
    sourceCounts,
    topicAvgScores,
    categoryBreakdown,
    hourlyActivity,
    topicHourly,
    scatterPoints,
    totalStories: stories.length,
    activeSources: Object.keys(sourceCounts).length,
    overallAvgScore: stories.length > 0 ? totalScore / stories.length : 0,
  };
}

// ── Animated Counter ──────────────────────────────────────────────────────────

function AnimatedCounter({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(eased * value);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <>{decimals > 0 ? display.toFixed(decimals) : Math.floor(display)}</>;
}

// ── Radar Chart ───────────────────────────────────────────────────────────────

function RadarChart({
  analytics,
  selected,
  onSelect,
  tooltip,
  setTooltip,
}: {
  analytics: Analytics;
  selected: string | null;
  onSelect: (t: string | null) => void;
  tooltip: Tooltip | null;
  setTooltip: (t: Tooltip | null) => void;
}) {
  const cx = 260;
  const cy = 260;
  const maxR = 180;
  const rings = [0.25, 0.5, 0.75, 1.0];
  const maxCount = Math.max(...TOPICS.map((t) => analytics.topicCounts[t] ?? 0), 1);

  const points = TOPICS.map((topic, i) => {
    const angle = (i / TOPICS.length) * Math.PI * 2 - Math.PI / 2;
    const count = analytics.topicCounts[topic] ?? 0;
    const r = (count / maxCount) * maxR;
    return {
      topic,
      angle,
      r,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      labelX: cx + Math.cos(angle) * (maxR + 28),
      labelY: cy + Math.sin(angle) * (maxR + 28),
    };
  });

  const polygonPts = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      <svg viewBox="0 0 520 520" className="w-full max-w-[520px] h-auto">
        {/* Grid rings */}
        {rings.map((frac) => (
          <circle
            key={frac}
            cx={cx}
            cy={cy}
            r={maxR * frac}
            fill="none"
            stroke="white"
            strokeWidth={0.5}
            strokeOpacity={0.08}
          />
        ))}
        {/* Ring labels */}
        {rings.map((frac) => (
          <text
            key={`lbl-${frac}`}
            x={cx + 4}
            y={cy - maxR * frac + 10}
            fill="white"
            fillOpacity={0.2}
            fontSize={7}
            fontFamily="'IBM Plex Mono', monospace"
          >
            {Math.round(frac * 100)}%
          </text>
        ))}

        {/* Axis lines */}
        {points.map((p) => (
          <line
            key={`axis-${p.topic}`}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(p.angle) * maxR}
            y2={cy + Math.sin(p.angle) * maxR}
            stroke="white"
            strokeWidth={0.5}
            strokeOpacity={0.08}
          />
        ))}

        {/* Filled polygon */}
        <motion.polygon
          points={polygonPts}
          fill="#ff3e00"
          fillOpacity={0.12}
          stroke="#ff3e00"
          strokeWidth={1.5}
          initial={{ scale: 0, originX: `${cx}px`, originY: `${cy}px` }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />

        {/* Topic dots + labels */}
        {points.map((p) => {
          const isSelected = selected === p.topic;
          const isDimmed = selected !== null && !isSelected;
          const color = TOPIC_COLORS[p.topic] ?? "#ff3e00";
          return (
            <g
              key={p.topic}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(isSelected ? null : p.topic)}
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  label: p.topic,
                  value: `${analytics.topicCounts[p.topic] ?? 0} signals · avg ${(analytics.topicAvgScores[p.topic] ?? 0).toFixed(1)}`,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isSelected ? 9 : 6}
                fill={color}
                opacity={isDimmed ? 0.25 : 1}
                style={{ transition: "all 0.2s" }}
              />
              {isSelected && (
                <circle cx={p.x} cy={p.y} r={14} fill={color} fillOpacity={0.2} />
              )}
              <text
                x={p.labelX}
                y={p.labelY}
                fill="white"
                fillOpacity={isDimmed ? 0.2 : 0.7}
                fontSize={8.5}
                fontFamily="'IBM Plex Mono', monospace"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ transition: "all 0.2s", pointerEvents: "none" }}
              >
                {p.topic.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Center label */}
        <text x={cx} y={cy - 8} fill="white" fillOpacity={0.3} fontSize={9} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">
          SIGNAL
        </text>
        <text x={cx} y={cy + 6} fill="white" fillOpacity={0.3} fontSize={9} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">
          TOPOLOGY
        </text>
      </svg>

      <div className="absolute top-3 left-3 text-[8px] font-mono text-white/60 uppercase tracking-[0.3em]">
        Topic distribution · normalized · click to filter
      </div>
    </div>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({
  analytics,
  selected,
  tooltip,
  setTooltip,
}: {
  analytics: Analytics;
  selected: string | null;
  tooltip: Tooltip | null;
  setTooltip: (t: Tooltip | null) => void;
}) {
  const sorted = Object.entries(analytics.sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 14);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div className="w-full h-full overflow-y-auto pr-2 flex flex-col gap-3 py-2">
      <p className="text-[8px] font-mono text-white/60 uppercase tracking-[0.3em] mb-1">
        Source influence ranking · stories contributed
      </p>
      {sorted.map(([srcId, count], i) => {
        const label = SOURCE_LABEL_MAP[srcId] ?? srcId;
        const cat = SOURCE_CATEGORY_MAP[srcId] ?? "news";
        const color = CATEGORY_COLORS[cat] ?? "#ff3e00";
        const pct = (count / max) * 100;

        return (
          <div
            key={srcId}
            className="group"
            onMouseEnter={(e) =>
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                label,
                value: `${count} stories · ${cat}`,
              })
            }
            onMouseLeave={() => setTooltip(null)}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[8px] font-mono text-white/60 w-4 text-right flex-shrink-0">{i + 1}</span>
              <span className="text-[10px] font-mono text-white/70 group-hover:text-white transition-colors truncate flex-1">
                {label}
              </span>
              <span className="text-[9px] font-mono text-white/65 flex-shrink-0">{count}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 flex-shrink-0" />
              <div className="flex-1 h-[6px] bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.04, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function DonutChart({
  analytics,
  tooltip,
  setTooltip,
}: {
  analytics: Analytics;
  tooltip: Tooltip | null;
  setTooltip: (t: Tooltip | null) => void;
}) {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const R = 100;
  const innerR = 62;
  const C = 2 * Math.PI * R;
  const cx = 150;
  const cy = 150;

  const entries = Object.entries(analytics.categoryBreakdown).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  let cumulative = 0;
  const segments = entries.map(([cat, count]) => {
    const fraction = count / total;
    const dashLen = fraction * C;
    const offset = cumulative;
    cumulative += dashLen;
    return { cat, count, fraction, dashLen, offset };
  });

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
      <p className="text-[8px] font-mono text-white/60 uppercase tracking-[0.3em]">
        Source category breakdown
      </p>
      <div className="relative">
        <svg width={300} height={300} viewBox="0 0 300 300">
          {segments.map(({ cat, count, fraction, dashLen, offset }, i) => {
            const color = CATEGORY_COLORS[cat] ?? "#666";
            const isHovered = hoveredCat === cat;
            return (
              <motion.circle
                key={cat}
                cx={cx}
                cy={cy}
                r={R}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? R - innerR + 6 : R - innerR}
                strokeDasharray={`${dashLen} ${C}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ cursor: "pointer", transition: "stroke-width 0.2s" }}
                initial={{ strokeDashoffset: C - offset }}
                animate={{ strokeDashoffset: -offset }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                onMouseEnter={(e) => {
                  setHoveredCat(cat);
                  setTooltip({
                    x: (e as unknown as MouseEvent).clientX,
                    y: (e as unknown as MouseEvent).clientY,
                    label: cat.charAt(0).toUpperCase() + cat.slice(1),
                    value: `${count} signals · ${(fraction * 100).toFixed(1)}%`,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredCat(null);
                  setTooltip(null);
                }}
              />
            );
          })}

          {/* Center */}
          <circle cx={cx} cy={cy} r={innerR - 4} fill="#111" />
          <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize={22} fontWeight="800" fontFamily="'IBM Plex Mono', monospace">
            {total}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="white" fillOpacity={0.3} fontSize={8} fontFamily="'IBM Plex Mono', monospace">
            SIGNALS
          </text>
          <text x={cx} y={cy + 22} textAnchor="middle" fill="white" fillOpacity={0.3} fontSize={8} fontFamily="'IBM Plex Mono', monospace">
            INDEXED
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
        {segments.map(({ cat, count, fraction }) => (
          <div key={cat} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: CATEGORY_COLORS[cat] ?? "#666" }}
            />
            <span className="text-[9px] font-mono text-white/70 uppercase">{cat}</span>
            <span className="text-[9px] font-mono text-white/60 ml-auto">{(fraction * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scatter Plot ──────────────────────────────────────────────────────────────

function ScatterPlot({
  analytics,
  selected,
  tooltip,
  setTooltip,
}: {
  analytics: Analytics;
  selected: string | null;
  tooltip: Tooltip | null;
  setTooltip: (t: Tooltip | null) => void;
}) {
  const W = 520;
  const H = 340;
  const pad = { top: 24, right: 20, bottom: 40, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const maxAge = 48;

  const scaleX = (hours: number) => pad.left + ((maxAge - hours) / maxAge) * innerW;
  const scaleY = (score: number) => pad.top + innerH - (score / 100) * innerH;

  const pts = analytics.scatterPoints.filter((p) => p.ageHours <= maxAge);

  // Y gridlines
  const yGrid = [0, 25, 50, 75, 100];
  // X gridlines
  const xGrid = [0, 12, 24, 36, 48];

  return (
    <div className="w-full h-full flex flex-col">
      <p className="text-[8px] font-mono text-white/60 uppercase tracking-[0.3em] mb-3">
        Signal strength vs recency · {pts.length} data points · hover for title
      </p>
      <div className="flex-1 flex items-center justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[600px]">
          {/* Y grid */}
          {yGrid.map((v) => (
            <g key={`yg-${v}`}>
              <line
                x1={pad.left}
                y1={scaleY(v)}
                x2={W - pad.right}
                y2={scaleY(v)}
                stroke="white"
                strokeWidth={0.4}
                strokeOpacity={0.06}
              />
              <text x={pad.left - 6} y={scaleY(v) + 3} fill="white" fillOpacity={0.2} fontSize={7} textAnchor="end" fontFamily="'IBM Plex Mono', monospace">
                {v}
              </text>
            </g>
          ))}

          {/* X grid */}
          {xGrid.map((v) => (
            <g key={`xg-${v}`}>
              <line
                x1={scaleX(v)}
                y1={pad.top}
                x2={scaleX(v)}
                y2={H - pad.bottom}
                stroke="white"
                strokeWidth={0.4}
                strokeOpacity={0.06}
              />
              <text x={scaleX(v)} y={H - pad.bottom + 14} fill="white" fillOpacity={0.2} fontSize={7} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">
                {v === 0 ? "now" : `${v}h`}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={H - pad.bottom} stroke="white" strokeWidth={0.5} strokeOpacity={0.15} />
          <line x1={pad.left} y1={H - pad.bottom} x2={W - pad.right} y2={H - pad.bottom} stroke="white" strokeWidth={0.5} strokeOpacity={0.15} />

          {/* Axis labels */}
          <text x={W / 2} y={H - 4} fill="white" fillOpacity={0.2} fontSize={7} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">AGE (HOURS)</text>
          <text x={10} y={H / 2} fill="white" fillOpacity={0.2} fontSize={7} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" transform={`rotate(-90, 10, ${H / 2})`}>SCORE</text>

          {/* Data points */}
          {pts.map((p, i) => {
            const isDimmed = selected !== null && selected !== p.topic;
            const color = TOPIC_COLORS[p.topic] ?? "#fff";
            return (
              <motion.circle
                key={i}
                cx={scaleX(p.ageHours)}
                cy={scaleY(p.score)}
                r={5}
                fill={color}
                fillOpacity={isDimmed ? 0.05 : 0.75}
                stroke={color}
                strokeWidth={isDimmed ? 0 : 0.5}
                strokeOpacity={0.4}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.002, 0.4) }}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: (e as unknown as MouseEvent).clientX,
                    y: (e as unknown as MouseEvent).clientY,
                    label: p.topic,
                    value: `${p.title.slice(0, 60)}${p.title.length > 60 ? "…" : ""} · Score ${p.score.toFixed(0)}`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* Topic legend */}
      <div className="flex flex-wrap gap-4 mt-2 justify-center">
        {TOPICS.map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: TOPIC_COLORS[t] ?? "#fff" }} />
            <span className="text-[8px] font-mono text-white/65 uppercase">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function HeatmapChart({
  analytics,
  tooltip,
  setTooltip,
}: {
  analytics: Analytics;
  tooltip: Tooltip | null;
  setTooltip: (t: Tooltip | null) => void;
}) {
  const topics = TOPICS.filter((t) => analytics.topicCounts[t]);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const maxCell = Math.max(
    ...topics.flatMap((t) => (analytics.topicHourly[t] ?? []).map((v) => v)),
    1,
  );

  const cellColor = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.03)";
    const intensity = count / maxCell;
    const r = Math.round(28 + intensity * (255 - 28));
    const g = Math.round(25 + intensity * (62 - 25));
    const b = Math.round(23 + intensity * (0 - 23));
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <p className="text-[8px] font-mono text-white/60 uppercase tracking-[0.3em]">
        Topic activity by hour · last 24h · brighter = more signals
      </p>

      {/* Hour labels */}
      <div className="flex gap-[3px] pl-[88px]">
        {hours.map((h) => (
          <div key={h} className="flex-1 text-center text-[6px] font-mono text-white/60">
            {h === 0 ? "now" : h % 6 === 0 ? `${h}h` : ""}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex flex-col gap-[3px]">
        {topics.map((topic) => {
          const hourData = analytics.topicHourly[topic] ?? Array(24).fill(0);
          const color = TOPIC_COLORS[topic] ?? "#fff";
          return (
            <div key={topic} className="flex items-center gap-[3px]">
              <div
                className="w-[80px] text-right text-[9px] font-mono pr-2 flex-shrink-0"
                style={{ color }}
              >
                {topic}
              </div>
              {hours.map((h) => {
                const count = hourData[h] ?? 0;
                return (
                  <motion.div
                    key={h}
                    className="flex-1 rounded-[2px]"
                    style={{
                      height: 28,
                      background: count > 0 ? cellColor(count) : "rgba(255,255,255,0.03)",
                      border: count > 0 ? `1px solid ${color}22` : "1px solid transparent",
                      cursor: "pointer",
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: (topics.indexOf(topic) * 24 + h) * 0.002 }}
                    onMouseEnter={(e) =>
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        label: `${topic} · ${h}h ago`,
                        value: count > 0 ? `${count} signal${count !== 1 ? "s" : ""}` : "No activity",
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Overall hourly bar */}
      <div className="mt-4">
        <p className="text-[7px] font-mono text-white/60 uppercase tracking-widest mb-1 pl-[88px]">All topics combined</p>
        <div className="flex items-end gap-[3px] pl-[88px]" style={{ height: 40 }}>
          {hours.map((h) => {
            const count = analytics.hourlyActivity[h] ?? 0;
            const maxHourly = Math.max(...analytics.hourlyActivity, 1);
            const pct = (count / maxHourly) * 100;
            return (
              <motion.div
                key={h}
                className="flex-1 rounded-t-[2px]"
                style={{ background: "#ff3e00", minHeight: 2 }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(pct, 4)}%` }}
                transition={{ duration: 0.5, delay: h * 0.02, ease: "easeOut" }}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    label: h === 0 ? "Last hour" : `${h}h ago`,
                    value: `${count} signals`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("topology");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const fetchData = useCallback(async (force = false) => {
    try {
      const res = await fetch(force ? "/api/live?refresh=1" : "/api/live");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(computeAnalytics(data.stories ?? []));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  };

  if (loading || !analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1c1917]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/10 border-t-[#ff3e00] rounded-full animate-spin" />
          <p className="font-mono text-[10px] text-white/60 uppercase tracking-[0.3em]">Rendering analytics…</p>
        </div>
      </div>
    );
  }

  const topicsSorted = TOPICS.filter((t) => analytics.topicCounts[t]).sort(
    (a, b) => (analytics.topicCounts[b] ?? 0) - (analytics.topicCounts[a] ?? 0),
  );
  const maxTopicCount = Math.max(...topicsSorted.map((t) => analytics.topicCounts[t] ?? 0), 1);

  return (
    <div className="min-h-screen bg-[#1c1917] text-white overflow-x-hidden">
      {/* Fixed tooltip */}
      {tooltip && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          <div className="bg-[#0d0d0b] border border-white/10 rounded-xl px-3 py-2 shadow-2xl max-w-[280px]">
            <p className="text-[10px] font-mono font-bold text-white/80 mb-0.5">{tooltip.label}</p>
            <p className="text-[9px] font-mono text-white/65">{tooltip.value}</p>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 bg-[#ff3e00] rounded-full shadow-[0_0_12px_rgba(255,62,0,0.8)] animate-pulse" />
              <span className="font-mono text-[10px] font-bold text-[#ff3e00] uppercase tracking-widest">Signal Analytics</span>
            </div>
            <h1 className="font-headline text-5xl font-black text-white tracking-tight leading-none mb-3 uppercase">
              Intelligence<br />Observatory
            </h1>
            <p className="text-[11px] text-white/60 max-w-lg font-mono uppercase tracking-[0.12em] leading-relaxed">
              Real-time multi-dimensional analysis of global news vectors, source topology, and temporal signal patterns.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
            >
              <span className={`material-symbols-outlined text-[16px] ${refreshing ? "animate-spin" : ""}`}>refresh</span>
              {refreshing ? "Syncing…" : "Sync Data"}
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 px-5 py-3 bg-[#ff3e00] rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[#e03500] transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Live Feed
            </Link>
          </div>
        </header>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Total Signals", value: analytics.totalStories, icon: "article", color: "#ff3e00" },
            { label: "Active Sources", value: analytics.activeSources, icon: "hub", color: "#6366f1" },
            { label: "Topics Live", value: topicsSorted.length, icon: "category", color: "#10b981" },
            { label: "Avg Score", value: analytics.overallAvgScore, decimals: 1, icon: "analytics", color: "#f59e0b" },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="bg-white/5 border border-white/8 rounded-2xl p-6 relative overflow-hidden group hover:border-white/15 transition-all"
            >
              <div
                className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 group-hover:opacity-10 transition-opacity"
                style={{ background: kpi.color, transform: "translate(30%, -30%)" }}
              />
              <div className="flex items-start justify-between mb-3">
                <span
                  className="material-symbols-outlined text-[20px] opacity-60"
                  style={{ color: kpi.color }}
                >
                  {kpi.icon}
                </span>
              </div>
              <p className="text-4xl font-black font-headline tracking-tight" style={{ color: kpi.color }}>
                <AnimatedCounter value={kpi.value} decimals={kpi.decimals ?? 0} />
              </p>
              <p className="text-[9px] font-mono text-white/60 uppercase tracking-widest mt-1">{kpi.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Chart Area */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Tab Strip */}
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/8">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono text-[9px] font-bold uppercase tracking-widest transition-all"
                  style={{
                    background: activeTab === tab.id ? "#ff3e00" : "transparent",
                    color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.3)",
                  }}
                >
                  <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Chart Panel */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-8 min-h-[540px] flex flex-col relative overflow-hidden">
              {/* Background dot grid */}
              <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                  backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="flex-1 flex flex-col"
                >
                  {activeTab === "topology" && (
                    <RadarChart
                      analytics={analytics}
                      selected={selectedTopic}
                      onSelect={setSelectedTopic}
                      tooltip={tooltip}
                      setTooltip={setTooltip}
                    />
                  )}
                  {activeTab === "sources" && (
                    <BarChart
                      analytics={analytics}
                      selected={selectedTopic}
                      tooltip={tooltip}
                      setTooltip={setTooltip}
                    />
                  )}
                  {activeTab === "dna" && (
                    <DonutChart
                      analytics={analytics}
                      tooltip={tooltip}
                      setTooltip={setTooltip}
                    />
                  )}
                  {activeTab === "spectrum" && (
                    <ScatterPlot
                      analytics={analytics}
                      selected={selectedTopic}
                      tooltip={tooltip}
                      setTooltip={setTooltip}
                    />
                  )}
                  {activeTab === "heatmap" && (
                    <HeatmapChart
                      analytics={analytics}
                      tooltip={tooltip}
                      setTooltip={setTooltip}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Topic Breakdown */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-mono text-[10px] font-black text-white/65 uppercase tracking-[0.3em]">Topic Breakdown</h3>
                {selectedTopic && (
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className="text-[8px] font-mono text-[#ff3e00] uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {topicsSorted.map((topic) => {
                  const count = analytics.topicCounts[topic] ?? 0;
                  const pct = (count / maxTopicCount) * 100;
                  const color = TOPIC_COLORS[topic] ?? "#ff3e00";
                  const isSelected = selectedTopic === topic;
                  const isDimmed = selectedTopic !== null && !isSelected;

                  return (
                    <button
                      key={topic}
                      onClick={() => setSelectedTopic(isSelected ? null : topic)}
                      className="group text-left transition-all"
                      style={{ opacity: isDimmed ? 0.3 : 1 }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-[10px] font-mono text-white/70 group-hover:text-white transition-colors flex-1">
                          {topic}
                        </span>
                        <span className="text-[9px] font-mono text-white/60">{count}</span>
                      </div>
                      <div className="ml-4 h-[3px] bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                      <div className="ml-4 mt-1 flex items-center gap-2">
                        <span className="text-[8px] font-mono text-white/60">
                          avg {(analytics.topicAvgScores[topic] ?? 0).toFixed(0)} score
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Top Sources */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-6 flex-1">
              <h3 className="font-mono text-[10px] font-black text-white/65 uppercase tracking-[0.3em] mb-5">
                Top Sources
              </h3>
              <div className="flex flex-col gap-2">
                {Object.entries(analytics.sourceCounts)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([srcId, count], i) => {
                    const label = SOURCE_LABEL_MAP[srcId] ?? srcId;
                    const cat = SOURCE_CATEGORY_MAP[srcId] ?? "news";
                    const color = CATEGORY_COLORS[cat] ?? "#ff3e00";
                    return (
                      <motion.div
                        key={srcId}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
                      >
                        <span className="text-[7px] font-mono text-white/60 w-4">{i + 1}</span>
                        <div
                          className="w-1.5 h-6 rounded-full flex-shrink-0"
                          style={{ background: color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono text-white/70 truncate">{label}</p>
                          <p className="text-[8px] font-mono text-white/60 capitalize">{cat}</p>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-white/65 flex-shrink-0">{count}</span>
                      </motion.div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-10 pt-6 border-t border-white/5 flex justify-between items-center">
          <div className="flex gap-6">
            <Link href="/" className="font-mono text-[8px] font-bold text-white/60 hover:text-[#ff3e00] transition-colors uppercase tracking-widest">
              Live Feed
            </Link>
            <Link href="/news-graph" className="font-mono text-[8px] font-bold text-white/60 hover:text-[#ff3e00] transition-colors uppercase tracking-widest">
              Network Graph
            </Link>
            <Link href="/sources" className="font-mono text-[8px] font-bold text-white/60 hover:text-[#ff3e00] transition-colors uppercase tracking-widest">
              Source Catalog
            </Link>
          </div>
          <div className="font-mono text-[8px] text-white/60 uppercase tracking-widest">
            Signal Observatory · v1.0
          </div>
        </footer>
      </div>
    </div>
  );
}
