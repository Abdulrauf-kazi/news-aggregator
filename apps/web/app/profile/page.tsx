"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  bio: string;
  website: string;
  location: string;
  publicProfile: boolean;
  preferences: {
    emailNotifications: boolean;
    marketingEmails: boolean;
    theme: string;
  };
  createdAt: string;
  updatedAt?: string;
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mono = "'IBM Plex Mono', monospace";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/sign-in");
      return;
    }

    if (status === "authenticated") {
      fetchProfile();
    }
  }, [status, router]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profile");
      if (!res.ok) {
        throw new Error("Failed to load profile");
      }
      const data = await res.json();
      setProfile(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          bio: profile.bio,
          website: profile.website,
          location: profile.location,
          publicProfile: profile.publicProfile,
          preferences: profile.preferences,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update profile");
      }

      const updated = await res.json();
      setProfile(updated);
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#efefec",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 12, color: "#a8a29e", letterSpacing: "0.1em" }}>
          LOADING PROFILE...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#efefec", padding: "40px 20px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Link href="/" style={{ textDecoration: "none" }}>
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  color: "#ff3e00",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ← Back to Feed
              </span>
            </Link>
            <h1
              style={{
                fontFamily: mono,
                fontSize: 32,
                fontWeight: 800,
                color: "#1c1917",
                margin: "12px 0 4px",
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Settings
            </h1>
            <p style={{ fontFamily: mono, fontSize: 11, color: "#78716c", margin: 0 }}>
              Update your account details and preferences.
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            style={{
              padding: "8px 16px",
              background: "transparent",
              color: "#ef4444",
              border: "1px solid #ef4444",
              borderRadius: 8,
              fontFamily: mono,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave}>
          <div
            style={{
              background: "white",
              border: "1px solid #d6d3d1",
              borderRadius: 20,
              padding: 32,
              boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "#f5f5f4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: "bold",
                  color: "#1c1917",
                  border: "2px solid #d6d3d1",
                }}
              >
                {profile?.name?.[0]?.toUpperCase() || "U"}
              </div>
              <div>
                <p style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, margin: 0 }}>{profile?.email}</p>
                <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", margin: 0 }}>
                  Joined {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#78716c",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                }}
              >
                Full Name
              </label>
              <input
                type="text"
                value={profile?.name || ""}
                onChange={(e) => setProfile({ ...profile!, name: e.target.value })}
                style={{
                  width: "100%",
                  fontFamily: mono,
                  fontSize: 13,
                  padding: "12px 16px",
                  border: "1px solid #d6d3d1",
                  borderRadius: 10,
                  background: "#ffffff",
                  color: "#1c1917",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Bio */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#78716c",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                }}
              >
                Bio
              </label>
              <textarea
                value={profile?.bio || ""}
                onChange={(e) => setProfile({ ...profile!, bio: e.target.value })}
                maxLength={160}
                placeholder="Tell us about yourself..."
                style={{
                  width: "100%",
                  fontFamily: mono,
                  fontSize: 13,
                  padding: "12px 16px",
                  border: "1px solid #d6d3d1",
                  borderRadius: 10,
                  background: "#ffffff",
                  color: "#1c1917",
                  boxSizing: "border-box",
                  minHeight: 100,
                  resize: "vertical",
                }}
              />
            </div>

            {/* Location & Website */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontFamily: mono,
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#78716c",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}
                >
                  Location
                </label>
                <input
                  type="text"
                  placeholder="City, Country"
                  value={profile?.location || ""}
                  onChange={(e) => setProfile({ ...profile!, location: e.target.value })}
                  style={{
                    width: "100%",
                    fontFamily: mono,
                    fontSize: 13,
                    padding: "12px 16px",
                    border: "1px solid #d6d3d1",
                    borderRadius: 10,
                    background: "#ffffff",
                    color: "#1c1917",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontFamily: mono,
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#78716c",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}
                >
                  Website
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={profile?.website || ""}
                  onChange={(e) => setProfile({ ...profile!, website: e.target.value })}
                  style={{
                    width: "100%",
                    fontFamily: mono,
                    fontSize: 13,
                    padding: "12px 16px",
                    border: "1px solid #d6d3d1",
                    borderRadius: 10,
                    background: "#ffffff",
                    color: "#1c1917",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Privacy */}
            <div style={{ marginBottom: 24, padding: "20px 0", borderTop: "1px solid #f1f0ee" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="checkbox"
                  id="public"
                  checked={profile?.publicProfile || false}
                  onChange={(e) => setProfile({ ...profile!, publicProfile: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: "#ff3e00", cursor: "pointer" }}
                />
                <label htmlFor="public" style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: "#1c1917", cursor: "pointer" }}>
                  Public Profile
                </label>
              </div>
              <p style={{ fontFamily: mono, fontSize: 10, color: "#a8a29e", margin: "4px 0 0 30px" }}>
                Allow others to see your curated news feeds and bookmarks.
              </p>
            </div>

            {/* Messages */}
            {error && (
              <div style={{ marginBottom: 20, padding: 12, background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 8, fontFamily: mono, fontSize: 11, color: "#b91c1c" }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ marginBottom: 20, padding: 12, background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 8, fontFamily: mono, fontSize: 11, color: "#15803d" }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                width: "100%",
                padding: "16px",
                background: saving ? "#f5f5f4" : "#ff3e00",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontFamily: mono,
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: saving ? "none" : "0 4px 14px rgba(255, 62, 0, 0.3)",
                transition: "all 0.2s ease",
              }}
            >
              {saving ? "Updating..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
