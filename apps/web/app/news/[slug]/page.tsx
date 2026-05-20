import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGraphSnapshot } from "../../../lib/graph-service";
import { findStoryBySlug, getArticleUrl, getStoryPath } from "../../../lib/news-routing";
import ArticleClient from "./article-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const getStoryContext = async (slug: string) => {
  const graph = await getGraphSnapshot();
  const story = findStoryBySlug(graph.stories, slug);

  if (!story) {
    return null;
  }

  const relatedStories = graph.stories
    .filter((candidate) => candidate.id !== story.id)
    .sort((left, right) => {
      const leftScore =
        (left.topic === story.topic ? 2 : 0) +
        left.sourceIds.filter((sourceId) => story.sourceIds.includes(sourceId)).length;
      const rightScore =
        (right.topic === story.topic ? 2 : 0) +
        right.sourceIds.filter((sourceId) => story.sourceIds.includes(sourceId)).length;
      return rightScore - leftScore;
    })
    .slice(0, 6);

  return { story, relatedStories };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const context = await getStoryContext(slug);

  if (!context) {
    return {
      title: "News story not found | Intelligence Pulse",
    };
  }

  const description =
    context.story.content?.replace(/\s+/g, " ").trim().slice(0, 155) ||
    `${context.story.topic} update from ${context.story.sourceIds.slice(0, 2).join(", ")}.`;

  return {
    title: `${context.story.title} | Intelligence Pulse`,
    description,
    alternates: {
      canonical: getStoryPath(context.story),
    },
    openGraph: {
      title: context.story.title,
      description,
      type: "article",
      url: getStoryPath(context.story),
      publishedTime: context.story.timestamp,
    },
  };
}

export default async function NewsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const context = await getStoryContext(slug);

  if (!context) {
    notFound();
  }

  return (
    <ArticleClient
      story={context.story}
      relatedStories={context.relatedStories}
      key={getArticleUrl(context.story) || context.story.id}
    />
  );
}
