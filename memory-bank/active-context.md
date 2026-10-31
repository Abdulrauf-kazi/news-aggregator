# Active Context

## Current Focus
- 2026-10-31: Full repo walkthrough done ahead of upcoming minimal "model improvement" changes (embeddings, topic classification, ranking, dedupe, recommendations, search). No code changed yet.
- Added GitHub and X (Twitter) sources to the sidebar feed, and reorganized sidebar tabs to show all platform sources (Polymarket, HackerNews, Reddit, GitHub, Telegram, X).

## Recent Changes
- **Sidebar platform sources**: Added GitHub events API and X trending RSS to `/api/horizon` route. Sidebar now shows tabs for All, Polymarket, HackerNews, Reddit, GitHub, Telegram, and X with live counts.
- **Origin badges**: Each feed card now displays its source origin (HACKER NEWS, REDDIT, GITHUB, TELEGRAM, X) with platform-specific icons and colors.
- **Tab redesign**: Replaced the old two-tab layout with a scrollable pill-based tab bar showing all platform sources with item counts.
- **TypeScript fixes**: Fixed horizon route type errors for null filtering and undefined payload access.

## Next Steps
- Model improvement candidates (await user scope): migrate HF embedding endpoint off legacy `api-inference.huggingface.co`; stop caching hash-fallback embeddings for 7 days; replace substring `toTopic` matching ("ai" matches "said") with word-boundary/embedding-centroid classification; replace length-modulo `scoreFromText` with a real signal; stop `enrichStoryRelations` from injecting fake sourceIds; normalize semantic vs keyword relevance in `/api/search`.
- Resolve existing TypeScript debt blocking `bun run check-types` (Horizon API null typing, Lottie custom element types, old NewsModal price/volume fields, missing axios, source-adapter strictness).
- Backfill or purge older placeholder-heavy records already stored in MongoDB/Redis so historical stale slugs stop resolving to synthetic entries.
- Consider persisting article extraction results in Redis so article pages can avoid refetching frequently viewed source URLs.
- Test article pages against real source-backed stories with images once live source URLs are available in the feed.
