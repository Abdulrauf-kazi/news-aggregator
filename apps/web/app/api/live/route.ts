import { NextResponse } from "next/server";
import { getGraphSnapshot } from "../../../lib/graph-service";
import { recordSessionInteraction } from "../../../lib/session-personalization";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "session_id";

const extractSessionId = (request: Request, url: URL) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookiePair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const cookieValue = cookiePair?.split("=")[1];
  const headerValue = request.headers.get("x-session-id") ?? undefined;
  const queryValue = url.searchParams.get("sessionId") ?? undefined;
  return (headerValue || queryValue || cookieValue || "").trim();
};

const createSessionId = () => {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const sessionId = extractSessionId(request, url) || createSessionId();

  try {
    const snapshot = await getGraphSnapshot({
      forceRefresh,
      sessionId,
    });

    const response = NextResponse.json({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        fetchedAt: new Date().toISOString(),
        sessionId,
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionId,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Failed to fetch graph snapshot:", error);
    try {
      // Try to get cached data
      const snapshot = await getGraphSnapshot({ forceRefresh: false, sessionId });
      return NextResponse.json({
        ...snapshot,
        meta: {
          ...snapshot.meta,
          error: error instanceof Error ? error.message : "Unknown error",
          fetchedAt: new Date().toISOString(),
          sessionId,
        },
      });
    } catch {
      // Full fallback to generated data if DB/Redis is completely down
      const { createStoryGraph } = await import("../../../lib/graph");
      const fallback = createStoryGraph(Date.now());
      return NextResponse.json({
        ...fallback,
        meta: {
          cached: false,
          storage: "fallback-hard",
          plannedArchive: null,
          totalStoriesInDb: 0,
          sourceMetricsCount: 0,
          recommendations: [],
          recommendationReasons: {},
          retrieval: {
            vectorBackend: "none",
            vectorCount: 0,
            graphSeedCount: 0,
            mode: "graph",
          },
          error: "System error: Backend services unavailable. Using local simulation.",
          fetchedAt: new Date().toISOString(),
          sessionId,
        },
      });
    }
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const sessionId = extractSessionId(request, url);
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "Missing session id" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    eventType?: "click" | "dwell";
    storyId?: string;
    topic?: string;
    dwellMs?: number;
  };

  if (!body.eventType || !body.storyId) {
    return NextResponse.json(
      { ok: false, error: "Missing required event payload" },
      { status: 400 },
    );
  }

  await recordSessionInteraction({
    sessionId,
    eventType: body.eventType,
    storyId: body.storyId,
    topic: body.topic,
    dwellMs: body.dwellMs,
  });

  return NextResponse.json({ ok: true });
}
