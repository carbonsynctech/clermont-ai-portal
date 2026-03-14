# CLAUDE.md – Clermont AI Portal

Read this fully before making any changes.

## Project Purpose
AI-powered investment memo creation portal automating a 12-step SOP using OpenAI (primary pipeline), Claude (Ask AI + chunk summarisation), and Gemini (fact-checking + cover images). Monorepo: npm workspaces.

## Reference Documents
- `docs/proposal.pdf` – original project proposal from the client (Wesley); product scope and business context
- `docs/sync-notes.pdf` – sync meeting notes; key decisions and constraints that **override** the proposal where they conflict
- `docs/samples/` – sample PDFs used as test inputs (PromptForge Wisdom Report, Video Game Industry report)
- `database/schema.sql` – source-of-truth DDL: all enums, tables, FKs, RLS policies, PGMQ setup
- `docs/plans/2026-02-28-phase-1-foundation.md` – Phase 1 implementation plan (historical reference)

## Apps & Packages
- `web/` – Next.js 16 App Router frontend → Vercel
- `worker/` – Hono HTTP server, PGMQ queue consumer, long-running AI jobs → Railway
- `database/` – Supabase generated types (`database.types.ts`), hand-written JSONB interfaces (`json-types.ts`), row aliases
- `lib/` – OpenAI/Claude/Gemini wrappers, prompt templates, pipeline types

## Critical Architecture Rules

### 1. Context Window Management (NON-NEGOTIABLE)
NEVER pass a raw uploaded file into an AI message. All uploads MUST be:
1. Chunked → stored in `source_chunks` table (~1,500 token chunks)
2. AI-summarized per chunk
3. Selected at generation time via `selectChunksForBudget()` in `lib/src/claude/token-budget.ts` (covers OpenAI models: gpt-4o 128k, o3 200k)

### 2. Versions Are Immutable and Hidden by Default
- `versions.is_client_visible` defaults to `false`. Never show version history in UI unless explicitly navigated.
- `versions.is_sealed = true` means content MUST NOT be mutated. Create a new row instead.
- `projects.active_version_id` tracks the working version.

### 3. Long AI Jobs → Worker via PGMQ
Next.js API routes have a 60s Vercel timeout. Any AI call goes:
`Next.js route → workerClient.runStage() → Hono worker → enqueueJob() → PGMQ → queue consumer → handler`
Routes dispatch and return `jobId`. Client polls `/api/jobs/:jobId`. Jobs are persisted in the `jobs` table.

### 4. AI Model Assignment (follow exactly)
- **OpenAI `gpt-4o`**: Steps 1, 2, 4, 10+11 (style), 12 (export), TOC generation
- **OpenAI `gpt-4o` with web search**: Step 4 (persona drafts use Responses API `web_search_preview`)
- **OpenAI `o3` (reasoning)**: Steps 5 (synthesis) and 9 (critique integration)
- **Claude `claude-haiku-4-5-20251001`**: Chunk summarisation (extract-and-chunk)
- **Claude Opus**: Ask AI only (not a pipeline step)
- **Gemini**: Step 6 (fact-check) and cover image generation
- Steps 10+11 are ONE combined OpenAI call (style guide + editing) to save tokens

### 5. Audit Every Action
Every AI call, human decision, and stage transition MUST write an `audit_logs` row. No exceptions.

### 6. Stage Rows Are Pre-created
All 12 stage rows are created when a project is created. Always update existing stage rows — never insert a new stage row.

## Database Rules
- **No ORM** — all DB access via Supabase JS client (`@supabase/supabase-js`)
- `database/` exports types only (no runtime code). Import types: `import type { Project, StageMetadata } from "@repo/db"`
- Worker uses `createAdminClient()` with service role key (bypasses RLS)
- Web uses `createClient()` from `@/lib/supabase/server` with anon key (RLS enforced)
- Use `assertData()` from `worker/src/lib/db.ts` to unwrap Supabase responses in worker
- All column names are **snake_case** in code (matching DB). No camelCase mapping.
- JSONB interfaces (`ProjectBriefData`, `StageMetadata`, etc.) use camelCase (hand-written).
- Never `UPDATE` a sealed version. Never `DELETE` any version row.
- Schema changes: edit `database/schema.sql`, run in Supabase SQL Editor, then `npm run db:gen-types`
- 11 tables: `audit_logs`, `document_types`, `jobs`, `personas`, `projects`, `source_chunks`, `source_materials`, `stages`, `style_guides`, `users`, `versions`

## TypeScript Rules
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- No `any`. Use `unknown` and narrow.
- Server-only code (DB, service role) never imported in client components.
- Module resolution: `bundler` for all non-Next.js packages (database, lib, worker)
- `web` uses Next.js default resolution; no `.js` extensions needed anywhere

## Codemap
```
worker/src/
├── routes/          → stages.ts, jobs.ts, export.ts, health.ts, personas.ts
├── jobs/
│   ├── queue.ts     → enqueueJob (DB + PGMQ), getJob, updateJob
│   ├── runner.ts    → runJob, startQueueConsumer (PGMQ poll loop)
│   └── handlers/    → generate-master-prompt, suggest-personas,
│                      extract-and-chunk, generate-persona-drafts,
│                      synthesize, style-edit, fact-check,
│                      devils-advocate, integrate-critiques,
│                      export-html, ask-ai, generate-custom-persona,
│                      generate-cover-images, generate-toc
└── lib/
    ├── supabase-admin.ts → createAdminClient<Database>()
    └── db.ts             → assertData() helper

web/src/app/
├── (app)/           → dashboard/, projects/, projects/[id]/, projects/[id]/audit/, admin/
├── api/projects/[id]/ → materials/, personas/, stages/, style-guide/,
                         versions/, review/, critiques/, export/
├── api/document-types/ → CRUD for document types
└── components/      → brief/ (incl. toc-review.tsx), layout/, personas/, projects/,
                       review/, sources/, versions/

database/src/
├── database.types.ts → auto-generated Supabase types (Tables, Enums, etc.)
├── json-types.ts     → hand-written JSONB interfaces
└── index.ts          → re-exports + row aliases (Project, Stage, Version, etc.)

lib/src/prompts/
    → brief, personas, drafts, synthesis, style, critique, final-style, export, toc
```

## 12-Step SOP Reference
| Step | Name | Agent | Checkpoint |
|------|------|-------|-----------|
| 1 | Define Task & Prompt (+TOC) | OpenAI | No |
| 2 | Select Expert Personas | OpenAI | Yes – pick 5 |
| 3 | Gather Source Material | Upload | Yes – NDA |
| 4 | Generate Persona Drafts | OpenAI ×5 (web search) | No |
| 5 | Synthesize V1 | OpenAI o3 (reasoning) | No |
| 6 | Fact-Check V3 | Gemini | No |
| 7 | Human Review V5 | – | Yes – inline |
| 8 | Devil's Advocate (Red Report) | OpenAI | No (auto-completes) |
| 9 | Integrate Critiques | Auto-skipped (Red Report is annex) | No |
| 10+11 | Style Guide + Edit V2 | OpenAI (combined) | No |
| 12 | Export HTML→PDF | OpenAI + Puppeteer | No |

## Commands
```bash
npm run dev          # Start web (3000) + worker (3001)
npm run build        # Build all apps
npm run typecheck    # TypeScript check all packages
npm run db:gen-types # Regenerate Supabase types after schema changes
```

## MCP Servers
See `.claude/mcp.json`. Active: Supabase (DB inspection + migrations), GitHub (PR management).

## Pitfalls
1. Never import `@repo/db` runtime values in client components — types only (`import type`)
2. Never store OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GEMINI_API_KEY in web app env – worker only
3. Never call AI APIs directly from Next.js API routes
4. Never mutate a sealed version
5. Never skip writing audit_logs
6. Use `npx shadcn init` (local devDependency), NOT `npx dlx shadcn` — Node 22 compat issue
7. Step 9 (Integrate Critiques) is auto-skipped. The Red Report is generated at Step 8 and appended as an annex during export. No critique selection flow.
8. PDF download: Next.js `/api/projects/[id]/export` proxies to worker to keep WORKER_SECRET server-side
9. For shadcn components that fail with `npx shadcn add`, install from `@radix-ui` directly (e.g. checkbox)
10. All DB column access is **snake_case** — Supabase JS returns raw column names, no camelCase mapping
11. JSONB interfaces (`ProjectBriefData`, `StageMetadata`, etc.) remain **camelCase** — cast from `Json` as needed
12. `database` has no runtime dependencies — only type exports. Do NOT add `drizzle-orm`, `postgres`, or any DB driver.
13. Document types are managed via admin UI (`/admin/document-types`). The `define-task-step.tsx` fetches types from `/api/document-types` at runtime with hardcoded fallback.
14. TOC is stored in `projects.brief_data.tableOfContents` and injected into persona drafts and synthesis prompts.
