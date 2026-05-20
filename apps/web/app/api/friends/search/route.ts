import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchUsers } from "@/lib/social-db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";

    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await searchUsers(query, session.user.id, 20);

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/friends/search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
