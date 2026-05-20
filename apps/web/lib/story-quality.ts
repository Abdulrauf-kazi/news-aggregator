import type { StoryNode } from "./graph";

const SYNTHETIC_TITLE_PATTERNS = [
  /placeholder signal/i,
  /^signal from /i,
  /^developing story:/i,
  /^update:/i,
  /^breaking developments/i,
  /^recent reports indicate/i,
  /^global markets showed mixed signals/i,
  /^trading volumes remained elevated/i,
];

const hasRootLikeUrl = (url?: string) => {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "" || /\.(xml|rss)$/i.test(parsed.pathname);
  } catch {
    return true;
  }
};

export const isSyntheticStory = (
  story: Pick<StoryNode, "id" | "title" | "url" | "publisherUrl" | "sourceIds">,
) => {
  return (
    story.id.includes(":fallback-") ||
    SYNTHETIC_TITLE_PATTERNS.some((pattern) => pattern.test(story.title)) ||
    (hasRootLikeUrl(story.url) &&
      !story.publisherUrl &&
      (story.sourceIds?.length ?? 0) > 2)
  );
};

export const hasLikelyDirectArticleUrl = (
  story: Pick<StoryNode, "url" | "publisherUrl">,
) => {
  if (!story.url) {
    return false;
  }

  if (/news\.google\.com\/rss\/articles\//i.test(story.url)) {
    return false;
  }

  if (/\.(xml|rss)(\?|$)/i.test(story.url)) {
    return false;
  }

  if (/\/rss(\/|$)|\/feeds?\//i.test(story.url) && !story.publisherUrl) {
    return false;
  }

  return /^https?:\/\//i.test(story.url);
};
