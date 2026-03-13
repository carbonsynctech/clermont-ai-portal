# CLAUDE.md – Clermont AI Portal

Read this fully before making any changes.

## Project Purpose
AI-powered investment memo creation portal automating a 13-step SOP using Claude (primary) and Gemini (fact-checking only). Monorepo: Turborepo + pnpm.

## Reference Documents
- `docs/proposal.pdf` – original project proposal from the client (Wesley); product scope and business context
- `docs/sync-notes.pdf` – sync meeting notes; key decisions and constraints that **override** the proposal where they conflict
- `docs/samples/` – sample PDFs used as test inputs (PromptForge Wisdom Report, Video Game Industry report)
- `packages/db/schema.sql` – source-of-truth DDL: all enums, tables, FKs, RLS policies, PGMQ setup
- `docs/plans/2026-02-28-phase-1-foundation.md` – Phase 1 implementation plan (historical reference)

## Apps & Packages
- `apps/web/` – Next.js 16 App Router frontend → Vercel
- `apps/worker/` – Hono HTTP server, PGMQ queue consumer, long-running AI jobs → Railway
- `packages/db/` – Supabase generated types (`database.types.ts`), hand-written JSONB interfaces (`json-types.ts`), row aliases
- `packages/core/` – Claude/Gemini wrappers, prompt templates, pipeline types

## Critical Architecture Rules

### 1. Context Window Management (NON-NEGOTIABLE)
NEVER pass a raw uploaded file into a Claude message. All uploads MUST be:
1. Chunked → stored in `source_chunks` table (~1,500 token chunks)
2. AI-summarized per chunk
3. Selected at generation time via `selectChunksForBudget()` in `packages/core/src/claude/token-budget.ts`

### 2. Versions Are Immutable and Hidden by Default
- `versions.is_client_visible` defaults to `false`. Never show version history in UI unless explicitly navigated.
- `versions.is_sealed = true` means content MUST NOT be mutated. Create a new row instead.
- `projects.active_version_id` tracks the working version.

### 3. Long AI Jobs → Worker via PGMQ
Next.js API routes have a 60s Vercel timeout. Any AI call goes:
`Next.js route → workerClient.runStage() → Hono worker → enqueueJob() → PGMQ → queue consumer → handler`
Routes dispatch and return `jobId`. Client polls `/api/jobs/:jobId`. Jobs are persisted in the `jobs` table.

### 4. AI Model Assignment (follow exactly)
- **Claude `claude-sonnet-4-6`**: ALL steps EXCEPT fact-checking
- **Gemini**: Step 8 ONLY (fact-check)
- **Extended Thinking** (10k budget): Steps 5 (synthesis) and 12 (critique integration)
- Steps 6+7 are ONE combined Claude call (style guide + editing) to save tokens

### 5. Audit Every Action
Every AI call, human decision, and stage transition MUST write an `audit_logs` row. No exceptions.

### 6. Stage Rows Are Pre-created
All 12 stage rows are created when a project is created. Always update existing stage rows — never insert a new stage row.

## Database Rules
- **No ORM** — all DB access via Supabase JS client (`@supabase/supabase-js`)
- `packages/db/` exports types only (no runtime code). Import types: `import type { Project, StageMetadata } from "@repo/db"`
- Worker uses `createAdminClient()` with service role key (bypasses RLS)
- Web uses `createClient()` from `@/lib/supabase/server` with anon key (RLS enforced)
- Use `assertData()` from `apps/worker/src/lib/db.ts` to unwrap Supabase responses in worker
- All column names are **snake_case** in code (matching DB). No camelCase mapping.
- JSONB interfaces (`ProjectBriefData`, `StageMetadata`, etc.) use camelCase (hand-written).
- Never `UPDATE` a sealed version. Never `DELETE` any version row.
- Schema changes: edit `packages/db/schema.sql`, run in Supabase SQL Editor, then `pnpm db:gen-types`
- 10 tables: `audit_logs`, `jobs`, `personas`, `projects`, `source_chunks`, `source_materials`, `stages`, `style_guides`, `users`, `versions`

## TypeScript Rules
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- No `any`. Use `unknown` and narrow.
- Server-only code (DB, service role) never imported in client components.
- Module resolution: `bundler` for all non-Next.js packages (db, core, worker)
- `apps/web` uses Next.js default resolution; no `.js` extensions needed anywhere

## Codemap
```
apps/worker/src/
├── routes/          → stages.ts, jobs.ts, export.ts, health.ts, personas.ts
├── jobs/
│   ├── queue.ts     → enqueueJob (DB + PGMQ), getJob, updateJob
│   ├── runner.ts    → runJob, startQueueConsumer (PGMQ poll loop)
│   └── handlers/    → generate-master-prompt, suggest-personas,
│                      extract-and-chunk, generate-persona-drafts,
│                      synthesize, style-edit, fact-check,
│                      devils-advocate, integrate-critiques,
│                      export-html, ask-ai, generate-custom-persona,
│                      generate-cover-images
└── lib/
    ├── supabase-admin.ts → createAdminClient<Database>()
    └── db.ts             → assertData() helper

apps/web/src/app/
├── (app)/           → dashboard/, projects/, projects/[id]/, projects/[id]/audit/
├── api/projects/[id]/ → materials/, personas/, stages/, style-guide/,
                         versions/, review/, critiques/, export/
└── components/      → brief/, layout/, personas/, projects/,
                       review/, sources/, versions/

packages/db/src/
├── database.types.ts → auto-generated Supabase types (Tables, Enums, etc.)
├── json-types.ts     → hand-written JSONB interfaces
└── index.ts          → re-exports + row aliases (Project, Stage, Version, etc.)

packages/core/src/prompts/
    → brief, personas, drafts, synthesis, style, critique, final-style, export
```

## 13-Step SOP Reference
| Step | Name | Agent | Checkpoint |
|------|------|-------|-----------|
| 1 | Define Task & Prompt | Claude | No |
| 2 | Select Expert Personas | Claude | Yes – pick 5 |
| 3 | Gather Source Material | Upload | Yes – NDA |
| 4 | Generate Persona Drafts | Claude ×5 parallel | No |
| 5 | Synthesize V1 | Claude + thinking | No |
| 6+7 | Style Guide + Edit V2 | Claude (combined) | No |
| 8 | Fact-Check V3 | Gemini | No |
| 9 | Final Style Pass V4 | Claude | No |
| 10 | Human Review V5 | – | Yes – inline |
| 11 | Devil's Advocate | Claude | Yes – select critiques |
| 12 | Integrate Critiques | Claude + thinking | No |
| 13 | Export HTML→PDF | Claude + Puppeteer | No |

## Commands
```bash
pnpm dev          # Start web (3000) + worker (3001)
pnpm build        # Build all apps
pnpm typecheck    # TypeScript check all packages
pnpm db:gen-types # Regenerate Supabase types after schema changes
```

## MCP Servers
See `.claude/mcp.json`. Active: Supabase (DB inspection + migrations), GitHub (PR management).

## Pitfalls
1. Never import `@repo/db` runtime values in client components — types only (`import type`)
2. Never store ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY in web app env – worker only
3. Never call AI APIs directly from Next.js API routes
4. Never mutate a sealed version
5. Never skip writing audit_logs
6. Use `pnpm shadcn init` (local devDependency), NOT `pnpm dlx shadcn` — Node 22 compat issue
7. `selectedCritiques` (Step 11) are stored in `audit_logs.payload`; Step 12 fetches via audit_logs query where `action = "critique_selected"`
8. PDF download: Next.js `/api/projects/[id]/export` proxies to worker to keep WORKER_SECRET server-side
9. For shadcn components that fail with `pnpm shadcn add`, install from `@radix-ui` directly (e.g. checkbox)
10. All DB column access is **snake_case** — Supabase JS returns raw column names, no camelCase mapping
11. JSONB interfaces (`ProjectBriefData`, `StageMetadata`, etc.) remain **camelCase** — cast from `Json` as needed
12. `packages/db` has no runtime dependencies — only type exports. Do NOT add `drizzle-orm`, `postgres`, or any DB driver.
