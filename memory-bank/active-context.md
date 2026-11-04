# Active Context

## Current Focus
- 2026-10-31 (session 2): Get the project ready for a deep-learning final evaluation: local neural inference, a trained topic head, an evaluation harness, a cleanup script, a full-app test, security fixes and docs. User-facing to-do list: `SETUP_TODO.md`. Insights and roadmap: `docs/MODEL_REPORT.md`.

## Recent Changes
- **Article formatting for working sources (2026-11-04)**:
  - `lib/article-cleanup.ts`: DOM-only cleaner run on Readability output (and a leaf-block fallback extractor when Readability fails). Removes bylines/timestamps, photo credits, "Issued on/Modified" lines, video-player/consent messages, "Recommended stories" blocks, link-only promos, exact repeats, empty wrappers and publisher attributes; wraps images in figures. Verified on live BBC, Al Jazeera and France 24 pages via Readability 0.6.0 in the browser.
  - `/api/fetch-article`: HTML-only (images/JSON/PDF rejected), 5 MB cap, returns `status` (ok/short/empty/not-html/error) and `textLength`; old div-duplicating fallback strategies removed.
  - Article page: shows the longer of extracted text vs the feed's own text, notice whenever the reader isn't getting the full article (not for data items without a page), overflow-safe body styles, reading time only for extracted text.
  - Ingestion (`lib/text-format.ts`): feed HTML keeps paragraphs, entities decoded, "Continue reading..." / WordPress trailers removed, `content:encoded` preferred when longer. NWS titles include the area and no longer link to the JSON API; USGS gets a factual summary; arXiv keeps the abstract and authors.
- **Source audit + demo news generator (2026-11-03/04)**:
  - `docs/source-audit.md`: all 46 sources audited (code + live feed checks). 9 working, 6 partial, 31 not working. All 18 Google News search sources store publisher homepages; CNN and WSJ feeds are abandoned (2023, Jan 2025); GDELT returns 429; Polymarket unreachable; OpenSky/GitHub/CoinGecko are junk. Google News links can be decoded (31/31 in-browser).
  - `scripts/audit-sources.ts`: read-only per-source audit against the running app.
  - `lib/demo-news.ts`: for the 31 not-working sources (demo mode, on when `OPENROUTER_API_KEY` is set), live fetching is skipped and one OpenRouter-generated story per source is shown, replaced every 15 min (failures keep the previous story). Stored in `demo_generated_stories`, merged at read time by `withDemoStories`; `stories` is never written. Scheduler via `instrumentation.ts`, `/api/demo-news` (GET status, POST run), `scripts/generate-demo-news.ts`. Off with `DEMO_NEWS_ENABLED=0`.
- **Next steps**: Phase 2 source fixes from docs/source-audit.md (URL capture, Google News decode, fetcher checks, notice, quality gate), then turn demo mode off.
- **UI upgrade (2026-10-31, PR #1)**:
  - Home: the feed was trapped in a fixed-height inner scroll box, so it looked empty. It now uses normal page scroll with a sticky desktop sidebar, new story cards (sentence-case titles, topic colour chips, relative time, real source names), topic filters, and "Show more" pagination (24 per page).
  - Mobile: the navbar previously hid all navigation and sign-in below 768px. It now has a hamburger menu and a search button.
  - Shared topic palette (`lib/topic-colors.ts`) used by the graph legend, cards and insights.
  - Article page: no raw "fetch failed" text, readable headline, clean fallback summary.
  - Insights contrast raised to at least 7:1. Skip link, focus-visible ring and reduced-motion support added. Footer copy rewritten; page title fixed.
  - Bug fixes: resize-handle listener leak; the dead "Share Intelligence Brief" button now copies the feed link.
- **Session 2 (2026-10-31)**:
  - In-process MiniLM provider (transformers.js) and embedding-space tagging (`embeddingModel`).
  - Trained MLP topic head: 90.6% test accuracy, 89.4% ± 1.2 over 6 seeds, vs 86.3% zero-shot and 25.6% legacy.
  - Dedupe recalibrated: 0.9 → 0.58 plus a numeric-conflict veto (AUC 0.756 → 0.861; recall 0 → 0.867).
  - Hybrid search: MRR 0.677 → 0.903.
  - `eval/` harness, benchmark and train sets; `cleanup:stories` script (tested on seeded legacy data: topic accuracy 25.6% → 88.1%); unit tests.
  - Security: hardcoded Atlas credentials removed, AUTH_SECRET fallback limited to development, `.dockerignore` now excludes env files.
  - Fixes: `/api/horizon` uses allSettled; friend names in CF reasons; `graph+social` retrieval mode; Dockerfile moved to Debian slim; README rewritten.
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
- USER: rotate the leaked Atlas password, set AUTH_SECRET/MONGODB_URI, run `cleanup:stories --apply` (see SETUP_TODO.md).
- Verify live ingestion with real feeds (the sandbox blocked all news hosts); then `train:topic-head --from-db`.
- Roadmap top 3: cross-encoder re-ranking (dedupe/search), bge-small/gte-small embedding swap, SetFit/contrastive encoder fine-tuning.
- Set a valid `HUGGINGFACE_API_KEY` (an HF token with Inference Providers permission) in every environment; without it, embeddings use the lexical fallback.
- Existing MongoDB/Redis stories still carry old topics, inflated sourceIds and possibly hash embeddings until they are re-ingested or age out. Consider a one-off purge or re-embed.
- Google News `<source url>` is the publisher homepage, but `fetchRssStories` uses it as the story `url`/`publisherUrl`. Article resolution may land on homepages; needs a live test before changing.
- Resolve existing TypeScript debt blocking `bun run check-types` (Horizon API null typing, Lottie custom element types, old NewsModal price/volume fields, missing axios, source-adapter strictness).
- Backfill or purge older placeholder-heavy records already stored in MongoDB/Redis so historical stale slugs stop resolving to synthetic entries.
- Consider persisting article extraction results in Redis so article pages can avoid refetching frequently viewed source URLs.
- Test article pages against real source-backed stories with images once live source URLs are available in the feed.
