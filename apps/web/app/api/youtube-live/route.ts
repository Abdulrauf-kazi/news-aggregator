import { NextResponse } from "next/server";

/**
 * Resolves the current live video ID for a YouTube channel.
 * Scrapes the channel's /live page to extract the active video ID.
 * Returns { videoId: string | null }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const handle = searchParams.get("handle");

  if (!channelId && !handle) {
    return NextResponse.json({ videoId: null, error: "channelId or handle required" }, { status: 400 });
  }

  try {
    // Build the URL to fetch - try channel/CHANNEL_ID/live or @handle/live
    const url = handle
      ? `https://www.youtube.com/${handle}/live`
      : `https://www.youtube.com/channel/${channelId}/live`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ videoId: null });
    }

    const html = await res.text();

    // Method 1: Look for canonical URL with video ID
    const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"&]+)"/);
    if (canonicalMatch?.[1]) {
      // Check if this is actually a live stream by looking for "isLive" indicators
      const isLive = html.includes('"isLive":true') || 
                     html.includes('"isLiveContent":true') ||
                     html.includes('"liveBroadcastDetails"') ||
                     html.includes('"isLiveBroadcast":true');
      
      return NextResponse.json({ 
        videoId: canonicalMatch[1], 
        isLive,
      });
    }

    // Method 2: Look for videoId in initial data
    const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (videoIdMatch?.[1]) {
      return NextResponse.json({ videoId: videoIdMatch[1], isLive: true });
    }

    return NextResponse.json({ videoId: null });
  } catch (error) {
    console.error("YouTube live resolve error:", error);
    return NextResponse.json({ videoId: null });
  }
}
