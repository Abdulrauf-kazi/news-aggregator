import type { StoryNode } from "./graph";
import { SOURCE_DEFINITIONS } from "./sources";

const FALLBACK_SLUG = "story";
const sourceMap = new Map(SOURCE_DEFINITIONS.map((source) => [source.id, source]));

export const slugify = (value: string) => {
  const slug = value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return slug || FALLBACK_SLUG;
};

export const getStorySlug = (story: Pick<StoryNode, "title" | "id">) => {
  const base = slugify(story.title || story.id);
  const idToken = encodeURIComponent(story.id).replace(/%/g, "_").slice(0, 36);
  return `${base}-${idToken}`;
};

export const getStoryPath = (story: Pick<StoryNode, "title" | "id">) =>
  `/news/${getStorySlug(story)}`;

export const findStoryBySlug = <T extends Pick<StoryNode, "title" | "id">>(
  stories: T[],
  slug: string,
) => {
  const decodedSlug = decodeURIComponent(slug);
  return (
    stories.find((story) => getStorySlug(story) === decodedSlug) ??
    stories.find((story) => slugify(story.title) === decodedSlug) ??
    stories.find((story) => decodedSlug.includes(encodeURIComponent(story.id).replace(/%/g, "_").slice(0, 36))) ??
    null
  );
};

export const getArticleUrl = (
  story: Pick<StoryNode, "id" | "url" | "publisherUrl"> | null,
) => {
  if (!story) return null;
  if (story.url && story.url.startsWith("http")) {
    return story.url;
  }
  if (story.publisherUrl && story.publisherUrl.startsWith("http")) {
    return story.publisherUrl;
  }
  const idUrl = story.id.match(/https?:\/\/.+/);
  return idUrl?.[0] ?? null;
};

export const getSourceDefinition = (sourceIds: string[] = []) => {
  for (const sourceId of sourceIds) {
    const source = sourceMap.get(sourceId);
    if (source) {
      return source;
    }
  }
  return null;
};

export const getFallbackSourceUrl = (
  story: Pick<StoryNode, "sourceIds" | "title" | "topic"> | null,
) => {
  if (!story) return null;
  const source = getSourceDefinition(story.sourceIds);
  if (!source) return null;

  if (source.endpoint.startsWith("http")) {
    return source.endpoint;
  }

  const query = encodeURIComponent(
    [source.label, story.title, story.topic].filter(Boolean).join(" "),
  );
  return `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
};

export const getSourceLabel = (sourceIds: string[] = []) =>
  getSourceDefinition(sourceIds)?.label ?? sourceIds[0] ?? "Global source";
