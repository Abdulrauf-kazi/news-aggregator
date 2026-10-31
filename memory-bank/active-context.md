# Active Context

## Current Focus
- 2026-10-31: Model-quality pass: embeddings, topic classification, scoring/ranking, dedupe, personalization, collaborative filtering, and search.

## Recent Changes
- **Embeddings** (`lib/embeddings.ts`): moved to the HF router endpoint (`router.huggingface.co/hf-inference/models/<model>/pipeline/feature-extraction`, overridable via `EMBEDDING_API_URL`). Requests are now batched (32 texts per call, 4 concurrent) with a timeout and a 60s cooldown after a failure. Remote calls are skipped when no key is set. The cache key is now `embedding:v2:<model>:<sha1>`, and only model vectors are cached; lexical fallback vectors never are. `embedText`/`embedTexts` return `fromModel` so callers can avoid comparing vectors from different spaces.
- **Ingestion fix**: `source-adapters.ts` used `cheerio` without importing it, so every RSS and Google News parse threw and fell back to placeholders. The import is added.
- **Topic classifier** (`lib/topic-classifier.ts`): whole-word matching (so "ai" no longer matches "said"), title + content scoring, and expanded keyword lists. When nothing matches, the topic comes from source tags or category instead of `title.length % 8`.
- **Signal score**: `scoreFromText` (title length modulo 48) is replaced by topical strength + has-summary. Each additional independent source adds +5 on dedupe merge.
- **Attribution**: removed fabricated co-source IDs (every RSS story was tagged `rss2json`, HN was tagged `github`, GitHub was tagged `hacker-news`/`c2intelfeeds`, and so on). Removed `enrichStoryRelations`, which copied other stories' sources onto each story.
- **Dedupe**: items from the same single feed are no longer merged (successive quakes and GitHub events are distinct events).
- **Ranking** (`graph-service.ts`): time is counted once, as recency = exp(-TIME_DECAY_LAMBDA × age); trend = score/100. Scores are precomputed per story.
- **Personalization**: session topics and user topic interests are each normalised before a 0.6/0.4 blend. Already-clicked stories are no longer boosted.
- **CF**: interaction weights are log-damped. Unlike now subtracts the like's +10 weight.
- **Vector store**: `ensureVectorStore` compares the set of story IDs instead of their order, so it no longer rebuilds the index and rewrites Redis on every request.
- **Search**: hybrid relevance 0.6·semantic + 0.4·keyword, with a minimum-similarity cutoff (`SEARCH_MIN_SEMANTIC_SIMILARITY`, default 0.3). Semantic scoring only runs when the query is model-embedded. Search no longer rebuilds the shared vector index.
- **Sidebar platform sources**: Added GitHub events API and X trending RSS to `/api/horizon` route. Sidebar now shows tabs for All, Polymarket, HackerNews, Reddit, GitHub, Telegram, and X with live counts.
- **Origin badges**: Each feed card now displays its source origin (HACKER NEWS, REDDIT, GITHUB, TELEGRAM, X) with platform-specific icons and colors.
- **Tab redesign**: Replaced the old two-tab layout with a scrollable pill-based tab bar showing all platform sources with item counts.
- **TypeScript fixes**: Fixed horizon route type errors for null filtering and undefined payload access.

## Next Steps
- Set a valid `HUGGINGFACE_API_KEY` (an HF token with Inference Providers permission) in every environment; without it, embeddings use the lexical fallback.
- Existing MongoDB/Redis stories still carry old topics, inflated sourceIds and possibly hash embeddings until they are re-ingested or age out. Consider a one-off purge or re-embed.
- Google News `<source url>` is the publisher homepage, but `fetchRssStories` uses it as the story `url`/`publisherUrl`. Article resolution may land on homepages; needs a live test before changing.
- Resolve existing TypeScript debt blocking `bun run check-types` (Horizon API null typing, Lottie custom element types, old NewsModal price/volume fields, missing axios, source-adapter strictness).
- Backfill or purge older placeholder-heavy records already stored in MongoDB/Redis so historical stale slugs stop resolving to synthetic entries.
- Consider persisting article extraction results in Redis so article pages can avoid refetching frequently viewed source URLs.
- Test article pages against real source-backed stories with images once live source URLs are available in the feed.
