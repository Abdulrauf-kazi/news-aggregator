import { NextResponse } from "next/server";
import { resolveArticleUrl } from "../../../lib/article-url-resolver";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    url?: string;
    publisherUrl?: string;
    sourceIds?: string[];
  };

  if (!body.title) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 },
    );
  }

  try {
    const resolvedUrl = await resolveArticleUrl({
      title: body.title,
      url: body.url,
      publisherUrl: body.publisherUrl,
      sourceIds: body.sourceIds,
    });

    return NextResponse.json({
      resolvedUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        resolvedUrl: body.publisherUrl || body.url || null,
        error: error instanceof Error ? error.message : "Unable to resolve article URL",
      },
      { status: 200 },
    );
  }
}
