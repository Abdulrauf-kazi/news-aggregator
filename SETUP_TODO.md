# Setup To-Do: Things You Need To Do

Work through this list from top to bottom. The items marked 🔴 are urgent. Everything else in the project is already done and pushed on branch `claude/repo-overview-8wbzo4`.

---

## 🔴 1. Rotate the leaked MongoDB password (do this today)

`apps/web/lib/mongodb.ts` used to contain a real MongoDB Atlas connection string with a username and password (`fakertech:…@cluster0.bgygrgb.mongodb.net`). It's gone from the code now, but **it's still in git history**, and anyone who can see the repo can read it.

1. MongoDB Atlas → **Database Access** → user `fakertech` → **Edit** → **Edit Password** → generate a new password and save it.
2. Atlas → **Network Access**: remove `0.0.0.0/0` if it's there, and allow only your own and your deployment's IPs.
3. Put the new connection string in `apps/web/.env.local` as `MONGODB_URI` (step 3 below), never in code.
4. Optional: rewrite git history to purge the old string (`git filter-repo` or BFG). If the repo is or was ever public, treat the old password as compromised regardless.

## 🔴 2. Set a real `AUTH_SECRET`

Without it, production refuses to start. That's intentional: the old hardcoded fallback would have let anyone forge login sessions.

```sh
openssl rand -base64 32     # paste the output into AUTH_SECRET
```

## 3. Create `apps/web/.env.local`

```sh
cp apps/web/.env.example apps/web/.env.local
```

| Variable | Required? | Value |
|---|---|---|
| `MONGODB_URI` | **Yes** | Your Atlas string from step 1, ending in a database name, e.g. `/news_aggregator` |
| `AUTH_SECRET` | **Yes** | Output from step 2 |
| `REDIS_URL` | Recommended | e.g. `redis://localhost:6379` or Upstash. Without it, caches live in memory and reset on restart |
| `EMBEDDING_PROVIDER` | No | Leave it as `auto`. With no HF key, the model runs in-process |
| `HUGGINGFACE_API_KEY` | No | Only if you prefer the HF API to local inference. Create the token at huggingface.co/settings/tokens with the **"Make calls to Inference Providers"** permission |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Only for "Sign in with Google" |
| `FINNHUB_API_KEY`, `FRED_API_KEY`, `EIA_API_KEY` | No | Turn on those finance and energy sources |

Set the same variables in your hosting provider (Vercel, Render, Docker `--env-file`, …).

## 4. Install and run

```sh
bun install          # from the repo root; installs @huggingface/transformers
cd apps/web
bun run dev
```

- The first ingestion downloads the MiniLM model, about 90 MB, from huggingface.co. It's cached after that. Behind a firewall, download it once and set `EMBEDDING_LOCAL_MODEL_PATH` (see `.env.example`).
- Bun blocks the `onnxruntime-node` postinstall script by default. That's fine: the prebuilt CPU binaries ship in the package, and inference worked here without it. Only run `bun pm trust onnxruntime-node` if model loading fails on your machine.
- Open http://localhost:3000. The first load triggers ingestion from the live feeds.

## 5. Clean up the old data in MongoDB (one time)

Stories stored before these fixes have wrong topics, fake extra sources, placeholder stories and broken embeddings. After step 4 works:

```sh
cd apps/web
bun run cleanup:stories            # dry run: shows what will change
bun run cleanup:stories --apply    # writes changes, clears Redis caches
```

Check that the dry run shows `embeddedLexicalFallback: 0` before you apply. If it doesn't, the model isn't loading.

## 6. Verify the models (and regenerate the evaluation report)

```sh
cd apps/web
bun run test                 # 11 offline unit tests
bun run eval:models          # regenerates eval/RESULTS.md
bun run train:topic-head     # optional: retrain the topic head (seed 42 reproduces the shipped weights)
```

After a few days of real ingestion, you can also retrain on live data with `bun run train:topic-head --from-db`. That adds pseudo-labelled stored stories to the training set. Then re-run `eval:models` and commit the new `lib/models/topic-head.json` only if the test accuracy didn't drop.

## 7. Deploying with Docker

```sh
docker build -t news-aggregator .
docker run --env-file apps/web/.env.local -p 3000:3000 news-aggregator
```

- The base image changed from Alpine to Debian slim, because ONNX Runtime needs glibc. The image builds successfully.
- **Don't put real keys in the Dockerfile.** Its `ENV HUGGINGFACE_API_KEY="placeholder"` lines are build-time dummies. Pass real values at runtime with `--env-file`.
- `.dockerignore` now excludes `apps/web/.env*`, so your local secrets never enter the image.

## 8. Things I couldn't verify in my sandbox (please check)

My sandbox blocked all the news sites and huggingface.co, so:

- [ ] **Live ingestion.** I tested with a seeded dataset. Watch the first real run's console table (`mode` should mostly be `live`). The missing-`cheerio` fix should take most sources from `fallback` to `live`.
- [ ] **HF API provider.** Only if you set a key. I tested it against a mocked response, not the live router endpoint.
- [ ] **Google sign-in and wallet sign-in.** Email/password sign-up, sign-in, follow, like and unlike were tested end to end.
- [ ] **Google News article links.** Known issue: for Google News items, `publisherUrl` is the publisher's homepage, so "Read original" may open a homepage. See `memory-bank/failures.md`.

## 9. For the DL evaluation / presentation

- Lead with `docs/MODEL_REPORT.md`, which has the problem → method → results → ablations story.
- Show `apps/web/eval/training-curve.svg` (learning curve) and the confusion matrix in `eval/RESULTS.md`.
- Say this upfront, as it's in the docs: the train and test headlines were hand-written for this project, and they don't overlap. Live-feed accuracy will probably be a bit lower. The comparison between methods is the meaningful part.
- A live demo works offline once the model is cached locally and MongoDB has stories.
