# Active Context

## Current Focus
- Hardened article detail fallbacks so placeholder or source-light stories render a readable summary and source coverage link instead of dead-end error states.

## Recent Changes
- **Article-page fallback recovery**: `/news/[slug]` now derives a fallback source link from source definitions and renders synthesized summary copy when a story has no fetchable article URL or no extracted full body.
- **Error suppression for fallback stories**: The article page no longer shows "Original source URL is not available" or "Full article content is unavailable" for placeholder stories when we can present a better fallback.
- **Homepage lightweight previews**: `/` and `/api/live` now sanitize graph stories into preview payloads with title, description, source IDs, timestamp, score, topic, and URL while omitting full `content` and embeddings.
- **Dynamic news route**: Added `/news` listing alias and `/news/[slug]` article pages with SEO metadata, route-level loading skeleton, client-side full article fetch, error fallback, source metadata, and related news.
- **Card navigation**: Main feed cards are now `Link` elements with prefetch-on-hover behavior; graph node clicks push to the matching article route.
- **Removed homepage article fetch path**: The old in-page reader/modal path was removed from `LiveHome`, preventing full article content from loading on the homepage.
- **Shared routing helpers**: Added slug/path resolution and source URL extraction helpers for consistent article URLs.

## Next Steps
- Resolve existing TypeScript debt blocking `bun run check-types` (Horizon API null typing, Lottie custom element types, old NewsModal price/volume fields, missing axios, source-adapter strictness).
- Consider backfilling older cached placeholder stories in MongoDB/Redis so they carry richer `content` and canonical source URLs, not just UI-time fallbacks.
- Consider persisting article extraction results in Redis so article pages can avoid refetching frequently viewed source URLs.
- Test article pages against real source-backed stories with images once live source URLs are available in the feed.
