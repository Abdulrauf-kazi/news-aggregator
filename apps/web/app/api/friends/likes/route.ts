import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { getFriendsLikes } from "../../../../lib/social-db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const likes = await getFriendsLikes(session.user.id);
    return NextResponse.json({ likes });
  } catch (error) {
    console.error("Failed to fetch friends likes:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
