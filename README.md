# Clermont AI Portal

AI-powered investment memo creation portal automating a 13-step SOP.

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in all values
3. `pnpm install`
4. `pnpm db:migrate`
5. Run the RLS policies in Supabase SQL Editor: `docs/sql/rls-policies.sql`
6. `pnpm dev`

## Architecture

See `CLAUDE.md` for full conventions and `docs/plans/` for phase implementation plans.

## Apps & Packages

| Package | Description | Port |
|---------|-------------|------|
| `apps/web` | Next.js 16 frontend | 3000 |
| `apps/worker` | Hono background job server | 3001 |
| `packages/db` | Drizzle ORM schema (Supabase PostgreSQL) | – |
| `packages/core` | Claude/Gemini clients, pipeline types | – |

## Commands

```bash
pnpm dev          # Start web (3000) + worker (3001)
pnpm build        # Build all apps
pnpm typecheck    # TypeScript check all packages
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Apply migrations to Supabase
pnpm db:studio    # Open Drizzle Studio
```
