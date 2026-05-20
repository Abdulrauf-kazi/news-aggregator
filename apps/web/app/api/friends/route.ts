import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  followUser,
  unfollowUser,
  getFollowing,
  getFollowers,
  getFollowCounts,
} from "@/lib/social-db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [following, followers, counts] = await Promise.all([
      getFollowing(session.user.id),
      getFollowers(session.user.id),
      getFollowCounts(session.user.id),
    ]);

    return NextResponse.json({
      following,
      followers,
      counts,
    });
  } catch (error) {
    console.error("GET /api/friends error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { targetUserId?: string };
    if (!body.targetUserId) {
      return NextResponse.json(
        { error: "Missing targetUserId" },
        { status: 400 },
      );
    }

    const result = await followUser(session.user.id, body.targetUserId);
    const counts = await getFollowCounts(session.user.id);

    return NextResponse.json({
      ok: true,
      followed: result,
      counts,
    });
  } catch (error) {
    console.error("POST /api/friends error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { targetUserId?: string };
    if (!body.targetUserId) {
      return NextResponse.json(
        { error: "Missing targetUserId" },
        { status: 400 },
      );
    }

    const result = await unfollowUser(session.user.id, body.targetUserId);
    const counts = await getFollowCounts(session.user.id);

    return NextResponse.json({
      ok: true,
      unfollowed: result,
      counts,
    });
  } catch (error) {
    console.error("DELETE /api/friends error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
