# News Monitor: Real-Time News Intelligence with Sentence Embeddings

News Monitor pulls news from about 45 global sources: wire services, broadcasters, markets, science feeds, cyber threat intel and social platforms. It turns them into a personalised, semantically linked feed:

- **Topic classification**: a neural MLP head trained on frozen MiniLM sentence embeddings. Accuracy on held-out test headlines is 90.6% (89.4% ± 1.2 averaged over 6 seeds), up from 25.6% for the original rules.
- **Cross-source deduplication**: embedding similarity with a calibrated threshold and a numeric-conflict veto (ROC-AUC 0.86).
- **Semantic search**: hybrid ranking that combines sentence embeddings and keywords. MRR is 0.903 versus 0.677 for keyword-only search.
- **Story graph and recommendations**: vector nearest neighbours, a 2-hop graph walk, session interests, and collaborative filtering over friends' reads and likes.

All neural inference runs **in-process** (transformers.js on ONNX Runtime) by default, so no API key is needed. The Hugging Face Inference API is an optional alternative.

## Architecture

```
 45 sources (RSS, APIs)                         apps/web/lib
 ───────────────────────►  source-adapters.ts   fetch + normalise, keyword topic prior
                                │
                                ▼
                           embeddings.ts        all-MiniLM-L6-v2 (384-d) · local ONNX or HF API
                                │               batched, cached in Redis per embedding space
                                ▼
                           topic-classifier.ts  trained MLP head (topic-head.ts, models/topic-head.json)
                                │
                                ▼
                           dedupe.ts            cosine > 0.58 and no numeric conflict → merge
                                │
                                ▼
                           story-db.ts          MongoDB (stories) + Redis (cache)
                                │
            ┌───────────────────┼─────────────────────────┐
            ▼                   ▼                         ▼
     vector-store.ts       graph.ts                 search-ranking.ts
     kNN per story         story-story edges        0.6·semantic + 0.4·keyword
            │                   │
            ▼                   ▼
     graph-service.ts: ranking = trend + recency + session + social (collaborative-filtering.ts)
            │
            ▼
     Next.js 16 App Router UI: feed, graph view, article pages, search, friends
```

The monorepo uses Turborepo. The application is `apps/web` (Next.js 16, React 19, MongoDB, Redis, NextAuth).

## Quick start

```sh
bun install
cp apps/web/.env.example apps/web/.env.local     # set MONGODB_URI and AUTH_SECRET
cd apps/web
bun run dev                                      # http://localhost:3000
```

On first use, the in-process model (about 90 MB) downloads once from the Hugging Face hub. See [SETUP_TODO.md](SETUP_TODO.md) for the complete setup checklist.

## Deep-learning components and evaluation

| Script (run in `apps/web`) | What it does |
|---|---|
| `bun run eval:models` | Evaluates topic classification, dedupe and search on `eval/benchmark.json`, then writes `eval/RESULTS.md` |
| `bun run train:topic-head` | Trains the MLP topic head (backprop, Adam, early stopping), then writes `lib/models/topic-head.json`, `eval/TRAINING.md` and `eval/training-curve.svg`. Add `--from-db` for self-training on stored stories |
| `bun run cleanup:stories [--apply]` | Re-embeds, re-classifies and re-attributes stories stored before the model fixes |
| `bun run test` | Offline unit tests for the model components |

Headline results on held-out data (details in [eval/RESULTS.md](apps/web/eval/RESULTS.md), [eval/TRAINING.md](apps/web/eval/TRAINING.md) and [docs/MODEL_REPORT.md](docs/MODEL_REPORT.md)):

| Task | Before | After |
|---|---|---|
| Topic accuracy (160 test headlines, 8 classes) | 25.6% (substring rules) | **90.6%** (trained MLP head) |
| Dedupe recall on true duplicates | 0% (threshold 0.9 never fired) | **86.7%** at 76.5% precision |
| Search MRR / Recall@5 (18 queries) | 0.677 / 0.528 | **0.903 / 0.856** |

## Docker

```sh
docker build -t news-aggregator .
docker run --env-file apps/web/.env.local -p 3000:3000 news-aggregator
```

The image is based on Debian slim (glibc), which ONNX Runtime requires.
