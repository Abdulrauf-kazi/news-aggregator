# Active Context

## Current Focus
- Fixed the deeper article-resolution pipeline so dynamic news pages can resolve real publisher URLs instead of RSS/XML wrappers, while reducing stale placeholder stories in the feed.

## Recent Changes
- **Root-cause URL resolution**: Added a shared article URL resolver that converts Google News wrapper URLs into real publisher article URLs via site-specific lookup.
- **Publisher metadata capture**: RSS ingestion now preserves publisher/site URLs from feed metadata so article resolution has a reliable domain target.
- **Article page fetch path**: `/news/[slug]` now resolves the best article URL first, then fetches full article HTML/images from that resolved publisher URL, and uses the same resolved URL for the "Original source" button.
- **Synthetic story containment**: Added story-quality heuristics to identify placeholder/synthetic stories, stop merging unrelated fallback stories across sources, and keep generic fallback records from dominating the live feed.
- **Stored-story serving guard**: `getGraphSnapshot()` now sanitizes stale placeholder-heavy DB payloads instead of serving them raw, and manual refresh gets a longer live-build timeout.
- **Article-page fallback recovery**: `/news/[slug]` now derives a fallback source link from source definitions and renders synthesized summary copy when a story has no fetchable article URL or no extracted full body.
- **Error suppression for fallback stories**: The article page no longer shows "Original source URL is not available" or "Full article content is unavailable" for placeholder stories when we can present a better fallback.
- **Homepage lightweight previews**: `/` and `/api/live` now sanitize graph stories into preview payloads with title, description, source IDs, timestamp, score, topic, and URL while omitting full `content` and embeddings.
- **Dynamic news route**: Added `/news` listing alias and `/news/[slug]` article pages with SEO metadata, route-level loading skeleton, client-side full article fetch, error fallback, source metadata, and related news.
- **Card navigation**: Main feed cards are now `Link` elements with prefetch-on-hover behavior; graph node clicks push to the matching article route.
- **Removed homepage article fetch path**: The old in-page reader/modal path was removed from `LiveHome`, preventing full article content from loading on the homepage.
- **Shared routing helpers**: Added slug/path resolution and source URL extraction helpers for consistent article URLs.

## Next Steps
- Resolve existing TypeScript debt blocking `bun run check-types` (Horizon API null typing, Lottie custom element types, old NewsModal price/volume fields, missing axios, source-adapter strictness).
- Backfill or purge older placeholder-heavy records already stored in MongoDB/Redis so historical stale slugs stop resolving to synthetic entries.
- Consider persisting article extraction results in Redis so article pages can avoid refetching frequently viewed source URLs.
- Test article pages against real source-backed stories with images once live source URLs are available in the feed.
