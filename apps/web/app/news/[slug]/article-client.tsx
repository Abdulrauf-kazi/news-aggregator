"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { StoryNode } from "../../../lib/graph";
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
};

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
        <p className="font-headline text-[11px] font-black uppercase tracking-[0.28em] text-[#a8a29e]">
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
    .filter((sourceId) => sourceId !== sourceLabel)
    .slice(0, 3)
    .join(", ");

  return [
    `${story.title} is part of the current ${story.topic.toLowerCase()} feed from ${sourceLabel}.`,
    sourceList
      ? `This signal is grouped with corroborating coverage from ${sourceList}.`
      : `Additional corroboration is still being collected for this signal.`,
    `The article source did not expose a directly fetchable story body, so this page is showing the best available summary while preserving navigation and related coverage.`,
  ].join(" ");
};

export default function ArticleClient({
  story,
  relatedStories,
}: {
  story: StoryNode;
  relatedStories: StoryNode[];
}) {
  const [article, setArticle] = useState<ArticlePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Prioritize publisherUrl over url for the original source link
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(story.publisherUrl || story.url || null);
  const storyFallback = useMemo(() => buildStoryFallback(story), [story]);

  useEffect(() => {
    let isActive = true;

    const fetchArticle = async () => {
      setIsLoading(true);
      setError(null);
      setArticle(null);

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
  const showError = !isLoading && !!error;
  const displaySourceUrl = article?.finalUrl || resolvedUrl;

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#efefec] text-[#1c1917]">
      <article className="mx-auto max-w-[920px] px-5 py-10 md:px-8 md:py-14">
        <Link
          href="/news"
          className="mb-10 inline-flex items-center gap-2 rounded-lg border border-[#d6d3d1] bg-white px-4 py-2 font-headline text-[10px] font-black uppercase tracking-widest text-[#57534e] transition-all hover:border-[#ff3e00] hover:text-[#ff3e00]"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Feed
        </Link>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[#ff3e00]/20 bg-[#fff5f2] px-3 py-1 font-headline text-[9px] font-black uppercase tracking-widest text-[#ff3e00]">
            {story.topic}
          </span>
          <span className="font-body text-[12px] font-medium text-[#78716c]">{articleSource}</span>
          {articleDate && <span className="font-body text-[12px] text-[#78716c]">{articleDate}</span>}
          {article?.readingTime ? (
            <span className="font-body text-[12px] text-[#78716c]">{article.readingTime} min read</span>
          ) : null}
        </div>

        <h1 className="mb-6 font-headline text-[34px] font-black uppercase leading-[1.08] tracking-tight text-[#1c1917] md:text-[52px]">
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
          <div className="mb-8 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-5 py-4 text-[13px] font-medium text-[#b91c1c]">
            {error}
          </div>
        )}

        {!isLoading && (
          <div className="article-body">
            {sanitizedHtml ? (
              <div
                className="text-[17px] leading-[1.85] text-[#292524] [&_a]:text-[#ff3e00] [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[#ff3e00] [&_blockquote]:pl-5 [&_figure]:my-8 [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-[#a8a29e] [&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:font-headline [&_h2]:text-[24px] [&_h2]:font-black [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:font-headline [&_h3]:text-[20px] [&_h3]:font-bold [&_img]:my-8 [&_img]:max-w-full [&_img]:rounded-xl [&_li]:mb-2 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-5 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : article?.text ? (
              <p className="whitespace-pre-wrap text-[17px] leading-[1.85] text-[#292524]">{article.text}</p>
            ) : storyText ? (
              <div className="text-[17px] leading-[1.85] text-[#292524]">
                {storyText.split("\n").filter(Boolean).map((paragraph) => (
                  <p key={paragraph} className="mb-5">{paragraph}</p>
                ))}
              </div>
            ) : (
              <div className="space-y-5 text-[17px] leading-[1.85] text-[#57534e]">
                <p>{storyFallback}</p>
              </div>
            )}
          </div>
        )}

        {displaySourceUrl && (
          <a
            href={displaySourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#1c1917] px-5 py-3 font-headline text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-[#ff3e00]"
          >
            Original source
            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
          </a>
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
                  className="premium-card rounded-xl bg-white p-5 transition-all hover:border-[#ff3e00]"
                >
                  <span className="font-headline text-[9px] font-black uppercase tracking-widest text-[#ff3e00]">
                    {related.topic}
                  </span>
                  <h3 className="mt-2 line-clamp-3 font-headline text-[14px] font-bold uppercase leading-tight text-[#1c1917]">
                    {related.title}
                  </h3>
                  <p className="mt-4 font-body text-[11px] font-medium text-[#78716c]">
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
