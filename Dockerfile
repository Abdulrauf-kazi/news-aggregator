# =============================================================
# Dockerfile for News Aggregator (Next.js Turborepo Monorepo)
# Strategy: Multi-Stage Build with Turbo Prune + Bun
#
# Stage 1 (pruner)  — Extract only the code needed for apps/web
# Stage 2 (builder) — Install deps & build the standalone Next.js app
# Stage 3 (runner)  — Tiny production image with just the runtime files
# =============================================================


# ─────────────────────────────────────────────────────────────
# STAGE 1: Pruner
# Use Turbo's prune feature to create a minimal copy of the
# monorepo containing ONLY what apps/web depends on.
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS pruner
WORKDIR /app

# Install Turbo globally so we can run the prune command
RUN bun install -g turbo@^2

# Copy the entire monorepo source into this stage
COPY . .

# Prune the workspace for the "web" app.
# This creates an /app/out directory with two sub-folders:
#   /out/json/  — only the package.json files needed (for caching installs)
#   /out/full/  — the full source code for web + its package dependencies
RUN turbo prune web --docker


# ─────────────────────────────────────────────────────────────
# STAGE 2: Builder
# Install dependencies and compile the Next.js application.
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# --- Dependency Installation (Docker Cache-Friendly) ---
# Copy ONLY the package.json files first. Docker caches this layer
# separately, so as long as package.json files don't change, the
# expensive "bun install" step is skipped on subsequent builds.
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock

# Install all dependencies (frozen to ensure reproducibility)
RUN bun install --frozen-lockfile

# --- Source Code & Build ---
# Now copy the full source code and run the build
COPY --from=pruner /app/out/full/ .

# Provide dummy placeholder values for env vars that Next.js references
# at build time. These are NOT used at runtime — real values are injected
# via `docker run --env-file`. Without these, the build crashes because
# Next.js validates env vars during compilation.
ENV REDIS_URL="redis://placeholder:6379" \
    HUGGINGFACE_API_KEY="placeholder" \
    FINNHUB_API_KEY="placeholder" \
    GRAPH_CACHE_TTL_SECONDS="20" \
    SESSION_TTL_SECONDS="2700" \
    SESSION_SOFT_DECAY_WINDOW_SECONDS="1200" \
    TIME_DECAY_LAMBDA="0.08" \
    EXPLORATION_INJECTION_RATE="0.2" \
    EMBEDDING_MODEL="sentence-transformers/all-MiniLM-L6-v2" \
    EMBEDDING_DIM="384" \
    EMBEDDING_CACHE_TTL_SECONDS="604800" \
    VECTOR_SEARCH_TOP_K="5"

# Build the Next.js app.
# - Use `bunx turbo` directly (turbo is a devDep, not a root script)
# - --env-mode=loose: don't fail if some globalEnv vars are missing
RUN bunx turbo run build --filter=web --env-mode=loose


# ─────────────────────────────────────────────────────────────
# STAGE 3: Runner (Final Production Image)
# This is the image that actually gets deployed. It contains
# ONLY the minimal runtime files — no source code, no devDeps.
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Don't run as root. Create a dedicated non-root user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the three parts of the standalone Next.js build:
# 1. The standalone server (a self-contained Node.js server + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# 2. The static assets (JS, CSS, images optimized by Next.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# 3. The public folder (favicon, robots.txt, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Switch to the non-root user for all subsequent commands
USER nextjs

# Expose the port Next.js will listen on
EXPOSE 3000

# Start the Next.js standalone server
CMD ["bun", "run", "apps/web/server.js"]
