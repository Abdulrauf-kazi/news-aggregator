"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import styles from "./IntelFeedSidebar.module.css";
import { FEED_DATA, WHALE_DATA, FLIGHTS_DATA } from "./data";

// ─── Icon Components ────────────────────────────────────────────────────────

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="5.5" height="5.5" rx="0.5" fill="currentColor" />
    <rect x="8.5" y="1" width="5.5" height="5.5" rx="0.5" fill="currentColor" />
    <rect x="1" y="8.5" width="5.5" height="5.5" rx="0.5" fill="currentColor" />
    <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="0.5" fill="currentColor" />
  </svg>
);

const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.636 5.903-5.636Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const TelegramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.026 9.547c-.148.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.088 14.16l-2.948-.924c-.64-.203-.654-.64.136-.948l11.526-4.445c.534-.194 1.001.13.76.405z" />
  </svg>
);

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const ShareIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

const LinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const WhaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
    <path d="M21.5 15.5a1 1 0 01-.5.87C19.5 17.5 17.5 18 15 18c-3 0-5-1-7-1-1.5 0-2.86.5-4 1.5a1 1 0 01-1.6-.8V16a2 2 0 011-1.73C4.9 13.46 6.42 13 8 13c.95 0 1.9.18 2.8.5L13 12l-3-3a1 1 0 010-1.41l4.5-4.5a1 1 0 011.42 0L20 7.17V5a1 1 0 012 0v10a.5.5 0 01-.5.5z" />
  </svg>
);

const PlaneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "CRITICAL" | "HIGH" | "LOW";
type Platform = "TWEET" | "TELEGRAM" | "NEWS" | "REDDIT";
type Tab = "FEED" | "WHALE TRACKER" | "FLIGHTS";
type FilterPriority = "Critical" | "High" | "Low";

// ─── Sub Components ──────────────────────────────────────────────────────────

const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`${styles.badge} ${styles[`badge_${priority.toLowerCase()}`]}`}>
    {priority}
  </span>
);

const PlatformBadge = ({ platform }: { platform: Platform }) => (
  <span className={`${styles.badge} ${styles.badge_platform}`}>{platform}</span>
);

const CategoryBadge = ({ category }: { category: string }) => (
  <span className={`${styles.badge} ${styles.badge_category}`}>{category}</span>
);

const RepBadge = ({ rep }: { rep: string }) => (
  <span className={`${styles.rep_badge} ${rep === "HIGH REP" ? styles.rep_high : styles.rep_med}`}>
    {rep}
  </span>
);

// ─── Feed Card ────────────────────────────────────────────────────────────────

interface FeedItem {
  id: number;
  avatar: string;
  name: string;
  handle: string;
  rep: string;
  timestamp: string;
  platform: Platform;
  priority: Priority;
  category: string;
  text: string;
  url?: string;
}

const FeedCard = ({ item }: { item: FeedItem }) => (
  <div className={styles.feed_card}>
    <div className={styles.card_header}>
      <div className={styles.avatar_wrap}>
        <div className={styles.avatar} style={{ background: item.avatar }}>
          {item.name.charAt(0)}
        </div>
        <div className={styles.avatar_online} />
      </div>
      <div className={styles.card_meta}>
        <div className={styles.name_row}>
          <span className={styles.source_name}>{item.name}</span>
          <RepBadge rep={item.rep} />
        </div>
        <span className={styles.handle}>{item.handle}</span>
      </div>
      <span className={styles.timestamp}>{item.timestamp}</span>
    </div>
    <div className={styles.badge_row}>
      <PlatformBadge platform={item.platform} />
      <PriorityBadge priority={item.priority} />
      <CategoryBadge category={item.category} />
    </div>
    <p className={styles.card_text}>{item.text}</p>
    {item.url && (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.card_url}>
        <LinkIcon />
        <span>{item.url.replace(/^https?:\/\//, "")}</span>
      </a>
    )}
  </div>
);

// ─── Whale Row ────────────────────────────────────────────────────────────────

interface WhaleItem {
  id: number;
  from: string;
  to: string;
  amount: string;
  token: string;
  usdValue: string;
  timestamp: string;
  type: "BUY" | "SELL" | "TRANSFER";
  txHash: string;
}

const WhaleCard = ({ item }: { item: WhaleItem }) => (
  <div className={styles.whale_card}>
    <div className={styles.whale_header}>
      <div className={styles.whale_icon_wrap}>
        <WhaleIcon />
      </div>
      <div className={styles.whale_addresses}>
        <div className={styles.whale_addr_row}>
          <span className={styles.whale_label}>FROM</span>
          <span className={styles.whale_addr}>{item.from}</span>
        </div>
        <div className={styles.whale_addr_row}>
          <span className={styles.whale_label}>TO</span>
          <span className={styles.whale_addr}>{item.to}</span>
        </div>
      </div>
      <span className={styles.timestamp}>{item.timestamp}</span>
    </div>
    <div className={styles.whale_amount_row}>
      <span className={`${styles.whale_type} ${styles[`whale_type_${item.type.toLowerCase()}`]}`}>
        {item.type}
      </span>
      <span className={styles.whale_token}>{item.amount} {item.token}</span>
      <span className={styles.whale_usd}>{item.usdValue}</span>
    </div>
    <a
      href={`https://etherscan.io/tx/${item.txHash}`}
      className={styles.card_url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <LinkIcon />
      <span>etherscan.io/tx/{item.txHash.slice(0, 12)}…</span>
    </a>
  </div>
);

// ─── Flight Row ───────────────────────────────────────────────────────────────

interface FlightItem {
  id: number;
  callsign: string;
  type: string;
  from: string;
  to: string;
  altitude: string;
  speed: string;
  status: "AIRBORNE" | "LANDED" | "DIVERTED";
  category: "ISR" | "VIP" | "Bomber" | "Command" | "Tanker" | "Transport" | "Fighter";
  timestamp: string;
}

const categoryColor: Record<string, string> = {
  ISR: "#ef4444",
  VIP: "#a855f7",
  Bomber: "#f97316",
  Command: "#ec4899",
  Tanker: "#eab308",
  Transport: "#3b82f6",
  Fighter: "#14b8a6",
};

const FlightCard = ({ item }: { item: FlightItem }) => (
  <div className={styles.flight_card}>
    <div className={styles.flight_header}>
      <div className={styles.flight_icon} style={{ color: categoryColor[item.category] }}>
        <PlaneIcon />
      </div>
      <div className={styles.flight_info}>
        <div className={styles.flight_top}>
          <span className={styles.flight_callsign}>{item.callsign}</span>
          <span className={styles.flight_type}>{item.type}</span>
          <span className={`${styles.flight_status} ${styles[`flight_status_${item.status.toLowerCase()}`]}`}>
            {item.status}
          </span>
        </div>
        <div className={styles.flight_route}>
          <span>{item.from}</span>
          <span className={styles.route_arrow}>→</span>
          <span>{item.to}</span>
        </div>
      </div>
      <span className={styles.timestamp}>{item.timestamp}</span>
    </div>
    <div className={styles.flight_stats}>
      <div className={styles.flight_stat}>
        <span className={styles.stat_label}>ALT</span>
        <span className={styles.stat_value}>{item.altitude}</span>
      </div>
      <div className={styles.flight_stat}>
        <span className={styles.stat_label}>SPD</span>
        <span className={styles.stat_value}>{item.speed}</span>
      </div>
      <div className={styles.flight_stat}>
        <span className={styles.stat_label}>CAT</span>
        <span className={styles.stat_value} style={{ color: categoryColor[item.category] }}>
          {item.category}
        </span>
      </div>
    </div>
  </div>
);

// ─── Chevron Icon ─────────────────────────────────────────────────────────────

const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function IntelFeedSidebar() {
  // ── closed by default ──
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("FEED");
  const [activeFilters, setActiveFilters] = useState<FilterPriority[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIcons, setActiveIcons] = useState<Set<string>>(new Set());

  // Listen to the Navbar "toggle-sidebar" event
  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  const toggleFilter = useCallback((f: FilterPriority) => {
    setActiveFilters((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }, []);

  const toggleIcon = useCallback((name: string) => {
    setActiveIcons((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }, []);

  const filteredFeed = useMemo(() => {
    let items = FEED_DATA;
    if (activeFilters.length > 0) {
      const priorities = activeFilters.map((f) => f.toUpperCase() as Priority);
      items = items.filter((item) => priorities.includes(item.priority));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.text.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [activeFilters, searchQuery]);

  const tabs: { id: Tab; count: number; icon: React.ReactNode }[] = [
    { id: "FEED", count: FEED_DATA.length, icon: <GridIcon /> },
    { id: "WHALE TRACKER", count: WHALE_DATA.length, icon: <WhaleIcon /> },
    { id: "FLIGHTS", count: FLIGHTS_DATA.length, icon: <PlaneIcon /> },
  ];

  const iconButtons = [
    { name: "grid", icon: <GridIcon /> },
    { name: "twitter", icon: <XIcon /> },
    { name: "copy", icon: <CopyIcon /> },
    { name: "telegram", icon: <TelegramIcon /> },
    { name: "eye", icon: <EyeIcon /> },
    { name: "bell", icon: <BellIcon /> },
  ];

  const filterPills: FilterPriority[] = ["Critical", "High", "Low"];

  // ── Collapsed Rail ──────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <aside className={styles.sidebar_collapsed}>
        <button
          className={styles.collapsed_toggle}
          onClick={() => setIsOpen(true)}
          title="Open Intel Feed"
        >
          <ChevronLeftIcon />
        </button>
        <div className={styles.collapsed_tabs}>
          {tabs.map(({ id, icon, count }) => (
            <button
              key={id}
              className={`${styles.collapsed_tab_btn} ${activeTab === id ? styles.collapsed_tab_active : ""}`}
              title={`${id} (${count})`}
              onClick={() => { setActiveTab(id); setIsOpen(true); }}
            >
              {icon}
              {id === "FLIGHTS" && (
                <span className={styles.collapsed_badge}>{count}</span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.collapsed_live}>
          <span className={styles.live_dot} />
        </div>
      </aside>
    );
  }

  // ── Full Sidebar ────────────────────────────────────────────────────────────
  return (
    <aside className={styles.sidebar}>
      {/* ── Tab Bar ───────────────────────────────────────── */}
      <div className={styles.tab_bar}>
        {tabs.map(({ id, count }) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.tab_active : ""}`}
            onClick={() => setActiveTab(id)}
          >
            <span className={styles.tab_label}>{id}</span>
            <span className={`${styles.tab_badge} ${activeTab === id ? styles.tab_badge_active : ""}`}>
              ({count})
            </span>
          </button>
        ))}
        <div className={styles.live_dot_wrap}>
          <span className={styles.live_dot} />
          <span className={styles.live_text}>LIVE</span>
        </div>
        {/* Close chevron */}
        <button
          className={styles.close_chevron}
          onClick={() => setIsOpen(false)}
          title="Collapse sidebar"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* ── Icon Row ──────────────────────────────────────── */}
      <div className={styles.icon_row}>
        <div className={styles.icon_group}>
          {iconButtons.map(({ name, icon }) => (
            <button
              key={name}
              title={name}
              className={`${styles.icon_btn} ${activeIcons.has(name) ? styles.icon_btn_active : ""}`}
              onClick={() => toggleIcon(name)}
            >
              {icon}
            </button>
          ))}
        </div>
        <div className={styles.search_wrap}>
          <SearchIcon />
          <input
            className={styles.search_input}
            placeholder="Search feed..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Filter Pills ─────────────────────────────────── */}
      {activeTab === "FEED" && (
        <div className={styles.filter_row}>
          {filterPills.map((pill) => (
            <button
              key={pill}
              className={`${styles.filter_pill} ${
                activeFilters.includes(pill)
                  ? styles[`pill_${pill.toLowerCase()}_active`]
                  : styles.pill_inactive
              }`}
              onClick={() => toggleFilter(pill)}
            >
              {pill}
            </button>
          ))}
          <div className={styles.filter_divider} />
          <button className={styles.add_pill}>+ Topic</button>
          <button className={styles.add_pill}>+ Category</button>
          <button className={styles.add_pill}>+ Country</button>
          <button className={styles.gear_btn} title="Settings">
            <GearIcon />
          </button>
        </div>
      )}

      {/* ── Feed Content ─────────────────────────────────── */}
      <div className={styles.feed_scroll}>
        {activeTab === "FEED" && (
          <>
            {filteredFeed.length === 0 ? (
              <div className={styles.empty_state}>
                <span>No intel matching filters</span>
              </div>
            ) : (
              filteredFeed.map((item) => <FeedCard key={item.id} item={item} />)
            )}
          </>
        )}

        {activeTab === "WHALE TRACKER" && (
          <>
            <div className={styles.section_header}>
              <WhaleIcon />
              <span>ON-CHAIN WHALE MOVEMENTS</span>
            </div>
            {WHALE_DATA.map((item) => (
              <WhaleCard key={item.id} item={item} />
            ))}
          </>
        )}

        {activeTab === "FLIGHTS" && (
          <>
            <div className={styles.section_header}>
              <PlaneIcon />
              <span>TRACKED MILITARY FLIGHTS</span>
            </div>
            {FLIGHTS_DATA.map((item) => (
              <FlightCard key={item.id} item={item} />
            ))}
          </>
        )}
      </div>

      {/* ── Share Button ─────────────────────────────────── */}
      <div className={styles.share_btn_wrap}>
        <button className={styles.share_btn}>
          <ShareIcon />
          <span>SHARE INTEL BRIEF</span>
        </button>
      </div>
    </aside>
  );
}
