"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { StoryNode } from "../../../lib/graph";
import { useSession } from "next-auth/react";
import {
  getSourceLabel,
  getStoryPath,
} from "../../../lib/news-routing";

type ArticlePayload = {
  title?: string;
  byline?: string;
  siteName?: string;
  imageUrl?: string;
  publishedDate?: string;
  readingTime?: number;
  html?: string;
  text?: string;
  finalUrl?: string;
  description?: string;
  author?: string;
  error?: string;
  status?: "ok" | "short" | "empty" | "not-html" | "too-large" | "error";
  textLength?: number;
};

/** Below this, extracted text is a teaser rather than the full article (matches the API). */
const FULL_TEXT_MIN_CHARS = 600;

const toParagraphs = (text: string) =>
  text
    .split(/\n\s*\n|\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

function ArticleSkeleton() {
  return (
    <div className="py-10">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#ff3e00] border-t-transparent" />
        <p className="font-headline text-[11px] font-bold uppercase tracking-[0.28em] text-[#78716c]" role="status">
          Loading article
        </p>
      </div>
      <div className="space-y-4 animate-pulse">
        <div className="h-5 rounded bg-[#d6d3d1]" />
        <div className="h-5 rounded bg-[#d6d3d1]" />
        <div className="h-5 w-5/6 rounded bg-[#d6d3d1]" />
        <div className="h-5 w-3/4 rounded bg-[#d6d3d1]" />
      </div>
    </div>
  );
}

const buildStoryFallback = (story: StoryNode) => {
  const sourceLabel = getSourceLabel(story.sourceIds);
  const sourceList = story.sourceIds
    .map((sourceId) => getSourceLabel([sourceId]))
    .filter((label, index, all) => label !== sourceLabel && all.indexOf(label) === index)
    .slice(0, 3)
    .join(", ");

  return [
    `${story.title}. Reported in the ${story.topic} feed by ${sourceLabel}.`,
    sourceList ? `Also covered by ${sourceList}.` : "",
  ].filter(Boolean).join(" ");
};

export default function ArticleClient({
  story,
  relatedStories,
}: {
  story: StoryNode;
  relatedStories: StoryNode[];
}) {
  const { data: session } = useSession();
  const [article, setArticle] = useState<ArticlePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  useEffect(() => {
    if (story.id && session?.user?.id) {
      fetch(`/api/like?storyId=${story.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.liked !== undefined) setIsLiked(data.liked);
        })
        .catch(console.error);
    }
  }, [story.id, session?.user?.id]);

  const handleToggleLike = async () => {
    if (!session?.user?.id || !story.id || isLiking) return;

    setIsLiking(true);
    try {
      const res = await fetch("/api/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          topic: story.topic || "General",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsLiked(data.liked);
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
    } finally {
      setIsLiking(false);
    }
  };
  // Prioritize publisherUrl over url for the original source link
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(story.publisherUrl || story.url || null);
  const storyFallback = useMemo(() => buildStoryFallback(story), [story]);

  useEffect(() => {
    let isActive = true;

    const fetchArticle = async () => {
      setIsLoading(true);
      setError(null);
      setArticle(null);

      // Demo-generated stories and data items (e.g. weather alerts) carry their
      // full text and have no publisher page to fetch.
      if (story.generated || (!story.url && !story.publisherUrl && story.content)) {
        setResolvedUrl(null);
        setIsLoading(false);
        return;
      }

      try {
        const resolutionResponse = await fetch("/api/resolve-article-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: story.title,
            url: story.url,
            publisherUrl: story.publisherUrl,
            sourceIds: story.sourceIds,
          }),
        });
        const resolutionPayload = (await resolutionResponse.json()) as {
          resolvedUrl?: string | null;
          error?: string;
        };
        if (!isActive) return;

        // Prioritize publisherUrl from the story, then resolved URL, then story url
        const nextUrl = story.publisherUrl || resolutionPayload.resolvedUrl || story.url || null;
        setResolvedUrl(nextUrl);

        if (!nextUrl) {
          setError(story.content ? null : resolutionPayload.error || null);
          setIsLoading(false);
          return;
        }

        const response = await fetch(`/api/fetch-article?url=${encodeURIComponent(nextUrl)}`);
        const payload = (await response.json()) as ArticlePayload;
        if (!isActive) return;

        const hasContent =
          (payload.html && payload.html.trim().length > 50) ||
          (payload.text && payload.text.trim().length > 50);

        setArticle(payload);
        setError(hasContent || story.content ? null : payload.error || null);
      } catch (err) {
        if (isActive) {
          setError(story.content ? null : err instanceof Error ? err.message : "Unable to load article.");
          setArticle(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void fetchArticle();
    return () => {
      isActive = false;
    };
  }, [story]);

  const sanitizedHtml = useMemo(() => {
    if (!article?.html) return "";
    return DOMPurify.sanitize(article.html, { USE_PROFILES: { html: true } });
  }, [article?.html]);

  const articleDate = formatDate(article?.publishedDate) || formatDate(story.timestamp);
  const articleTitle = article?.title || story.title;
  const articleSource = article?.siteName || getSourceLabel(story.sourceIds);
  const storyText = story.content?.trim();
  // Prefer whichever is more complete: the publisher page or the feed's own text.
  const extractedLength = article?.textLength ?? article?.text?.trim().length ?? 0;
  const summaryText = storyText || article?.description?.trim() || "";
  const showExtracted =
    !!sanitizedHtml &&
    extractedLength > 0 &&
    (extractedLength >= FULL_TEXT_MIN_CHARS || extractedLength >= summaryText.length);
  const shownLength = showExtracted ? extractedLength : summaryText.length;
  // Be honest whenever the reader is not getting the full article.
  // (Data items with no web page, e.g. weather alerts, are complete as they are.)
  const hasPublisherPage = !!(story.url || story.publisherUrl);
  const showError =
    !isLoading &&
    !story.generated &&
    (!!error || shownLength < FULL_TEXT_MIN_CHARS) &&
    (hasPublisherPage || shownLength === 0);
  const displaySourceUrl = article?.finalUrl || resolvedUrl;

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#efefec] text-[#1c1917]">
      <article className="mx-auto max-w-[920px] px-5 py-10 md:px-8 md:py-14">
        <Link
          href="/news"
          className="mb-10 inline-flex items-center gap-2 rounded-lg border border-[#d6d3d1] bg-white px-4 py-2 font-headline text-[11px] font-bold uppercase tracking-widest text-[#57534e] transition-colors hover:border-[#ff3e00] hover:text-[#c2410c]"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>
          Back to feed
        </Link>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[#ff3e00]/25 bg-[#fff5f2] px-3 py-1 font-headline text-[11px] font-bold uppercase tracking-widest text-[#c2410c]">
            {story.topic}
          </span>
          <span className="font-body text-[13px] font-semibold text-[#44403c]">{articleSource}</span>
          {articleDate && <span className="font-body text-[13px] text-[#78716c]">· {articleDate}</span>}
          {showExtracted && article?.readingTime ? (
            <span className="font-body text-[13px] text-[#78716c]">· {article.readingTime} min read</span>
          ) : null}
        </div>

        <h1 className="mb-6 font-body text-[32px] font-bold leading-[1.12] tracking-[-0.02em] text-[#1c1917] [text-wrap:balance] md:text-[46px]">
          {articleTitle}
        </h1>

        {(article?.byline || article?.author) && (
          <p className="mb-8 text-sm font-medium text-[#57534e]">
            {article.byline || article.author}
          </p>
        )}

        {!isLoading && article?.imageUrl && (
          <figure className="mb-10 overflow-hidden rounded-2xl border border-[#d6d3d1] bg-white shadow-xl">
            <img src={article.imageUrl} alt="" className="max-h-[520px] w-full object-cover" loading="lazy" />
          </figure>
        )}

        {isLoading && <ArticleSkeleton />}

        {showError && (
          // Technical errors (e.g. "fetch failed") are not shown to readers; the
          // summary below is always available, so explain the fallback calmly.
          <div
            role="status"
            className="mb-8 flex items-start gap-3 rounded-xl border border-[#e7e5e4] bg-white px-5 py-4 text-[14px] leading-relaxed text-[#57534e]"
          >
            <span className="material-symbols-outlined mt-0.5 text-[18px] text-[#78716c]" aria-hidden="true">info</span>
            <span>
              The full article couldn&apos;t be loaded from the publisher, so we&apos;re showing {shownLength > 0 ? "a summary" : "what we know about this story"}.
              {displaySourceUrl ? (
                <> Use <strong className="font-semibold text-[#1c1917]">Original source</strong> to read it there.</>
              ) : null}
            </span>
          </div>
        )}

        {!isLoading && (
          <div className="article-body min-w-0 max-w-full [overflow-wrap:anywhere]">
            {showExtracted ? (
              <div
                className="text-[17px] leading-[1.85] text-[#292524] [&_a]:text-[#c2410c] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[#ff3e00] [&_blockquote]:pl-5 [&_blockquote]:italic [&_figure]:my-8 [&_figure]:max-w-full [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:leading-snug [&_figcaption]:text-[#78716c] [&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:font-headline [&_h2]:text-[24px] [&_h2]:font-black [&_h2]:leading-tight [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:font-headline [&_h3]:text-[20px] [&_h3]:font-bold [&_h4]:mb-3 [&_h4]:mt-6 [&_h4]:font-bold [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_li]:mb-2 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-5 [&_pre]:overflow-x-auto [&_table]:my-6 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-[#e7e5e4] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[#e7e5e4] [&_th]:px-3 [&_th]:py-2 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_video]:max-w-full"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : summaryText ? (
              <div className="text-[17px] leading-[1.85] text-[#292524]">
                {toParagraphs(summaryText).map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 24)}`} className="mb-5">{paragraph}</p>
                ))}
              </div>
            ) : (
              <div className="space-y-5 text-[17px] leading-[1.85] text-[#57534e]">
                <p>{storyFallback}</p>
              </div>
            )}
          </div>
        )}

        {!isLoading && (
          <div className="mt-10 flex flex-wrap items-center gap-4">
            {displaySourceUrl && (
              <a
                href={displaySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#1c1917] px-5 py-3 font-headline text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-[#ff3e00]"
              >
                Original source
                <span className="material-symbols-outlined text-[15px]">open_in_new</span>
              </a>
            )}

            <button 
              onClick={handleToggleLike}
              disabled={!session || isLiking}
              className={`inline-flex items-center gap-2 rounded-lg border px-5 py-3 font-headline text-[11px] font-black uppercase tracking-widest transition-all ${
                isLiked 
                  ? "border-[#ff3e00] bg-[#fff5f2] text-[#ff3e00]" 
                  : "border-[#d6d3d1] bg-white text-[#57534e] hover:border-[#ff3e00] hover:text-[#ff3e00]"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={session ? (isLiked ? "Unlike" : "Like") : "Sign in to like"}
            >
              <span className="material-symbols-outlined" style={{ 
                fontSize: "18px",
                fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0"
              }}>
                favorite
              </span>
              {isLiked ? "Liked" : "Like"}
            </button>
          </div>
        )}
      </article>

      {relatedStories.length > 0 && (
        <section className="border-t border-[#d6d3d1] px-5 py-12 md:px-8">
          <div className="mx-auto max-w-[1120px]">
            <h2 className="mb-8 font-headline text-[12px] font-black uppercase tracking-[0.3em] text-[#1c1917]">
              Related News
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {relatedStories.map((related) => (
                <Link
                  key={related.id}
                  href={getStoryPath(related)}
                  prefetch
                  className="premium-card rounded-xl bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[#ff3e00] hover:shadow-lg"
                >
                  <span className="font-headline text-[11px] font-bold uppercase tracking-widest text-[#c2410c]">
                    {related.topic}
                  </span>
                  <h3 className="mt-2 line-clamp-3 font-body text-[16px] font-semibold leading-snug text-[#1c1917]">
                    {related.title}
                  </h3>
                  <p className="mt-4 font-body text-[12px] font-medium text-[#78716c]">
                    {formatDate(related.timestamp) || related.sourceIds?.[0]}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
