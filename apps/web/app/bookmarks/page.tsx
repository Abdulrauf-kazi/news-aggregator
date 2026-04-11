"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StoryNode } from "../../lib/graph";

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<StoryNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedIds = localStorage.getItem("news-bookmarks");
    if (!savedIds) {
      setIsLoading(false);
      return;
    }

    const ids = JSON.parse(savedIds) as string[];
    
    // Fetch all stories and filter by bookmarked IDs
    const fetchStories = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const data = await res.json();
          const allStories = data.stories as StoryNode[];
          const filtered = allStories.filter(s => ids.includes(s.id));
          setBookmarks(filtered);
        }
      } catch (e) {
        console.error("Failed to fetch stories for bookmarks", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStories();
  }, []);

  const removeBookmark = (id: string) => {
    const newBookmarks = bookmarks.filter(b => b.id !== id);
    setBookmarks(newBookmarks);
    const newIds = newBookmarks.map(b => b.id);
    localStorage.setItem("news-bookmarks", JSON.stringify(newIds));
  };

  return (
    <main className="max-w-[1200px] mx-auto px-6 lg:px-12 py-12 min-h-screen">
      <header className="mb-12 border-b border-[#d6d3d1] pb-8 flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="tag">Archive</span>
          </div>
          <h1 className="font-headline text-4xl font-bold text-primary tracking-tight uppercase">
            Bookmarked Signals
          </h1>
          <p className="text-sm text-secondary mt-2 font-medium">
            Personal curated intelligence feed.
          </p>
        </div>
        <Link href="/" className="tag hover:bg-primary hover:text-white transition-all">
          Back to Live Feed
        </Link>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="font-headline text-xs animate-pulse tracking-widest text-secondary uppercase">
            Recalling from neural storage...
          </div>
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="bento-shell rounded-sm p-12 text-center border-dashed">
          <p className="font-headline text-xs text-secondary uppercase tracking-[0.2em] mb-4">
            Storage Empty
          </p>
          <p className="text-sm text-secondary mb-8">No signals have been flagged for later analysis.</p>
          <Link href="/" className="px-6 py-3 bg-primary text-white font-headline text-xs tracking-widest uppercase hover:bg-accent transition-all">
            Browse Live Matrix
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookmarks.map((story) => (
            <article key={story.id} className="premium-card rounded-sm p-6 flex flex-col justify-between group">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="tag text-[9px]">{story.topic}</span>
                  <button 
                    onClick={() => removeBookmark(story.id)}
                    className="text-[10px] font-headline text-accent uppercase tracking-tighter hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <h3 className="text-sm font-bold text-primary leading-snug mb-4 group-hover:text-accent transition-colors">
                  {story.title}
                </h3>
              </div>
              <div className="pt-4 border-t border-[#d6d3d1]">
                <p className="text-[10px] text-secondary font-headline uppercase">
                  Source: {story.sourceIds[0]}
                </p>
                <p className="text-[9px] text-secondary/60 mt-1">
                  {new Date(story.timestamp).toLocaleString()}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
