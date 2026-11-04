# Architecture

## Overview
- Turborepo monorepo with a primary Next.js app in apps/web and shared packages.
- Next.js App Router pages and server routes live under apps/web/app.
- Data services and integrations are centralized in apps/web/lib.
- UI components are in apps/web/components and shared UI in packages/ui.
- Auth flows use NextAuth and dedicated auth pages under app/(auth).

## Key Components
- apps/web/app: routes, layouts, pages, and providers for the web UI.
- apps/web/app/api: server routes for auth, ingestion, and integrations.
- apps/web/lib: data access and infra services (mongodb, redis, s3, graph, vector store).
- apps/web/components: UI building blocks (news graph, live views, sidebars, modals).
- packages/*: shared eslint, tsconfig, and UI primitives.

## Data Flow
- Client pages call app/api endpoints to fetch or ingest data.
- API routes call lib services and external adapters (sources, polymarket, youtube, horizon).
- Data is stored in MongoDB/Redis/S3 and used to render feeds, graphs, and live views.



## ML Pipeline (2026-10-31)
- Ingestion: `source-adapters.ts` fetch → `classifyTopic` keyword prior + `baseSignalScore` (story-quality.ts) → `addEmbeddingsToStories` (embeddings.ts) → `refineTopicsWithEmbeddings` (topic-classifier.ts: trained MLP head `lib/models/topic-head.json` via topic-head.ts; zero-shot prototypes as fallback) → `canonicalizeStories` (dedupe.ts: cosine > 0.58 + numeric-conflict veto, same-feed never merged) → MongoDB/Redis.
- Embeddings: provider `auto|local|hf-api|lexical`. Local = transformers.js `Xenova/all-MiniLM-L6-v2` on onnxruntime-node (needs glibc, so Docker uses Debian slim). Every vector is tagged `embeddingModel`; vectors are only compared within the same space.
- Retrieval: vector-store.ts (brute-force cosine, space-aware), graph.ts edges, search-ranking.ts hybrid (0.6 semantic + 0.4 keyword, min sim 0.3), graph-service.ts ranking (trend/recency/session/social), collaborative-filtering.ts (log-damped).
- Evaluation/training: `apps/web/eval/` (benchmark.json = test, train.json = train; evaluate-models.ts, train-topic-head.ts; outputs RESULTS.md, TRAINING.md, training-curve.svg). Unit tests in `lib/__tests__` (`bun run test`). Data repair in `scripts/cleanup-stories.ts`.
