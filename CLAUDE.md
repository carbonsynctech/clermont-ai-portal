# CLAUDE.md – Clermont AI Portal

Read this fully before making any changes.

## Project Purpose
AI-powered investment memo creation portal automating a 13-step SOP using Claude (primary) and Gemini (fact-checking only). Monorepo: Turborepo + pnpm.

## Reference Documents
- `docs/proposal.pdf` – original project proposal from the client (Wesley); product scope and business context
- `docs/sync-notes.pdf` – sync meeting notes; key decisions and constraints that **override** the proposal where they conflict
- `docs/samples/` – sample PDFs used as test inputs (PromptForge Wisdom Report, Video Game Industry report)
- `docs/sql/rls-policies.sql` – Supabase RLS policies (run once manually in Supabase SQL Editor)
- `docs/plans/2026-02-28-phase-1-foundation.md` – Phase 1 implementation plan (historical reference)

## Apps & Packages
- `apps/web/` – Next.js 16 App Router frontend → Vercel
- `apps/worker/` – Hono HTTP server, long-running AI jobs → Railway
- `packages/db/` – Drizzle ORM schema + Supabase PostgreSQL
- `packages/core/` – Claude/Gemini wrappers, prompt templates, pipeline types

## Implementation Status
All 3 phases are complete. The full 13-step pipeline is implemented end-to-end.

### Phase 1 – Foundation (complete)
Monorepo scaffold, 9-table DB schema, Supabase auth, app shell, brief wizard (Steps 1–2), Step 1 master prompt AI job.

### Phase 2 – Core Pipeline (complete)
File upload + chunking (Step 3), 5 parallel persona drafts (Step 4), synthesis (Step 5), combined style guide + editor (Steps 6+7), Gemini fact-check (Step 8), version diff views.

### Phase 3 – Polish + Export (complete)
Final style pass (Step 9), human review UI with inline editor (Step 10), devil's advocate (Step 11), critique integration (Step 12), HTML→PDF export via Puppeteer (Step 13), audit log viewer.

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

### 3. Long AI Jobs → Worker Only
Next.js API routes have a 60s Vercel timeout. Any AI call goes:
`Next.js route → workerClient.runStage() → Hono worker → AI API`
Routes dispatch (fire-and-forget) and return `jobId`. Client polls `/api/jobs/:jobId`.

### 4. AI Model Assignment (follow exactly)
- **Claude `claude-sonnet-4-6`**: ALL steps EXCEPT fact-checking
- **Gemini**: Step 8 ONLY (fact-check)
- **Extended Thinking** (10k budget): Steps 5 (synthesis) and 12 (critique integration)
- Steps 6+7 are ONE combined Claude call (style guide + editing) to save tokens

### 5. Audit Every Action
Every AI call, human decision, and stage transition MUST write an `audit_logs` row. No exceptions.

### 6. Stage Rows Are Pre-created
All 13 stage rows are created when a project is created. Always use `db.update(stages)` — never insert a new stage row.

## Database Rules
- All DB access through `packages/db/src/client.ts`
- Worker uses service role key (bypasses RLS). Web uses anon key (RLS enforced).
- Never `UPDATE` a sealed version. Never `DELETE` any version row.
- 9 tables: `audit_logs`, `personas`, `projects`, `source_chunks`, `source_materials`, `stages`, `style_guides`, `users`, `versions`

## TypeScript Rules
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- No `any`. Use `unknown` and narrow.
- Server-only code (DB, service role) never imported in client components.
- Module resolution: `bundler` for all non-Next.js packages (db, core, worker)
- No `.js` extensions in imports for packages using bundler resolution

## Module Resolution Notes
- `packages/db` and `packages/core` and `apps/worker` use `moduleResolution: "bundler"` — drizzle-kit requires this
- `apps/web` uses Next.js default resolution (no `.js` extensions needed)
- Do NOT add `"type": "module"` to `packages/db/package.json` — drizzle-kit bundles as CJS

## Key File Locations

### Worker job handlers (`apps/worker/src/jobs/handlers/`)
`generate-master-prompt.ts`, `suggest-personas.ts`, `extract-and-chunk.ts`, `generate-persona-drafts.ts`, `synthesize.ts`, `style-edit.ts`, `fact-check.ts`, `final-style-pass.ts`, `devils-advocate.ts`, `integrate-critiques.ts`, `export-html.ts`

### Worker routes (`apps/worker/src/routes/`)
`stages.ts`, `jobs.ts`, `export.ts`, `health.ts`

### Web API routes (`apps/web/src/app/api/projects/[id]/`)
`materials/`, `personas/`, `stages/`, `style-guide/`, `versions/`, `review/`, `critiques/`, `export/`

### Web app pages (`apps/web/src/app/(app)/`)
`dashboard/`, `projects/` (list + new), `projects/[id]/` (pipeline view), `projects/[id]/audit/` (audit log viewer)

### Web components
- `components/brief/` – 3-step BriefWizard
- `components/layout/` – AppSidebar, Header, UserMenu
- `components/personas/` – PersonaCard, PersonaSelector
- `components/projects/` – ProjectCard, ProjectList, PipelineProgress, StepTrigger
- `components/review/` – InlineEditor, CritiqueSelector
- `components/sources/` – MaterialUpload, StyleGuideUpload
- `components/versions/` – VersionDiff, VersionsPanel, VersionViewer

### Core prompts (`packages/core/src/prompts/`)
`brief.ts`, `personas.ts`, `drafts.ts`, `synthesis.ts`, `style.ts`, `critique.ts`, `final-style.ts`, `export.ts`

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
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Apply migrations to Supabase
pnpm db:studio    # Open Drizzle Studio (DB browser)
```

## MCP Servers
See `.claude/mcp.json`. Active: Supabase (DB inspection + migrations), GitHub (PR management).

## Pitfalls
1. Never import `@repo/db` or `postgres` in client components
2. Never store ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY in web app env – worker only
3. Never call AI APIs directly from Next.js API routes
4. Never mutate a sealed version
5. Never skip writing audit_logs
6. Use `pnpm shadcn init` (local devDependency), NOT `pnpm dlx shadcn` — Node 22 compat issue
7. DATABASE_URL must use session pooler: `aws-1-ap-northeast-1.pooler.supabase.com:5432`
8. `selectedCritiques` (Step 11) are stored in `audit_logs.payload`; Step 12 fetches via `auditLogs.findFirst` where `action = "critique_selected"`
9. PDF download: Next.js `/api/projects/[id]/export` proxies to worker to keep WORKER_SECRET server-side
10. For shadcn components that fail with `pnpm shadcn add`, install from `@radix-ui` directly (e.g. checkbox)
11. **`DATABASE_URL` must be in `apps/web/.env.local`** — Next.js only reads its own app directory, never the root `.env.local`. Both the web API routes and server components use `@repo/db` (server-side only). If you see "DATABASE_URL is not set", add it to `apps/web/.env.local`.
