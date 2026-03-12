# Clermont AI Portal – Phase 1 Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the full monorepo, define the complete database schema, set up auth, build the app shell, implement the Project Brief Wizard (SOP Steps 1–2), and wire the first AI job (master prompt generation via Claude).

**Architecture:** Turborepo + pnpm monorepo with `apps/web` (Next.js 15 + shadcn/ui), `apps/worker` (Hono background job server), `packages/db` (Drizzle ORM schema), and `packages/core` (shared Claude/Gemini wrappers + prompt templates). Web dispatches AI jobs to worker via HTTP to avoid Vercel's 60s timeout. All content artifacts are stored as immutable `versions` rows (hidden from client by default per boss requirement).

**Tech Stack:** Next.js 15, shadcn/ui (new-york style), Tailwind CSS, Drizzle ORM, Supabase (PostgreSQL + Auth + Storage), Anthropic Claude claude-sonnet-4-6 (primary), Google Gemini (fact-checking only), Hono, TypeScript strict, pnpm workspaces, Turborepo

---

## Context

Wesley (boss) is building an AI-enabled portal for an investment firm to automate a 13-step content creation SOP that currently takes 4–8 hours manually. Edward (the developer) must build the MVP from scratch. Key constraints from the sync notes (higher priority than proposal):

1. **Context window management is critical**: Large uploaded files (financial reports, CVs, business models) must be chunked and summarized. The prompt must never be compacted by an oversized upload.
2. **Versioning must exist but be hidden from client on day one**: All version history is persisted internally; `is_client_visible` flag controls visibility.
3. **Gemini for fact-checking** (Step 8 only) – boss's explicit requirement.
4. **Draft + style guide combined in one call** (Steps 6+7) to save tokens.
5. **Final output is HTML → PDF**, not just .docx (Claude generates HTML, Puppeteer converts).

---

## Full Phase Overview

| Phase | Scope | Key Output |
|-------|-------|-----------|
| **Phase 1 (now)** | Foundation: monorepo, schema, auth, brief wizard, Claude wrapper | Working app: login → create project → generate master prompt |
| **Phase 2** | Core pipeline: file upload + chunking, 5 parallel persona drafts, synthesis, style guide + editor, Gemini fact-checker, version diff views | Complete Steps 3–9 |
| **Phase 3** | Polish + export: human review UI, devil's advocate, critique integration, HTML→PDF export, audit log, beta onboarding | Full 13-step pipeline working |

---

## Monorepo Structure (Target)

```
ai-content-portal/
├── apps/
│   ├── web/                    # Next.js 15 – deployed to Vercel
│   └── worker/                 # Hono HTTP server – deployed to Railway/Fly.io
├── packages/
│   ├── core/                   # Shared: Claude/Gemini wrappers, prompt templates, types
│   └── db/                     # Drizzle ORM schema + migrations
├── CLAUDE.md
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                # Root workspace
├── tsconfig.json               # Base TS config
├── .editorconfig
└── .env.example
```

---

## Phase 1 Tasks

### Task 1: Monorepo Root Scaffolding

**Files to create:**
- `pnpm-workspace.yaml`
- `package.json` (root)
- `turbo.json`
- `tsconfig.json` (root base config)
- `.editorconfig`
- `.env.example`

**Step 1: Create `pnpm-workspace.yaml`**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 2: Create root `package.json`**
```json
{
  "name": "ai-content-portal",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "db:generate": "turbo run db:generate",
    "db:migrate": "turbo run db:migrate",
    "db:studio": "cd packages/db && pnpm drizzle-kit studio"
  },
  "devDependencies": {
    "turbo": "^2.3.3",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  },
  "engines": { "node": ">=22.0.0", "pnpm": ">=10.0.0" }
}
```

**Step 3: Create `turbo.json`**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": { "dependsOn": ["^build"], "inputs": ["$TURBO_DEFAULT$", ".env*"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^lint"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

**Step 4: Create root `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

**Step 5: Populate `.editorconfig`**
```ini
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
[*.md]
trim_trailing_whitespace = false
```

**Step 6: Populate `.env.example`**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GEMINI_API_KEY=AIza...

# Worker (shared secret between web app and worker)
WORKER_SECRET=a-long-random-secret
WORKER_URL=http://localhost:3001

# Next.js public
NEXT_PUBLIC_WORKER_URL=http://localhost:3001
```

**Step 7: Run and verify**
```bash
pnpm install
# Expected: lockfile created, node_modules installed at root
```

**Step 8: Commit**
```bash
git add pnpm-workspace.yaml package.json turbo.json tsconfig.json .editorconfig .env.example pnpm-lock.yaml
git commit -m "feat: initialize turborepo + pnpm workspace"
```

---

### Task 2: `packages/db` – Drizzle Schema

**Files to create:**
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/drizzle.config.ts`
- `packages/db/src/client.ts`
- `packages/db/src/index.ts`
- `packages/db/src/schema/` (9 schema files)

**Step 1: Create `packages/db/package.json`**
```json
{
  "name": "@repo/db",
  "version": "0.0.1",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create `packages/db/drizzle.config.ts`**
```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

**Step 3: Create `packages/db/src/client.ts`**
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString, {
  max: process.env.NODE_ENV === "production" ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
```

**Step 4: Create schema files**

`packages/db/src/schema/users.ts`:
```typescript
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
```

`packages/db/src/schema/projects.ts`:
- Fields: `id`, `ownerId` → `users.id`, `title`, `briefData` (jsonb), `masterPrompt`, `currentStage` (int, default 1), `status` (enum: draft/active/paused/completed/archived), `activeVersionId`, `deletedAt`, `createdAt`, `updatedAt`
- `ProjectBriefData` interface: `companyName`, `sector`, `dealType`, `dealSizeUsd?`, `keyQuestion`, `targetAudience`, `toneInstructions?`, `additionalContext?`

`packages/db/src/schema/stages.ts`:
- Fields: `id`, `projectId`, `stepNumber` (1–13), `stepName`, `status` (enum: pending/running/awaiting_human/completed/failed/skipped), `workerJobId`, `errorMessage`, `metadata` (jsonb: modelId, inputTokens, outputTokens, durationMs), `startedAt`, `completedAt`, `createdAt`, `updatedAt`

`packages/db/src/schema/versions.ts` ← **load-bearing for boss constraints**:
- Fields: `id`, `projectId`, `parentVersionId` (nullable, for lineage), `producedByStep` (int), `versionType` (enum: persona_draft/synthesis/styled/fact_checked/final_styled/human_reviewed/red_report/final/exported_html), `personaId` (nullable), `internalLabel`, `content` (text), `wordCount`, `isClientVisible` (bool, default **false**), `isSealed` (bool, default false), `createdAt`

`packages/db/src/schema/personas.ts`:
- Fields: `id`, `projectId`, `name`, `description`, `systemPrompt`, `sourceUrls` (text array), `isSelected` (bool, default false), `selectionOrder` (nullable int), `createdAt`

`packages/db/src/schema/source-materials.ts`:
- Fields: `id`, `projectId`, `materialType` (enum: financial_report/business_model/cv_biography/market_research/legal_document/other), `originalFilename`, `storagePath`, `mimeType`, `fileSizeBytes`, `chunkCount` (default 0), `ndaAcknowledged` (bool), `extractedMetadata` (jsonb), `uploadedAt`

`packages/db/src/schema/source-chunks.ts` ← **solves context window constraint**:
- Fields: `id`, `materialId` → `source_materials.id`, `chunkIndex`, `content`, `sourcePage`, `charCount`, `estimatedTokens`, `summary` (nullable – AI generated), `keywords` (text array), `createdAt`

`packages/db/src/schema/style-guides.ts`:
- Fields: `id`, `projectId`, `originalFilename`, `storagePath`, `extractedRules` (jsonb: `StyleGuideRules` with toneRules/formattingRules/vocabularyRules/structureRules/prohibitions), `isProcessed` (bool), `condensedRulesText`, `uploadedAt`

`packages/db/src/schema/audit-logs.ts`:
- Fields: `id`, `projectId`, `userId`, `action` (enum covering all human + AI + system actions), `stepNumber`, `payload` (jsonb), `promptSnapshot`, `responseSnapshot`, `inputTokens`, `outputTokens`, `modelId`, `createdAt`

**Step 5: Create `packages/db/src/schema/index.ts`**
```typescript
export * from "./users.js";
export * from "./projects.js";
// ... (all 9 schemas)
```

**Step 6: Create `packages/db/src/index.ts`**
```typescript
export { db } from "./client.js";
export type { DB } from "./client.js";
export * from "./schema/index.js";
```

**Step 7: Run typecheck**
```bash
cd packages/db && pnpm typecheck
# Expected: 0 errors
```

**Step 8: Commit**
```bash
git add packages/db/
git commit -m "feat: add drizzle schema for all 9 tables"
```

---

### Task 3: Supabase Project Setup + Migration

**Step 1: Create Supabase project**
- Go to supabase.com → New project
- Copy `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` into `.env.local` (root)

**Step 2: Generate and run migration**
```bash
pnpm db:generate
# Expected: packages/db/migrations/0000_initial.sql created
pnpm db:migrate
# Expected: "Migrations applied successfully"
```

**Step 3: Apply RLS policies via Supabase SQL editor**
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- (repeat for all 9 tables)

CREATE POLICY "users_own_projects" ON projects
  FOR ALL USING (owner_id = auth.uid());

-- (cascading policies for stages, versions, personas, source_materials, etc.)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email) VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

**Step 4: Verify**
- Confirm all 9 tables appear in Supabase Table Editor
- Confirm the auth trigger function exists

---

### Task 4: `packages/core` – Claude Wrapper + Prompt Templates

**Files to create:**
- `packages/core/package.json`
- `packages/core/src/types/pipeline.ts`
- `packages/core/src/types/jobs.ts`
- `packages/core/src/claude/client.ts`
- `packages/core/src/claude/token-budget.ts`
- `packages/core/src/gemini/client.ts`
- `packages/core/src/prompts/brief.ts`
- `packages/core/src/prompts/personas.ts`
- `packages/core/src/index.ts`

**Key implementations:**

`src/types/pipeline.ts` – SOP step constants:
```typescript
export const SOP_STEPS = {
  DEFINE_TASK: 1, SELECT_PERSONAS: 2, GATHER_SOURCES: 3,
  GENERATE_PERSONA_DRAFTS: 4, SYNTHESIZE_V1: 5, LOAD_STYLE_GUIDE: 6,
  EDIT_TO_STYLE_V2: 7, FACT_CHECK_V3: 8, FINAL_STYLE_PASS_V4: 9,
  HUMAN_REVIEW_V5: 10, DEVILS_ADVOCATE: 11, INTEGRATE_CRITIQUES: 12, EXPORT: 13,
} as const;
export type SopStepNumber = (typeof SOP_STEPS)[keyof typeof SOP_STEPS];
export const SOP_STEP_NAMES: Record<SopStepNumber, string> = { 1: "Define Task & Prompt", /* ... */ };
export const HUMAN_CHECKPOINT_STEPS: SopStepNumber[] = [2, 3, 10, 11, 12];
export const AI_AGENT_STEPS: SopStepNumber[] = [1, 2, 4, 5, 7, 8, 9, 11, 12, 13];
```

`src/claude/client.ts` – `ClaudeClient` class:
- `call(options)` method: takes `system`, `messages`, `maxTokens?`, `model?`, `onComplete?` hook
- `callWithThinking(options)` method: for Steps 5 and 12 (synthesis + critique integration)
- Default model: `claude-sonnet-4-6`
- Default max tokens: 8192
- Export singleton `claude = new ClaudeClient()`

`src/claude/token-budget.ts` – context window management:
- `getAvailableContextTokens(model)`: returns `200000 - 8192 (response) - 4000 (system)` for claude-sonnet-4-6
- `estimateTokens(text)`: `Math.ceil(text.length / 3.8)` approximation
- `selectChunksForBudget(chunks, budgetTokens, useSummaries)`: greedy selection fitting chunks into budget, falling back to summaries if full chunks overflow

`src/gemini/client.ts` – minimal wrapper:
- Single `factCheck(content, claims)` method
- Uses `@google/generative-ai` package
- Only export: `gemini` singleton

`src/prompts/brief.ts`:
- `buildMasterPromptSystemPrompt()` → system prompt for investment memo specialist persona
- `buildMasterPromptUserMessage(brief: ProjectBriefData)` → user message with brief fields

`src/prompts/personas.ts`:
- `buildPersonaSuggestionSystemPrompt()` → system prompt requesting 10 expert personas as JSON array
- `buildPersonaSuggestionUserMessage(masterPrompt)` → user message

**Step: Verify**
```bash
pnpm typecheck
# Expected: 0 errors across all packages
```

**Step: Commit**
```bash
git add packages/core/
git commit -m "feat: add Claude/Gemini clients, prompt templates, pipeline types"
```

---

### Task 5: `apps/worker` – Hono Background Job Server

**Directory structure:**
```
apps/worker/src/
├── index.ts              # Hono app, port 3001
├── middleware/auth.ts    # x-worker-secret validation
├── routes/
│   ├── health.ts         # GET /health
│   ├── jobs.ts           # GET /jobs/:id
│   └── stages.ts         # POST /stages/:step/run
├── jobs/
│   ├── queue.ts          # In-memory queue (BullMQ-ready interface)
│   ├── runner.ts         # Job dispatcher
│   └── handlers/
│       ├── generate-master-prompt.ts   # Step 1
│       └── suggest-personas.ts         # Step 2
└── lib/db.ts             # Re-exports db from @repo/db
```

**Key implementations:**

`jobs/queue.ts` – in-memory queue with BullMQ-compatible interface:
```typescript
// Phase 1: in-memory Map<string, Job>
// Phase 2: swap implementation to BullMQ, keep the enqueueJob/getJob interface
export function enqueueJob<T>(type: string, payload: T): Job<T>
export function getJob(id: string): Job | undefined
```

`jobs/handlers/generate-master-prompt.ts`:
```typescript
// 1. Fetch projectId's briefData from DB
// 2. Call claude.call({ system: buildMasterPromptSystemPrompt(), messages: [...] })
// 3. Write the result to projects.master_prompt
// 4. Write audit_logs row (action: 'agent_response_received', stepNumber: 1, inputTokens, outputTokens)
// 5. Update stages row (stepNumber: 1, status: 'completed')
```

**Step: Verify**
```bash
cd apps/worker && pnpm dev
# Expected: "Worker starting on port 3001"
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

**Step: Commit**
```bash
git add apps/worker/
git commit -m "feat: add Hono worker with in-memory queue and Step 1 handler"
```

---

### Task 6: `apps/web` – Next.js 15 + shadcn/ui Setup

**Step 1: Initialize Next.js in `apps/web/`**
```bash
cd apps/web
pnpm dlx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

**Step 2: Install shadcn**
```bash
pnpm dlx shadcn@latest init
# Choose: new-york style, CSS variables: yes
# This creates components.json and updates globals.css
```

Add initial components:
```bash
pnpm dlx shadcn@latest add button card input label badge separator sonner
pnpm dlx shadcn@latest add sidebar sheet avatar dropdown-menu
```

**Step 3: Incorporate existing CSS vars**
Move `apps/global.css` OKLCH variables into `apps/web/src/styles/globals.css` (the file shadcn creates). The existing theme is already shadcn-compatible.

**Step 4: Install Supabase**
```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

**Step 5: Verify**
```bash
pnpm dev
# Expected: app loads at localhost:3000 with no errors
```

**Step 6: Commit**
```bash
git add apps/web/
git commit -m "feat: initialize Next.js 15 app with shadcn/ui and Tailwind"
```

---

### Task 7: Auth Flow (Supabase Magic Link)

**Files to create:**
- `apps/web/src/lib/supabase/client.ts` (browser client)
- `apps/web/src/lib/supabase/server.ts` (server + admin clients)
- `apps/web/src/middleware.ts` (session refresh)
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/api/auth/callback/route.ts`

**`src/lib/supabase/server.ts`** – uses `@supabase/ssr` cookie-based server client and a separate service-role admin client (for worker-side operations that bypass RLS).

**`src/middleware.ts`** – Supabase session refresh middleware on every request. Redirects unauthenticated users from `/(app)` routes to `/login`.

**`login/page.tsx`** – Shadcn `Card` with an email input and "Send magic link" button. Calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`.

**Step: Test end-to-end**
1. Navigate to `localhost:3000`
2. Should redirect to `/login`
3. Enter email → receive magic link → click → redirect to `/dashboard`

**Step: Commit**
```bash
git add apps/web/src/lib/ apps/web/src/middleware.ts apps/web/src/app/(auth)/
git commit -m "feat: add Supabase magic link auth with session middleware"
```

---

### Task 8: App Shell – Sidebar Layout + Navigation

**Files to create:**
- `apps/web/src/app/(app)/layout.tsx` (auth guard, sidebar layout)
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/app/(app)/dashboard/page.tsx`
- `apps/web/src/components/projects/pipeline-progress.tsx`

**`(app)/layout.tsx`**: Server component. Calls `supabase.auth.getUser()`. If no user, `redirect('/login')`. Renders `<Sidebar>` + `<Header>` + `<main>{children}</main>`.

**`sidebar.tsx`**: Uses shadcn Sidebar component. Nav items: Dashboard (Home icon), New Project (Plus icon), Settings (Settings icon). Shows project name at top.

**`pipeline-progress.tsx`** ← key component:
```typescript
// Renders all 13 SOP steps with status indicators
// Statuses: pending (grey) / running (spinner) / awaiting_human (clock) / completed (green check) / failed (red X)
// Current step highlighted in primary color
// Props: stages: Stage[], currentStep: number
```

**Step: Verify**
- Login → see sidebar with nav items
- Navigate between Dashboard and Settings
- Pipeline progress component renders all 13 steps

**Step: Commit**
```bash
git add apps/web/src/app/(app)/ apps/web/src/components/
git commit -m "feat: add authenticated app shell with sidebar and pipeline progress"
```

---

### Task 9: Project List + Creation API

**Files to create:**
- `apps/web/src/app/api/projects/route.ts`
- `apps/web/src/components/projects/project-card.tsx`
- `apps/web/src/components/projects/project-list.tsx`
- Update `apps/web/src/app/(app)/dashboard/page.tsx`

**`api/projects/route.ts`**:
- `GET`: Returns `db.query.projects.findMany({ where: eq(projects.ownerId, userId) })`
- `POST`: Validates body (zod), inserts project with `status: 'draft'`, creates all 13 stage rows (`status: 'pending'`), returns project

**`project-list.tsx`**: Server component. Fetches from DB directly (not via API). Renders grid of `ProjectCard` components.

**`project-card.tsx`**: Shadcn Card. Shows title, status badge, current step name, creation date. Links to `/projects/[id]`.

**Step: Verify**
```bash
# POST to /api/projects creates a project + 13 stage rows
# Dashboard shows the project card
```

**Step: Commit**
```bash
git add apps/web/src/app/api/projects/ apps/web/src/components/projects/
git commit -m "feat: project list dashboard and creation API"
```

---

### Task 10: Project Brief Wizard (SOP Steps 1–2 UI)

**Files to create:**
- `apps/web/src/app/(app)/projects/new/page.tsx`
- `apps/web/src/components/brief/brief-wizard.tsx`
- `apps/web/src/components/brief/brief-step-1.tsx`
- `apps/web/src/components/brief/brief-step-2.tsx`
- `apps/web/src/components/brief/brief-step-3.tsx`

**`brief-wizard.tsx`**: Client component managing step state (1→2→3). Shows step indicator. On final submit: POST to `/api/projects`, then redirect to `/projects/[id]`.

**`brief-step-1.tsx`**: Company name, sector (select: Technology/Healthcare/Finance/etc.), deal type (select: Series A/B/C/Growth/PE Buyout/etc.), deal size in USD (optional number input).

**`brief-step-2.tsx`**: Key question to answer (textarea), target audience (select: LP committee/Investment committee/Management team/etc.).

**`brief-step-3.tsx`**: Tone instructions (optional textarea), additional context (optional textarea), review summary of all inputs, submit button.

**Step: Verify**
1. Navigate to "New Project" → wizard renders
2. Complete all 3 steps → project created → redirected to `/projects/[id]`
3. Supabase DB shows `brief_data` JSON stored correctly

**Step: Commit**
```bash
git add apps/web/src/app/(app)/projects/new/ apps/web/src/components/brief/
git commit -m "feat: 3-step project brief wizard (SOP Steps 1-2 input)"
```

---

### Task 11: Worker Client + Job Dispatch (Step 1 AI)

**Files to create:**
- `apps/web/src/lib/worker-client.ts`
- `apps/web/src/app/api/projects/[id]/stages/[step]/run/route.ts`
- `apps/web/src/app/api/jobs/[id]/route.ts`
- `apps/web/src/hooks/use-job-status.ts`

**`worker-client.ts`**:
```typescript
export const workerClient = {
  runStage: async (stepNumber, projectId, payload) => workerFetch(`/stages/${stepNumber}/run`, { method: 'POST', body: JSON.stringify({ projectId, stepNumber, payload }) }),
  getJobStatus: async (jobId) => workerFetch(`/jobs/${jobId}`),
};
```
Auth: every request sets `x-worker-secret: WORKER_SECRET` header.

**`stages/[step]/run/route.ts`**:
1. Verify user owns the project
2. Update stage row to `status: 'running'`
3. Call `workerClient.runStage(step, projectId, payload)`
4. Update stage row with `workerJobId`
5. Return `{ jobId }` to client

**`use-job-status.ts`**: Polls `/api/jobs/[id]` every 2 seconds until `status === 'completed' | 'failed'`. Returns `{ status, isPolling }`.

**Step: Verify**
1. After brief submission, page calls `/stages/1/run`
2. Worker processes → writes `master_prompt` to project
3. UI shows generated master prompt text

**Step: Commit**
```bash
git add apps/web/src/lib/worker-client.ts apps/web/src/app/api/ apps/web/src/hooks/
git commit -m "feat: wire Step 1 AI job dispatch via worker with polling"
```

---

### Task 12: Project Overview Page

**Files to create:**
- `apps/web/src/app/(app)/projects/[id]/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/loading.tsx`

**`/projects/[id]/page.tsx`**: Server component.
- Fetches project + stages from DB
- Renders: project title, brief data summary, `PipelineProgress` (all 13 steps), master prompt display (if generated), "Generate Master Prompt" button (triggers Step 1 job if not done), status card showing current step

**Step: Verify**
- Full flow: Login → New Project → Brief Wizard → Project Overview → Generate Master Prompt → See result

**Step: Commit**
```bash
git add apps/web/src/app/(app)/projects/[id]/
git commit -m "feat: project overview page with pipeline status and Step 1 trigger"
```

---

### Task 13: CLAUDE.md

**File to create:** `CLAUDE.md` at repository root.

**Full content:**

```markdown
# CLAUDE.md – Clermont AI Portal

Read this fully before making any changes.

## Project Purpose
AI-powered investment memo creation portal automating a 13-step SOP using Claude (primary) and Gemini (fact-checking only). Monorepo: Turborepo + pnpm.

## Apps & Packages
- `apps/web/` – Next.js 15 App Router frontend → Vercel
- `apps/worker/` – Hono HTTP server, long-running AI jobs → Railway
- `packages/db/` – Drizzle ORM schema + Supabase PostgreSQL
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

## Database Rules
- All DB access through `packages/db/src/client.ts`
- Worker uses service role key (bypasses RLS). Web uses anon key (RLS enforced).
- Never `UPDATE` a sealed version. Never `DELETE` any version row.

## TypeScript Rules
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- No `any`. Use `unknown` and narrow.
- Server-only code (DB, service role) never imported in client components.

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
```

**Step: Commit**
```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with project conventions and architecture rules"
```

---

### Task 14: `.claude/mcp.json` – Configure MCP Plugins

**Files to create:**
- `.claude/mcp.json`
- `.claude/settings.json` (optional, for project-level Claude Code settings)

**`.claude/mcp.json`**:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

**Setup steps:**
1. Get Supabase personal access token: supabase.com → Account → Access Tokens → Generate
2. Get GitHub PAT: github.com → Settings → Developer Settings → PATs → New token (repo scope)
3. Add both tokens to `.env.local` (gitignored)
4. Restart Claude Code – MCP servers will auto-connect

**Why these MCPs:**
- **Supabase MCP**: Inspect tables, run SQL, check RLS policies, view storage buckets directly from Claude Code without leaving the editor
- **GitHub MCP**: Create PRs, review issues, inspect diffs during development

**Step: Verify**
```
/mcp  # In Claude Code – should show Supabase and GitHub as connected
```

**Step: Commit**
```bash
git add .claude/
git commit -m "feat: configure Supabase and GitHub MCP servers"
```

---

### Task 15: Save Memory + Populate `docs/plans/`

**Step 1:** Copy this plan to `docs/plans/2026-02-28-phase-1-foundation.md` for permanent project reference.

**Step 2:** Populate `README.md`:
```markdown
# Clermont AI Portal

AI-powered investment memo creation portal automating a 13-step SOP.

## Setup
1. Clone repo
2. Copy `.env.example` to `.env.local` and fill in values
3. `pnpm install`
4. `pnpm db:migrate`
5. `pnpm dev`

## Architecture
See `CLAUDE.md` for full conventions and `docs/plans/` for phase implementation plans.
```

**Step: Commit**
```bash
git add docs/ README.md
git commit -m "docs: add README and Phase 1 implementation plan"
```

---

## Verification: Phase 1 End-to-End Test

After completing all tasks, verify the full flow:

1. `pnpm dev` → web on 3000, worker on 3001
2. `curl localhost:3001/health` → `{"status":"ok"}`
3. Navigate to `localhost:3000` → redirects to `/login`
4. Submit email → receive magic link → click → arrive at `/dashboard`
5. Click "New Project" → complete 3-step brief wizard → create project
6. Project overview page shows `PipelineProgress` with Step 1 highlighted
7. Click "Generate Master Prompt" → job dispatched to worker → polling shows "running"
8. Job completes → master prompt text appears on project page
9. Supabase `audit_logs` table shows one row with `action: 'agent_response_received'`
10. `pnpm typecheck` passes with 0 errors

---

## Phase 2 Preview (Next Session)

- File upload to Supabase Storage with NDA acknowledgement UI
- PDF text extraction + chunking pipeline (writing to `source_chunks`)
- 5 parallel persona draft jobs dispatched simultaneously
- Synthesis engine (Step 5) with extended thinking
- Steps 6+7 combined: style guide upload + editor agent in one Claude call
- Gemini fact-checker integration (Step 8)
- Version diff view (comparing any two versions side-by-side)
