# Active Context

## Current Focus
- Implemented dynamic article routing so news cards navigate to shareable `/news/[slug]` pages and full article extraction happens on demand.

## Recent Changes
- **Homepage lightweight previews**: `/` and `/api/live` now sanitize graph stories into preview payloads with title, description, source IDs, timestamp, score, topic, and URL while omitting full `content` and embeddings.
- **Dynamic news route**: Added `/news` listing alias and `/news/[slug]` article pages with SEO metadata, route-level loading skeleton, client-side full article fetch, error fallback, source metadata, and related news.
- **Card navigation**: Main feed cards are now `Link` elements with prefetch-on-hover behavior; graph node clicks push to the matching article route.
- **Removed homepage article fetch path**: The old in-page reader/modal path was removed from `LiveHome`, preventing full article content from loading on the homepage.
- **Shared routing helpers**: Added slug/path resolution and source URL extraction helpers for consistent article URLs.

## Next Steps
- Resolve existing TypeScript debt blocking `bun run check-types` (Horizon API null typing, Lottie custom element types, old NewsModal price/volume fields, missing axios, source-adapter strictness).
- Consider persisting article extraction results in Redis so article pages can avoid refetching frequently viewed source URLs.
- Test article pages against real source-backed stories with images once live source URLs are available in the feed.
