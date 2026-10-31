# Model Report: Insights and Upgrade Roadmap

This report covers the deep-learning and ranking components of News Monitor: what was wrong, what was changed, how it was measured, and what to build next. All numbers can be reproduced with `bun run eval:models` and `bun run train:topic-head` in `apps/web`.

## 1. Data and evaluation protocol

| Set | Size | Purpose |
|---|---|---|
| `eval/train.json` | 240 headlines (8 topics × 30) | Training (192) and validation (48) for the topic head, stratified split with seed 42 |
| `eval/benchmark.json`: topics | 160 headlines (8 × 20) | **Held-out test set.** Never used for training, model selection or threshold tuning of the topic head |
| `eval/benchmark.json`: duplicates | 60 pairs (30 duplicate, 30 hard negatives) | Dedupe threshold calibration and evaluation |
| `eval/benchmark.json`: search | 18 queries with graded relevant sets | Retrieval metrics |

The headlines were hand-written in wire-copy style and labelled by hand, and the train and test sets don't overlap. Every dedupe negative is deliberately hard: same topic or entity, different event. **Limitations:** the sets are small, and both were written by the same author, so absolute scores will be optimistic compared with live feeds. The *relative* comparisons are the robust part. The dedupe threshold was tuned and evaluated on the same 60 pairs, so treat it as calibration, not a clean held-out estimate.

## 2. Findings in the original system

| # | Problem | Impact |
|---|---|---|
| 1 | `cheerio` used but never imported in `source-adapters.ts` | Every RSS and Google News source threw inside try/catch and fell back to placeholder stories. This was the root cause of "placeholder dominance". |
| 2 | Retired HF endpoint (`api-inference.huggingface.co`), plus 7-day caching of hash-fallback vectors | In practice no neural embeddings at all. Hash vectors were mixed with real ones in a single index. |
| 3 | Substring topic rules ("ai" ⊂ "said", "fed" ⊂ "federal"); unmatched titles got topic `title.length % 8` | **25.6%** topic accuracy, close to the 12.5% chance level |
| 4 | "Trend" score = `title.length % 48`, at 40–50% of the ranking weight | Ranking was largely noise. Recency was also counted twice. |
| 5 | Every adapter added fabricated co-sources (e.g. GitHub → `hacker-news`, `c2intelfeeds`); `enrichStoryRelations` copied sources between stories | Inflated source counts. "Shared source" edges were near-universal. |
| 6 | Dedupe threshold 0.9 | **0% recall**: MiniLM paraphrases score 0.5–0.85, so nothing ever merged |
| 7 | Search sorted raw cosine and keyword scores together, with no cutoff | Irrelevant "semantic" hits were always shown |
| 8 | Vector index rebuilt on every request (order-sensitive check); unlike never reversed the +10 like weight; friend names missing | Wasted CPU and Redis writes; inflated collaborative-filtering signals; "Liked by 6ae642" |
| 9 | Hardcoded MongoDB Atlas credentials; fixed fallback `AUTH_SECRET`; `.env.local` not docker-ignored | Security exposure (see SETUP_TODO.md) |

## 3. Methods

**Embeddings.** `all-MiniLM-L6-v2` sentence embeddings: 384 dimensions, mean-pooled, L2-normalised. They run in-process with transformers.js and ONNX Runtime (no key needed), or through the HF router API. Requests are batched (32 per call) with a failure cooldown. Every vector is tagged with its `embeddingModel` space, and dedupe, the vector store, the graph and search only ever compare vectors within the same space.

**Topic classification (trained).** A neural head on frozen embeddings: Linear(384→64) → ReLU → Dropout(0.2) → Linear(64→8) → softmax. It's trained with cross-entropy, L2 weight decay of 1e-4, Adam (learning rate 3e-3, batch 32) and early stopping on validation loss (patience 30). Training and inference are implemented in TypeScript, so the shipped weights (`lib/models/topic-head.json`) need no ML runtime. A check confirms that the trainer and the production inference code produce identical predictions. Baselines: zero-shot prototypes (cosine similarity to the mean embedding of two topic descriptions), a softmax-regression head, and keyword rules. Self-training: `--from-db` adds stored stories as pseudo-labels wherever the keyword rules (strength ≥ 2) and the zero-shot classifier agree.

**Dedupe.** Two stories merge when cosine similarity > 0.58 **and** there's no numeric conflict, meaning both headlines quote figures and share none. Items from the same single feed are never merged.

**Search.** relevance = 0.6·cosine + 0.4·keyword, counting semantic hits only when cosine ≥ 0.3. The query must be model-embedded, in the same space as the stories.

**Ranking.** score = 0.5·trend + 0.3·recency + 0.2·session, which becomes 0.4/0.25/0.15/0.2 when a social signal exists:
- **Trend** is topical evidence plus a summary bonus, plus 5 for each independent source covering the story.
- **Recency** is exp(−λ·age), with λ = 0.08 per hour.
- **Session and user interests** are each max-normalised and blended 0.6 : 0.4.
- **Collaborative-filtering weights** are log-damped.

## 4. Results

### Topic classification (160 held-out test headlines)

| Method | Accuracy | Macro-F1 |
|---|---|---|
| Legacy substring rules (before) | 25.6% | 0.257 |
| Word-boundary keyword rules | 53.8% | 0.584 |
| Zero-shot prototypes (MiniLM, no training) | 86.3% | 0.866 |
| Keyword (strength ≥ 2), else zero-shot | 88.1% | 0.882 |
| Softmax-regression head (trained) | 88.1% | 0.880 |
| **MLP head (trained, deployed)** | **90.6%** | **0.905** |

Seed robustness (6 seeds: 42 and 1–5): MLP **89.4% ± 1.2**, softmax regression 88.9% ± 0.9, zero-shot 86.3% (deterministic), keyword + MLP hybrid 87.8%. Three conclusions:
- Training beats zero-shot by about 3 points.
- The MLP and linear heads are within noise of each other at this data size.
- Keyword overrides *hurt* once a trained head exists, so the deployed pipeline uses the head for every model-embedded story.

The shipped checkpoint is seed 42, the default fixed before any results were seen. Picking the best seed by test score would be test-set selection bias.

AI is the weakest class (recall 0.70, F1 0.78). AI headlines are often *about* another domain, and the head follows that domain:
- "Nvidia's quarterly revenue jumps…" → Macro
- "DeepMind system predicts weather…" → Climate
- "Deepfake video of candidate…" → Geopolitics
- "Self-driving taxis expand…" → Logistics

Logistics has the lowest precision (0.77). Stories with boats, transit or trade get pulled into it: "Migrant boat capsizes off Libya", "Taiwan's president transits US", "new tariffs on imported steel". These overlaps are genuinely ambiguous. Most errors are also **low-confidence**: the median softmax confidence of the 15 errors is about 0.42. So a confidence threshold that routes uncertain stories to a "General" bucket, or a multi-label output, would remove most visible mistakes (see §5).

### Dedupe (60 pairs)

| Model | ROC-AUC | Deployed operating point |
|---|---|---|
| Lexical hash fallback | 0.416 | n/a |
| MiniLM cosine | 0.756 | Threshold 0.9 → recall 0 |
| **MiniLM + numeric-conflict veto** | **0.861** | **Threshold 0.58 → P 0.765, R 0.867, F1 0.813** |
| + entity-overlap penalty (not deployed) | 0.872 | Same F1; crude heuristic, overfitting risk |

Insight: a bi-encoder scores template-identical headlines with different figures as near-duplicates. "M 4.5 – 10 km S of Ridgecrest" vs "M 2.1 – 42 km N of Ridgecrest" scores 0.94, while true paraphrases from different outlets score 0.50–0.86. Cosine alone can't separate them. This is the classic case for a cross-encoder (see §5).

### Search (18 queries)

| Method | Recall@5 | MRR | nDCG@10 |
|---|---|---|---|
| Keyword only (before) | 0.528 | 0.677 | 0.527 |
| Semantic only | 0.787 | 0.861 | 0.791 |
| **Hybrid (deployed, min sim 0.3)** | **0.856** | **0.903** | 0.824 |

### Cleanup on legacy-format data

Applied to 166 records in the pre-fix format:
- 6 placeholder stories deleted
- fake co-sources stripped from all 160 remaining
- 160 stories re-embedded with MiniLM
- topic accuracy against the hand labels raised from 25.6% to 88.1%

That run used the zero-shot pipeline, before the trained head was added. The current cleanup uses the trained head.

## 5. Upgrade roadmap (highest value first)

| Priority | Upgrade | Why / expected effect | Effort |
|---|---|---|---|
| 1 | **Cross-encoder re-ranking** for dedupe and search, e.g. `cross-encoder/ms-marco-MiniLM-L-6-v2` for search and a Quora/MRPC paraphrase cross-encoder for dedupe, applied to the top-k bi-encoder candidates | Cross-encoders read both texts jointly and handle the "same template, different numbers" failure. Expect dedupe AUC above 0.95. Runs locally in transformers.js. | Medium |
| 2 | **Stronger embedding model**: `bge-small-en-v1.5`, `gte-small` or `e5-small-v2` (same 384-d size, better MTEB scores) | Set `EMBEDDING_LOCAL_MODEL`, re-run `cleanup:stories --apply`, `train:topic-head` and `eval:models`. The embedding-space tags prevent mixing old and new vectors. (e5 needs `query:`/`passage:` prefixes.) | Low |
| 3 | **Fine-tune the encoder end-to-end**, not just a head: SetFit or contrastive fine-tuning in PyTorch, then export to ONNX | Usually +3–8 points over a frozen encoder with few labels. A strong "deep learning" deliverable: training curves, ablations, ONNX export. | Medium–high |
| 4 | **More and real labelled data**: label 500–1,000 live headlines (active learning: label where the head's confidence is lowest), and add public sets (AG News, MRPC/QQP) for pre-training and evaluation | The biggest lever on real-world accuracy, and it removes the "same author" caveat | Medium |
| 5 | **Multi-label topics** (sigmoid outputs) and a confidence threshold that sends low-confidence stories to an "Other/General" bucket | Handles genuinely mixed stories (Defense ∩ Geopolitics) | Low |
| 6 | **Event clustering and burst detection** (HDBSCAN or online agglomerative clustering on embeddings; trend = cluster growth rate) | Replaces the heuristic trend score with a real "this is taking off" signal and gives story timelines | Medium |
| 7 | **Learning-to-rank from implicit feedback**: log impressions as well as clicks and dwell (already recorded), then train logistic regression or LightGBM in place of the hand-set 0.5/0.3/0.2 weights. Evaluate offline with nDCG and online by click-through rate | Data-driven ranking. Click and dwell logging already exists. | Medium |
| 8 | **Content-based user embeddings**: user vector = recency-weighted mean of read-story embeddings. `computeMeanEmbedding` and `queryByEmbeddingVector` already exist but are unused | Cold-start personal recommendations without friends; complements collaborative filtering | Low |
| 9 | **Real matrix factorisation (ALS/BPR)** or a two-tower model over `user_interactions` instead of Jaccard similarity over friends | Proper collaborative filtering once there are enough users | Medium |
| 10 | **Bandit exploration** (Thompson sampling per topic) instead of a random 40% injection; add time decay to session interests | Principled exploration vs exploitation | Low–medium |
| 11 | **NER + entity graph** (e.g. `Xenova/bert-base-NER`): entity nodes in the graph, entity-overlap features for dedupe | Richer graph and better "same event" detection | Medium |
| 12 | **Approximate nearest-neighbour index** (HNSW via `hnswlib-node`, or MongoDB Atlas Vector Search) | Only needed beyond about 50k stories; brute force is fine at 1k | Low |

## 6. Engineering follow-ups

- `next.config.js` has `typescript.ignoreBuildErrors: true`. Four pre-existing type errors remain (Lottie JSX typing, missing `axios` in `polymarket-client.ts`). Fix them and turn type checking back on in builds.
- When every source fails, background ingestion stores placeholder stories and retriggers on each request. Add a backoff and don't persist placeholders.
- `graph-service.ts` computes friend recommendations twice per request (once for ranking, once for recommendations). Compute them once.
- Google News items store the publisher homepage as `publisherUrl`. Keep the wrapper link and resolve it on click.
- Add CI (GitHub Actions): `bun run test`, `check-types`, and `eval:models` with a regression gate on accuracy, MRR and AUC.
