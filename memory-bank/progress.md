# Progress Log

- 2026-05-03: Created memory-bank structure and starter files.
- 2026-05-03: Populated initial architecture and session context.
- 2026-05-16: Fixed live news graph interactive bug where node clicks were not triggering neural pathway recommendation fetching.
- 2026-05-16: Enabled full detailed news rendering in the node analysis modal, added bookmark UI toggle, and fixed broken "READ ORIGINAL" links with a fallback strategy.
- 2026-05-17: Fixed "Full article content is not available" issue by implementing multi-strategy article extraction (Readability → Cheerio → raw text fallback) in fetch-article API. Enhanced frontend fallback chain to show available content even when extraction partially fails.
- 2026-05-17: Fixed placeholder stories showing empty content by adding realistic content snippets to fallback generator and implementing Google News RSS as universal fallback when primary sources fail.
- 2026-05-17: Implemented dynamic `/news/[slug]` article pages, changed homepage cards and graph node clicks to navigate to shareable article routes, added article-page loader/error/related-news states, and moved full article fetching out of the homepage.
- 2026-05-17: Added lightweight preview sanitization for homepage and `/api/live` payloads so full story content and embeddings are omitted from listing data.
- 2026-05-17: Fixed article-page fallback UX for placeholder stories by replacing the "Original source URL is not available" and "Full article content is unavailable" dead ends with synthesized summary text and a source coverage link derived from source definitions.
- 2026-05-17: Fixed the article URL resolution path so Google News wrapper URLs can be resolved to real publisher article URLs before article fetch/original-site navigation, and added publisher URL capture during RSS ingestion.
- 2026-05-17: Reduced stale placeholder dominance by detecting synthetic stories, preventing unrelated fallback-story merges, sanitizing stale DB feed payloads, and extending force-refresh live build time.
- 2026-05-17: Added GitHub events API and X (Twitter) trending RSS to `/api/horizon` route. Sidebar now shows tabs for All, Polymarket, HackerNews, Reddit, GitHub, Telegram, and X with live counts and platform-specific icons.
- 2026-05-17: Fixed horizon route TypeScript errors for null filtering and undefined payload access in GitHub event parsing.
- 2026-10-31: Completed full codebase review of the ingestion → embed → dedupe → graph → rank → recommend pipeline in preparation for model improvements.
- 2026-10-31: Model-quality pass: HF router embedding endpoint with batching and a failure cooldown, no caching of fallback vectors, missing cheerio import fixed (RSS ingestion), word-boundary topic classifier, real base signal score, fabricated source attribution removed, recency no longer double-counted, normalized personalization blend, log-damped CF with unlike reversal, set-based vector index reuse, hybrid search with a similarity cutoff.
