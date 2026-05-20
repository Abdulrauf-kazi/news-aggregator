import { NextResponse } from "next/server";
import { getGraphSnapshot } from "../../../lib/graph-service";
import { auth } from "../../../auth";

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") || undefined;
  
  const snapshot = await getGraphSnapshot({
    userId: session?.user?.id,
    sessionId: sessionId,
  });
  return NextResponse.json(snapshot);
}
