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


