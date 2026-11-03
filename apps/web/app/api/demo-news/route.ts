import { NextResponse } from "next/server";
import { getDemoStatus, runDemoNewsCycle } from "../../../lib/demo-news";

export const dynamic = "force-dynamic";
// A cycle makes several model calls; allow it to finish.
export const maxDuration = 600;

/** GET /api/demo-news: generator status and the last cycle's result. */
export async function GET() {
  return NextResponse.json(await getDemoStatus());
}

/** POST /api/demo-news: generate a fresh set now (replaces the previous one). */
export async function POST() {
  const result = await runDemoNewsCycle({ reason: "manual" });
  return NextResponse.json(result, { status: result.skipped ? 409 : 200 });
}
