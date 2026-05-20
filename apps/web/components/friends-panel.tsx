"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";

type UserSummary = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  isFollowing?: boolean;
};

type FriendActivity = {
  userId: string;
  userName: string;
  storyId: string;
  storyTitle: string;
  topic: string;
  readAt: string;
};

type FriendsData = {
  following: UserSummary[];
  followers: UserSummary[];
  counts: { following: number; followers: number };
};

export function FriendsPanel({
  friendActivity = [],
  onStoryClick,
}: {
  friendActivity?: FriendActivity[];
  onStoryClick?: (storyId: string) => void;
}) {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"activity" | "following" | "discover">("activity");
  const [friendsData, setFriendsData] = useState<FriendsData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthenticated = !!session?.user;

  const fetchFriends = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriendsData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && tab === "following") {
      fetchFriends();
    }
  }, [isAuthenticated, tab, fetchFriends]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      if (query.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.users ?? []);
          }
        } finally {
          setSearchLoading(false);
        }
      }, 350);
    },
    [],
  );

  const handleFollow = useCallback(async (targetUserId: string) => {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (res.ok) {
        setSearchResults((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, isFollowing: true } : u)),
        );
        fetchFriends();
      }
    } catch {
      // Silent fail
    }
  }, [fetchFriends]);

  const handleUnfollow = useCallback(async (targetUserId: string) => {
    try {
      const res = await fetch("/api/friends", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (res.ok) {
        setSearchResults((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, isFollowing: false } : u)),
        );
        fetchFriends();
      }
    } catch {
      // Silent fail
    }
  }, [fetchFriends]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const mono = "'IBM Plex Mono', monospace";

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #ff3e00 0%, #ff6b35 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 20,
          }}
        >
          👥
        </div>
        <p
          style={{
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            color: "#1c1917",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            margin: "0 0 8px",
          }}
        >
          Social Intelligence
        </p>
        <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", margin: "0 0 16px" }}>
          Sign in to see what your network is reading and get personalized recommendations.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          padding: "4px",
          background: "#f5f5f4",
          borderRadius: 10,
        }}
      >
        {(["activity", "following", "discover"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px 4px",
              fontFamily: mono,
              fontSize: 9,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: tab === t ? "#fff" : "#78716c",
              background: tab === t ? "#1c1917" : "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {t === "activity" ? "Feed" : t === "following" ? "Network" : "Discover"}
          </button>
        ))}
      </div>

      {/* Activity Tab */}
      {tab === "activity" && (
        <div>
          {friendActivity.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", margin: 0 }}>
                No friend activity yet. Follow people to see what they&apos;re reading.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {friendActivity.slice(0, 10).map((activity, idx) => (
                <button
                  key={`${activity.storyId}-${idx}`}
                  onClick={() => onStoryClick?.(activity.storyId)}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#fff",
                    border: "1px solid #e7e5e4",
                    borderRadius: 12,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#ff3e00";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(255,62,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e7e5e4";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #ff3e00 0%, #ff6b35 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {activity.userName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: "#1c1917" }}>
                        {activity.userName}
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 8, color: "#a8a29e", flexShrink: 0 }}>
                        {formatTimeAgo(activity.readAt)}
                      </span>
                    </div>
                    <p
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        color: "#57534e",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {activity.storyTitle}
                    </p>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 8,
                        fontWeight: 700,
                        color: "#ff3e00",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {activity.topic}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Following Tab */}
      {tab === "following" && (
        <div>
          {loading ? (
            <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", textAlign: "center", padding: 20 }}>
              Loading network...
            </p>
          ) : (
            <>
              {/* Counts */}
              <div style={{ display: "flex", gap: 16, marginBottom: 16, justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: "#1c1917" }}>
                    {friendsData?.counts.following ?? 0}
                  </span>
                  <p style={{ fontFamily: mono, fontSize: 8, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>Following</p>
                </div>
                <div style={{ width: 1, background: "#e7e5e4" }} />
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: "#1c1917" }}>
                    {friendsData?.counts.followers ?? 0}
                  </span>
                  <p style={{ fontFamily: mono, fontSize: 8, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>Followers</p>
                </div>
              </div>

              {/* Following list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(friendsData?.following ?? []).map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onFollow={() => handleFollow(user.id)}
                    onUnfollow={() => handleUnfollow(user.id)}
                  />
                ))}
                {(friendsData?.following ?? []).length === 0 && (
                  <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", textAlign: "center", padding: 20 }}>
                    Not following anyone yet. Use Discover to find people.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Discover Tab */}
      {tab === "discover" && (
        <div>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontFamily: mono,
                fontSize: 11,
                border: "1px solid #d6d3d1",
                borderRadius: 10,
                background: "#fff",
                color: "#1c1917",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#ff3e00")}
              onBlur={(e) => (e.target.style.borderColor = "#d6d3d1")}
            />
            {searchLoading && (
              <div
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  border: "2px solid #e7e5e4",
                  borderTop: "2px solid #ff3e00",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                }}
              />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {searchResults.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onFollow={() => handleFollow(user.id)}
                onUnfollow={() => handleUnfollow(user.id)}
              />
            ))}
            {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
              <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", textAlign: "center", padding: 20 }}>
                No users found for &quot;{searchQuery}&quot;
              </p>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function UserCard({
  user,
  onFollow,
  onUnfollow,
}: {
  user: UserSummary;
  onFollow: () => void;
  onUnfollow: () => void;
}) {
  const mono = "'IBM Plex Mono', monospace";
  const [hovering, setHovering] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "#fff",
        border: "1px solid #e7e5e4",
        borderRadius: 12,
        transition: "all 0.15s ease",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: user.isFollowing
            ? "linear-gradient(135deg, #ff3e00 0%, #ff6b35 100%)"
            : "#f5f5f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
          color: user.isFollowing ? "#fff" : "#78716c",
          flexShrink: 0,
          border: user.isFollowing ? "none" : "1px solid #d6d3d1",
        }}
      >
        {user.name?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            color: "#1c1917",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.name}
        </p>
        <p
          style={{
            fontFamily: mono,
            fontSize: 9,
            color: "#a8a29e",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.email}
        </p>
      </div>
      <button
        onClick={user.isFollowing ? onUnfollow : onFollow}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          padding: "6px 14px",
          fontFamily: mono,
          fontSize: 9,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          border: user.isFollowing ? "1px solid #d6d3d1" : "none",
          borderRadius: 8,
          cursor: "pointer",
          transition: "all 0.2s ease",
          ...(user.isFollowing
            ? {
                background: hovering ? "#fef2f2" : "#fff",
                color: hovering ? "#ef4444" : "#78716c",
              }
            : {
                background: hovering ? "#ff3e00" : "#1c1917",
                color: "#fff",
              }),
        }}
      >
        {user.isFollowing ? (hovering ? "Unfollow" : "Following") : "Follow"}
      </button>
    </div>
  );
}
