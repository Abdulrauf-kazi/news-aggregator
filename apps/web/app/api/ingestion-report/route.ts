import { NextResponse } from "next/server";
import { readIngestionReport, readSourceMetrics } from "../../../lib/story-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [report, metrics] = await Promise.all([
    readIngestionReport(),
    readSourceMetrics(),
  ]);

  return NextResponse.json({
    report,
    metrics,
  });
}
