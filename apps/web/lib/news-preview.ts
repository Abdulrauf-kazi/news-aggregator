import type { StoryGraph, StoryNode } from "./graph";

export type StoryPreviewNode = Omit<StoryNode, "content" | "embedding"> & {
  description?: string;
  thumbnailUrl?: string;
};

export type PreviewStoryGraph = Omit<StoryGraph, "stories"> & {
  stories: StoryPreviewNode[];
};

const getShortDescription = (story: StoryNode) => {
  const text = story.content?.replace(/\s+/g, " ").trim();
  if (!text) {
    const sources = story.sourceIds?.slice(0, 2).join(", ") || "global sources";
    return `${story.topic} update from ${sources}.`;
  }
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
};

export const toStoryPreview = (story: StoryNode): StoryPreviewNode => {
  const preview: Omit<StoryNode, "content" | "embedding"> = {
    id: story.id,
    title: story.title,
    topic: story.topic,
    score: story.score,
    sourceIds: story.sourceIds,
    timestamp: story.timestamp,
    url: story.url,
    publisherUrl: story.publisherUrl,
  };

  return {
    ...preview,
    description: getShortDescription(story),
  };
};

export const toPreviewGraph = <T extends StoryGraph>(graph: T) => ({
  ...graph,
  stories: graph.stories.map(toStoryPreview),
});
