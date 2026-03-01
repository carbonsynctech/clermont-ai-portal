# Copilot Instructions for AI Content Portal

This guide enables AI coding agents to work productively in the AI Content Portal monorepo. Follow these conventions and rules to ensure code quality and architectural consistency.

## Big Picture Architecture
- **Monorepo**: Turborepo + pnpm. Four main packages:
  - `apps/web`: Next.js 16 frontend (App Router)
  - `apps/worker`: Hono HTTP server for long-running AI jobs
  - `packages/db`: Drizzle ORM schema for Supabase PostgreSQL
  - `packages/core`: Claude/Gemini wrappers, prompt templates, pipeline types
- **13-step SOP pipeline**: Automates investment memo creation. See `CLAUDE.md` for step breakdown and rules.
- **Strict separation**: Web app handles UI and short API calls; worker handles all AI jobs and long-running tasks.

## Critical Conventions
- **Context Window Management**: Never pass raw uploads to Claude. Always chunk, summarize, and select via `selectChunksForBudget()` (`packages/core/src/claude/token-budget.ts`).
- **Versions**: Immutable and hidden by default. Never mutate sealed versions; always create new rows.
- **Audit Logging**: Every AI call, human action, and stage transition must write to `audit_logs`.
- **Stage Rows**: All 13 stage rows are pre-created. Only update, never insert new stage rows.
- **DB Access**: Use `packages/db/src/client.ts` only. Worker uses service role key; web uses anon key (RLS enforced).
- **TypeScript**: `strict: true`, no `any`, use `unknown` and narrow. No `.js` extensions for internal packages.
- **Module Resolution**: `bundler` for non-Next.js packages; Next.js default for web.

## Developer Workflows
- **Setup**:
  1. Clone repo
  2. Copy `.env.example` to `.env.local` (in `apps/web/`)
  3. `pnpm install`
  4. `pnpm db:migrate`
  5. Run RLS policies: `docs/sql/rls-policies.sql` in Supabase SQL Editor
  6. `pnpm dev` (starts web on 3000, worker on 3001)
- **Build/Typecheck**:
  - `pnpm build` (all apps)
  - `pnpm typecheck` (all packages)
- **DB Migrations**:
  - `pnpm db:generate` (Drizzle migrations)
  - `pnpm db:migrate` (apply migrations)
  - `pnpm db:studio` (Drizzle Studio browser)

## Integration Points
- **AI Models**: Claude for all steps except fact-checking (Gemini, Step 8 only)
- **PDF Export**: HTML→PDF via Puppeteer (worker only)
- **Supabase**: RLS policies enforced for web, bypassed for worker
- **Audit Log**: All actions must be logged in `audit_logs` table

## Key Files & Directories
- `CLAUDE.md`: Architecture, rules, and SOP details
- `apps/web/src/app/`: Main UI pages and API routes
- `apps/worker/src/jobs/handlers/`: AI job handlers for each pipeline step
- `packages/core/src/prompts/`: Prompt templates for each pipeline step
- `packages/db/src/client.ts`: DB access layer
- `docs/sql/rls-policies.sql`: Supabase RLS policies

## Project-Specific Patterns
- **Never import server-only code in client components**
- **Never store AI API keys in web app env** (worker only)
- **Never call AI APIs directly from Next.js API routes**
- **PDF export is proxied through worker to keep secrets server-side**
- **Use `pnpm shadcn init` for shadcn UI components (local devDependency)**

## Examples
- **AI job dispatch**: Next.js API route → `workerClient.runStage()` → worker → AI API
- **Chunk selection**: Use `selectChunksForBudget()` for context window management
- **Audit log write**: Every stage transition, AI call, or human review must log to `audit_logs`

---

For full details, see `CLAUDE.md` and referenced docs. If any section is unclear or missing, ask for clarification or examples from the user.
