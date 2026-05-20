import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { toggleLike, isStoryLiked, getStoryLikeCounts } from "../../../lib/social-db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { storyId, topic } = await req.json();
    if (!storyId || !topic) {
      return NextResponse.json({ error: "Missing storyId or topic" }, { status: 400 });
    }

    const result = await toggleLike(session.user.id, storyId, topic);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Like toggle failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);

  // Batch mode: ?storyIds=id1,id2,... — public for counts, liked status requires auth
  const storyIdsParam = searchParams.get("storyIds");
  if (storyIdsParam) {
    const storyIds = storyIdsParam.split(",").filter(Boolean).slice(0, 100);
    try {
      const [counts, likedMap] = await Promise.all([
        getStoryLikeCounts(storyIds),
        session?.user?.id
          ? Promise.all(storyIds.map((id) => isStoryLiked(session.user!.id!, id).then((v) => [id, v] as const)))
          : Promise.resolve([] as [string, boolean][]),
      ]);
      const liked: Record<string, boolean> = Object.fromEntries(likedMap);
      return NextResponse.json({ counts, liked });
    } catch {
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  // Single mode: ?storyId=id — requires auth
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storyId = searchParams.get("storyId");
  if (!storyId) {
    return NextResponse.json({ error: "Missing storyId" }, { status: 400 });
  }

  try {
    const liked = await isStoryLiked(session.user.id, storyId);
    return NextResponse.json({ liked });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
