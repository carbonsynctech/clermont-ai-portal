# Step 2 — Select Personas: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the minimal Step 2 "Suggest Expert Personas" button with a rich three-panel persona selection experience: auto-generating AI suggestions on load, a global persona library with search/filter, and a custom persona generator (LinkedIn URL or name).

**Architecture:** Auto-dispatch the existing Step 2 AI job on mount; add a new `generate-custom-persona` worker job for named personas; expose a global `GET /api/personas` search endpoint; build a `SelectPersonasStep` client component with three panels and a right-side drawer for persona details.

**Tech Stack:** Next.js 16 App Router, Hono worker, Drizzle ORM, shadcn/ui (Sheet for drawer, Tabs for category filter), ReactMarkdown, existing `useStepTrigger` hook.

---

## Prerequisites

- `apps/web/` running on port 3000, `apps/worker/` on 3001
- `pnpm dev` starts both
- All DB credentials in `apps/web/.env.local`
- Worker env in `apps/worker/.env` (ANTHROPIC_API_KEY, DATABASE_URL)

---

## Task 1: Update Drizzle schema — nullable projectId + tags on personas

**Files:**
- Modify: `packages/db/src/schema/personas.ts`

**Step 1: Edit the schema**

```ts
// packages/db/src/schema/personas.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const personas = pgTable("personas", {
  id: uuid("id").defaultRandom().primaryKey(),
  // nullable: global library personas have projectId = null
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  sourceUrls: text("source_urls").array().default([]).notNull(),
  tags: text("tags").array().default([]).notNull(),
  isSelected: boolean("is_selected").default(false).notNull(),
  selectionOrder: integer("selection_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
```

Key changes: remove `.notNull()` from `projectId`, add `tags` column.

**Step 2: Commit schema change**

```bash
cd D:/Coding-Files/GitHub/ai-content-portal
git add packages/db/src/schema/personas.ts
git commit -m "feat(db): make persona projectId nullable, add tags column"
```

---

## Task 2: Generate and apply the DB migration

**Step 1: Generate migration**

```bash
pnpm db:generate
```

Expected: creates a new file in `packages/db/drizzle/` with SQL like:
```sql
ALTER TABLE "personas" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "personas" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;
```

**Step 2: Apply migration**

```bash
pnpm db:migrate
```

Expected: `All migrations completed successfully`

**Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

**Step 4: Commit migration files**

```bash
git add packages/db/drizzle/
git commit -m "feat(db): migration — persona nullable projectId, tags column"
```

---

## Task 3: Add streaming to suggest-personas worker handler

**Files:**
- Modify: `apps/worker/src/jobs/handlers/suggest-personas.ts`
- Modify: `apps/worker/src/jobs/runner.ts`

**Step 1: Update suggest-personas to accept onChunk and stream**

```ts
// apps/worker/src/jobs/handlers/suggest-personas.ts
import { db, projects, stages, personas, auditLogs } from "@repo/db";
import {
  claude,
  buildPersonaSuggestionSystemPrompt,
  buildPersonaSuggestionUserMessage,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

interface PersonaSuggestion {
  name: string;
  description: string;
  systemPrompt: string;
  tags?: string[];
}

export async function suggestPersonas(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.masterPrompt) throw new Error(`Project ${projectId} has no master prompt`);

  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));

  const startedAt = Date.now();

  const callOptions = {
    system: buildPersonaSuggestionSystemPrompt(),
    messages: [
      { role: "user" as const, content: buildPersonaSuggestionUserMessage(project.masterPrompt) },
    ],
  };

  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  let suggestions: PersonaSuggestion[] = [];
  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]) as PersonaSuggestion[];
    }
  } catch {
    throw new Error("Failed to parse persona suggestions from Claude response");
  }

  if (suggestions.length > 0) {
    await db.insert(personas).values(
      suggestions.map((s) => ({
        projectId,
        name: s.name,
        description: s.description,
        systemPrompt: s.systemPrompt,
        tags: s.tags ?? [],
      }))
    );
  }

  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 2,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, personaCount: suggestions.length },
  });

  await db
    .update(stages)
    .set({
      status: "awaiting_human",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        modelId: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));
}
```

**Step 2: Pass onChunk for step 2 in runner.ts**

Change line `await suggestPersonas(projectId, userId);` to:

```ts
case 2:
  await suggestPersonas(projectId, userId, onChunk);
  break;
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/worker/src/jobs/handlers/suggest-personas.ts apps/worker/src/jobs/runner.ts
git commit -m "feat(worker): stream step 2 persona suggestions via onChunk"
```

---

## Task 4: Update the persona suggestion system prompt to include tags

**Files:**
- Modify: `packages/core/src/prompts/personas.ts`

**Step 1: Update the prompt to request tags**

```ts
// packages/core/src/prompts/personas.ts
export function buildPersonaSuggestionSystemPrompt(): string {
  return `You are an expert in investment analysis and financial writing. Your task is to suggest 10 distinct expert personas that could write different sections or perspectives of an investment memo.

Each persona should represent a different professional viewpoint or analytical lens that would add genuine value to the document.

Respond with a JSON array of 10 persona objects. Each object must have:
- "name": string — the persona's role/title (e.g., "Sector Analyst", "Risk Officer")
- "description": string — 2-3 sentences describing their background and perspective
- "systemPrompt": string — a detailed system prompt (150-250 words) that would be used to instruct this persona when drafting content
- "tags": string[] — one or more category tags from: Technology, Finance, Healthcare, Strategy, Legal, Operations, Other

Output ONLY the JSON array, no other text.`;
}

export function buildPersonaSuggestionUserMessage(masterPrompt: string): string {
  return `Based on the following master prompt, suggest 10 expert personas who would write compelling sections of this investment memo:

${masterPrompt}

Remember: return only a JSON array of 10 persona objects, each with name, description, systemPrompt, and tags.`;
}

export function buildCustomPersonaSystemPrompt(): string {
  return `You are an expert at creating detailed expert persona profiles for use in AI-assisted document generation.

Given a person's name and/or LinkedIn URL and optional context, generate a rich expert persona profile.

The persona name MUST follow the format: "Full Name (Role, Organisation)" — e.g. "Ray Dalio (Macro Investor, Bridgewater Associates)" or "Satya Nadella (CEO, Microsoft)".

If only a name is given without a URL, use your knowledge of that public figure. If a URL is given, use any context clues from the URL path to inform the persona.

Respond with a single JSON object with:
- "name": string — "Full Name (Role, Organisation)" format
- "description": string — 2-3 sentences on their background, philosophy, and perspective
- "systemPrompt": string — 200-300 words instructing this persona how to write; capture their communication style, analytical lens, and priorities
- "tags": string[] — one or more from: Technology, Finance, Healthcare, Strategy, Legal, Operations, Other

Output ONLY the JSON object, no other text.`;
}

export function buildCustomPersonaUserMessage(opts: {
  name: string;
  linkedinUrl?: string;
  context?: string;
}): string {
  const parts: string[] = [];
  if (opts.linkedinUrl) parts.push(`LinkedIn URL: ${opts.linkedinUrl}`);
  parts.push(`Name / description: ${opts.name}`);
  if (opts.context) parts.push(`Additional context: ${opts.context}`);
  return parts.join("\n");
}
```

**Step 2: Export the new functions from core index**

Check `packages/core/src/index.ts` — make sure the prompts/personas exports are included. If the file uses `export * from "./prompts/personas"` it will pick them up automatically.

**Step 3: Typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add packages/core/src/prompts/personas.ts
git commit -m "feat(core): add custom persona prompt builders, request tags in suggestions"
```

---

## Task 5: New worker handler — generate-custom-persona

**Files:**
- Create: `apps/worker/src/jobs/handlers/generate-custom-persona.ts`

**Step 1: Create the handler**

```ts
// apps/worker/src/jobs/handlers/generate-custom-persona.ts
import { db, personas, auditLogs } from "@repo/db";
import {
  claude,
  buildCustomPersonaSystemPrompt,
  buildCustomPersonaUserMessage,
} from "@repo/core";

export interface CustomPersonaPayload {
  name: string;
  linkedinUrl?: string;
  context?: string;
  projectId: string;
  userId: string;
}

interface PersonaResult {
  name: string;
  description: string;
  systemPrompt: string;
  tags?: string[];
}

export async function generateCustomPersona(
  payload: CustomPersonaPayload,
  onChunk?: (chunk: string) => void,
): Promise<{ personaId: string }> {
  const { name, linkedinUrl, context, projectId, userId } = payload;

  const callOptions = {
    system: buildCustomPersonaSystemPrompt(),
    messages: [
      {
        role: "user" as const,
        content: buildCustomPersonaUserMessage({ name, linkedinUrl, context }),
      },
    ],
  };

  const startedAt = Date.now();
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);
  const durationMs = Date.now() - startedAt;

  let parsed: PersonaResult;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in response");
    parsed = JSON.parse(jsonMatch[0]) as PersonaResult;
  } catch {
    throw new Error("Failed to parse custom persona from Claude response");
  }

  const [inserted] = await db
    .insert(personas)
    .values({
      projectId,
      name: parsed.name,
      description: parsed.description,
      systemPrompt: parsed.systemPrompt,
      tags: parsed.tags ?? [],
      sourceUrls: linkedinUrl ? [linkedinUrl] : [],
    })
    .returning({ id: personas.id });

  if (!inserted) throw new Error("Failed to insert persona");

  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 2,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, customPersona: true, personaId: inserted.id },
  });

  return { personaId: inserted.id };
}
```

**Step 2: Register the job type in runner.ts**

In `apps/worker/src/jobs/runner.ts`, import and add a new branch for `custom_persona` jobs:

```ts
import { generateCustomPersona } from "./handlers/generate-custom-persona";
import type { CustomPersonaPayload } from "./handlers/generate-custom-persona";
```

Add before the `try` block's catch:

```ts
if (job.type === "custom_persona") {
  const payload = job.payload as CustomPersonaPayload;
  const result = await generateCustomPersona(payload, onChunk);
  updateJob(jobId, { status: "completed", completedAt: new Date(), result });
  return;
}
```

Place this check BEFORE the `if (job.type === "extract_material")` check, or add it as a peer condition. Full updated runner logic:

```ts
if (job.type === "extract_material") {
  // existing...
} else if (job.type === "custom_persona") {
  const payload = job.payload as CustomPersonaPayload;
  const result = await generateCustomPersona(payload, onChunk);
  updateJob(jobId, { status: "completed", completedAt: new Date(), result });
  return;
} else {
  // existing switch(stepNumber)...
}
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/worker/src/jobs/handlers/generate-custom-persona.ts apps/worker/src/jobs/runner.ts
git commit -m "feat(worker): add generate-custom-persona job handler"
```

---

## Task 6: New worker route — personas

**Files:**
- Create: `apps/worker/src/routes/personas.ts`
- Modify: `apps/worker/src/index.ts`

**Step 1: Create the personas route**

```ts
// apps/worker/src/routes/personas.ts
import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob } from "../jobs/queue";
import { runJob } from "../jobs/runner";

const personasRoute = new Hono();

personasRoute.use("*", workerAuth);

const generatePersonaSchema = z.object({
  name: z.string().min(1),
  linkedinUrl: z.string().url().optional(),
  context: z.string().optional(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});

personasRoute.post("/generate", async (c) => {
  const body = await c.req.json();
  const parsed = generatePersonaSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const job = enqueueJob("custom_persona", parsed.data);

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background persona job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

export { personasRoute };
```

**Step 2: Register route in index.ts**

```ts
// In apps/worker/src/index.ts — add import + route:
import { personasRoute } from "./routes/personas";

// After existing app.route calls:
app.route("/personas", personasRoute);
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/worker/src/routes/personas.ts apps/worker/src/index.ts
git commit -m "feat(worker): add /personas/generate route for custom persona jobs"
```

---

## Task 7: New web API — GET /api/personas (global library search)

**Files:**
- Create: `apps/web/src/app/api/personas/route.ts`

**Step 1: Create the route**

```ts
// apps/web/src/app/api/personas/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, personas } from "@repo/db";
import { ilike, or, arrayContains, ne, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const tag = searchParams.get("tag")?.trim() ?? "";
  const excludeProjectId = searchParams.get("excludeProjectId")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);
  const offset = Number(searchParams.get("offset") ?? "0");

  // Build where conditions progressively using Drizzle's query builder
  const rows = await db.query.personas.findMany({
    limit,
    offset,
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  // Filter in JS for simplicity (avoids complex Drizzle dynamic where chaining)
  let filtered = rows;

  // Exclude this project's own personas (they show in Section 3 already)
  if (excludeProjectId) {
    filtered = filtered.filter((p) => p.projectId !== excludeProjectId);
  }

  // Full-text search across name + description
  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower)
    );
  }

  // Tag filter
  if (tag && tag !== "All") {
    filtered = filtered.filter((p) => p.tags.includes(tag));
  }

  return NextResponse.json(filtered);
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/app/api/personas/route.ts
git commit -m "feat(web): add GET /api/personas global library search endpoint"
```

---

## Task 8: New web API — POST /api/projects/[id]/personas/generate

**Files:**
- Create: `apps/web/src/app/api/projects/[id]/personas/generate/route.ts`
- Modify: `apps/web/src/lib/worker-client.ts`

**Step 1: Create the dispatch route**

```ts
// apps/web/src/app/api/projects/[id]/personas/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, projects } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { workerClient } from "@/lib/worker-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: unknown;
    linkedinUrl?: unknown;
    context?: unknown;
  };

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const result = await workerClient.generatePersona({
      name: body.name.trim(),
      linkedinUrl: typeof body.linkedinUrl === "string" ? body.linkedinUrl : undefined,
      context: typeof body.context === "string" ? body.context : undefined,
      projectId,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

**Step 2: Add generatePersona to worker-client.ts**

Add to the `workerClient` object:

```ts
generatePersona: async (opts: {
  name: string;
  linkedinUrl?: string;
  context?: string;
  projectId: string;
  userId: string;
}) =>
  workerFetch("/personas/generate", {
    method: "POST",
    body: JSON.stringify(opts),
  }) as Promise<{ jobId: string; status: string }>,
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/app/api/projects/[id]/personas/generate/route.ts apps/web/src/lib/worker-client.ts
git commit -m "feat(web): add personas/generate API route + workerClient.generatePersona"
```

---

## Task 9: Install shadcn tabs component

No `tabs.tsx` currently in `apps/web/src/components/ui/`. No `drawer.tsx` either — we'll use `Sheet` (already installed) for the right-side panel.

**Step 1: Install tabs**

```bash
cd apps/web && pnpm shadcn add tabs
```

If that fails (Node 22 compat), install manually:

```bash
cd apps/web && pnpm add @radix-ui/react-tabs
```

Then copy the shadcn Tabs component from the shadcn registry into `apps/web/src/components/ui/tabs.tsx`. The component code is at: https://ui.shadcn.com/docs/components/tabs

**Step 2: Verify the file exists**

```bash
ls apps/web/src/components/ui/tabs.tsx
```

**Step 3: Commit**

```bash
git add apps/web/src/components/ui/tabs.tsx
git commit -m "feat(web): add shadcn tabs component"
```

---

## Task 10: Build PersonaCardV2 component

This replaces the old `PersonaCard` for use in the new Step 2 UI. Keep the old one — it's still used in `PersonaSelector` for the completed state.

**Files:**
- Create: `apps/web/src/components/personas/persona-card-v2.tsx`

**Step 1: Create the component**

```tsx
// apps/web/src/components/personas/persona-card-v2.tsx
"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Persona } from "@repo/db";

interface PersonaCardV2Props {
  persona: Persona;
  isSelected: boolean;
  onSelect: () => void;
  onView: () => void;
  disableSelect?: boolean;
}

export function PersonaCardV2({
  persona,
  isSelected,
  onSelect,
  onView,
  disableSelect = false,
}: PersonaCardV2Props) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3 transition-colors",
        isSelected && "border-primary bg-primary/5"
      )}
    >
      <div className="space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{persona.name}</p>
          {isSelected && (
            <Badge className="shrink-0 h-5 px-1.5 text-[10px] gap-0.5">
              <Check className="h-2.5 w-2.5" />
              Selected
            </Badge>
          )}
        </div>
        {persona.tags.length > 0 && (
          <p className="text-xs text-muted-foreground">{persona.tags.join(" · ")}</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
        {persona.description}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          className="h-7 text-xs flex-1"
          disabled={disableSelect && !isSelected}
          onClick={onSelect}
        >
          {isSelected ? "Deselect" : "Select"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs flex-1"
          onClick={onView}
        >
          View
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/personas/persona-card-v2.tsx
git commit -m "feat(web): add PersonaCardV2 with Select/View buttons"
```

---

## Task 11: Build PersonaDrawer (right-side Sheet)

**Files:**
- Create: `apps/web/src/components/personas/persona-drawer.tsx`

**Step 1: Create the component**

```tsx
// apps/web/src/components/personas/persona-drawer.tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Persona } from "@repo/db";

interface PersonaDrawerProps {
  persona: Persona | null;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export function PersonaDrawer({
  persona,
  isSelected,
  onSelect,
  onClose,
}: PersonaDrawerProps) {
  return (
    <Sheet open={!!persona} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {persona && (
          <>
            <SheetHeader className="mb-4">
              <div className="flex items-start justify-between gap-3 pr-4">
                <div className="space-y-1">
                  <SheetTitle className="text-base leading-snug">{persona.name}</SheetTitle>
                  {persona.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {persona.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs h-5 px-1.5">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="shrink-0"
                  onClick={onSelect}
                >
                  {isSelected ? (
                    <><Check className="h-3.5 w-3.5 mr-1.5" />Selected</>
                  ) : (
                    "Select"
                  )}
                </Button>
              </div>
              <SheetDescription className="text-sm text-foreground/80 leading-relaxed text-left">
                {persona.description}
              </SheetDescription>
            </SheetHeader>

            {persona.sourceUrls.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {persona.sourceUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                  >
                    <Link className="h-3 w-3" />
                    {url.replace(/^https?:\/\//, "").slice(0, 50)}
                  </a>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                System Prompt
              </p>
              <div className="rounded-xl border bg-muted/30 p-4
                prose prose-sm dark:prose-invert max-w-none text-foreground
                [&_p]:leading-7 [&_p:not(:first-child)]:mt-3
                [&_ul]:my-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul>li]:mt-1
                [&_ol]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol>li]:mt-1
                [&_strong]:font-semibold
                [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {persona.systemPrompt}
                </ReactMarkdown>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/personas/persona-drawer.tsx
git commit -m "feat(web): add PersonaDrawer (Sheet) component"
```

---

## Task 12: Build CustomPersonaPanel

**Files:**
- Create: `apps/web/src/components/personas/custom-persona-panel.tsx`

**Step 1: Create the component**

```tsx
// apps/web/src/components/personas/custom-persona-panel.tsx
"use client";

import { useState } from "react";
import { UserPlus, Link } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StepTriggerOutput } from "@/components/projects/step-trigger";
import { useJobStatus } from "@/hooks/use-job-status";
import type { Persona } from "@repo/db";
import { PersonaCardV2 } from "./persona-card-v2";
import { PersonaDrawer } from "./persona-drawer";

interface CustomPersonaPanelProps {
  projectId: string;
  selectedIds: string[];
  onSelect: (persona: Persona) => void;
  selectedCount: number;
  maxCount: number;
}

export function CustomPersonaPanel({
  projectId,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
}: CustomPersonaPanelProps) {
  const [name, setName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [generatedPersonas, setGeneratedPersonas] = useState<Persona[]>([]);
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);

  const { status, job, isPolling, elapsedSeconds, partialOutput } = useJobStatus(jobId);

  // When job completes, fetch the new persona from the result
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "completed" && job?.result) {
      const { personaId } = job.result as { personaId: string };
      void fetch(`/api/personas/${personaId}`)
        .then((r) => r.json())
        .then((p: Persona) => {
          setGeneratedPersonas((prev) => [p, ...prev]);
          setJobId(null);
          setName("");
          setLinkedinUrl("");
          setContext("");
        });
    }
  }

  const phase = (() => {
    if (isDispatching) return "dispatching" as const;
    if (isPolling && !partialOutput) return "waiting" as const;
    if (isPolling && partialOutput) return "streaming" as const;
    return null;
  })();

  const trigger = {
    isRunning: isDispatching || isPolling,
    isDispatching,
    phase,
    showError: dispatchError ?? (status === "failed" ? "Generation failed. Please try again." : null),
    elapsedSeconds,
    partialOutput,
    outputRef: { current: null },
    handleRun: async () => {},
    handleReset: () => { setJobId(null); setDispatchError(null); },
  };

  async function handleGenerate() {
    if (!name.trim()) return;
    setIsDispatching(true);
    setDispatchError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/personas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          linkedinUrl: linkedinUrl.trim() || undefined,
          context: context.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setDispatchError(body.error ?? "Failed to start generation");
        return;
      }

      const data = (await res.json()) as { jobId?: string };
      if (data.jobId) setJobId(data.jobId);
    } catch {
      setDispatchError("Network error");
    } finally {
      setIsDispatching(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Customize a Persona</h3>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Person name or LinkedIn URL (e.g. Ray Dalio, or https://linkedin.com/in/...)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5 text-muted-foreground"
            onClick={() => setShowContext((v) => !v)}
          >
            <Link className="size-3.5" />
            URL
          </Button>
        </div>

        {showContext && (
          <Input
            placeholder="LinkedIn profile URL (optional)"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
        )}

        <Textarea
          placeholder="Additional context (optional) — e.g. 'Focus on ESG lens' or 'Early-stage venture perspective'"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          className="text-sm"
        />

        <Button
          size="sm"
          disabled={!name.trim() || trigger.isRunning}
          onClick={() => void handleGenerate()}
        >
          Generate Persona
        </Button>
      </div>

      <StepTriggerOutput trigger={trigger} />

      {generatedPersonas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          {generatedPersonas.map((p) => (
            <PersonaCardV2
              key={p.id}
              persona={p}
              isSelected={selectedIds.includes(p.id)}
              onSelect={() => onSelect(p)}
              onView={() => setDrawerPersona(p)}
              disableSelect={selectedCount >= maxCount && !selectedIds.includes(p.id)}
            />
          ))}
        </div>
      )}

      <PersonaDrawer
        persona={drawerPersona}
        isSelected={drawerPersona ? selectedIds.includes(drawerPersona.id) : false}
        onSelect={() => { if (drawerPersona) onSelect(drawerPersona); }}
        onClose={() => setDrawerPersona(null)}
      />
    </div>
  );
}
```

**Note:** This requires a `GET /api/personas/[id]` route to fetch the newly-created persona. Add that in Task 13.

**Step 2: Create GET /api/personas/[id]**

```ts
// apps/web/src/app/api/personas/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, personas } from "@repo/db";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const persona = await db.query.personas.findFirst({
    where: eq(personas.id, id),
  });

  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(persona);
}
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/components/personas/custom-persona-panel.tsx apps/web/src/app/api/personas/
git commit -m "feat(web): add CustomPersonaPanel + GET /api/personas/[id] route"
```

---

## Task 13: Build PersonaLibraryPanel

**Files:**
- Create: `apps/web/src/components/personas/persona-library-panel.tsx`

Requires `tabs.tsx` from Task 9.

**Step 1: Create the component**

```tsx
// apps/web/src/components/personas/persona-library-panel.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Library } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonaCardV2 } from "./persona-card-v2";
import { PersonaDrawer } from "./persona-drawer";
import type { Persona } from "@repo/db";

const TAGS = ["All", "Technology", "Finance", "Healthcare", "Strategy", "Legal", "Operations", "Other"] as const;

interface PersonaLibraryPanelProps {
  projectId: string;
  selectedIds: string[];
  onSelect: (persona: Persona) => void;
  selectedCount: number;
  maxCount: number;
}

export function PersonaLibraryPanel({
  projectId,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
}: PersonaLibraryPanelProps) {
  const [q, setQ] = useState("");
  const [activeTag, setActiveTag] = useState<string>("All");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        excludeProjectId: projectId,
        limit: "30",
      });
      if (q) params.set("q", q);
      if (activeTag !== "All") params.set("tag", activeTag);

      const res = await fetch(`/api/personas?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as Persona[];
        setPersonas(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, q, activeTag]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => void fetchPersonas(), 400);
    return () => clearTimeout(timer);
  }, [fetchPersonas]);

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Library className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Persona Library</h3>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search personas by name or expertise…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      <Tabs value={activeTag} onValueChange={setActiveTag}>
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
          {TAGS.map((tag) => (
            <TabsTrigger
              key={tag}
              value={tag}
              className="rounded-lg border text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
            >
              {tag}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : personas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {q || activeTag !== "All"
            ? "No personas match your search."
            : "The library is empty — generate personas above to populate it."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {personas.map((persona) => (
            <PersonaCardV2
              key={persona.id}
              persona={persona}
              isSelected={selectedIds.includes(persona.id)}
              onSelect={() => onSelect(persona)}
              onView={() => setDrawerPersona(persona)}
              disableSelect={selectedCount >= maxCount && !selectedIds.includes(persona.id)}
            />
          ))}
        </div>
      )}

      <PersonaDrawer
        persona={drawerPersona}
        isSelected={drawerPersona ? selectedIds.includes(drawerPersona.id) : false}
        onSelect={() => { if (drawerPersona) onSelect(drawerPersona); }}
        onClose={() => setDrawerPersona(null)}
      />
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/personas/persona-library-panel.tsx
git commit -m "feat(web): add PersonaLibraryPanel with search and tag filter"
```

---

## Task 14: Build AISuggestionsPanel (auto-dispatch)

**Files:**
- Create: `apps/web/src/components/personas/ai-suggestions-panel.tsx`

**Step 1: Create the component**

```tsx
// apps/web/src/components/personas/ai-suggestions-panel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StepTriggerOutput } from "@/components/projects/step-trigger";
import { useStepTrigger } from "@/components/projects/step-trigger";
import { PersonaCardV2 } from "./persona-card-v2";
import { PersonaDrawer } from "./persona-drawer";
import type { Persona } from "@repo/db";

interface AISuggestionsPanelProps {
  projectId: string;
  stage1Done: boolean;
  stage2Status: string;
  projectPersonas: Persona[];
  selectedIds: string[];
  onSelect: (persona: Persona) => void;
  selectedCount: number;
  maxCount: number;
}

export function AISuggestionsPanel({
  projectId,
  stage1Done,
  stage2Status,
  projectPersonas,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
}: AISuggestionsPanelProps) {
  const router = useRouter();
  const trigger = useStepTrigger(projectId, 2, stage2Status);
  const hasAutoDispatched = useRef(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);

  // Auto-dispatch on first mount if conditions met
  useEffect(() => {
    if (
      !hasAutoDispatched.current &&
      stage1Done &&
      stage2Status === "pending" &&
      projectPersonas.length === 0
    ) {
      hasAutoDispatched.current = true;
      void trigger.handleRun();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh page when generation completes to show new personas
  useEffect(() => {
    if (!trigger.isRunning && hasAutoDispatched.current && projectPersonas.length === 0) {
      router.refresh();
    }
  }, [trigger.isRunning, projectPersonas.length, router]);

  const isIdle = !trigger.isRunning && projectPersonas.length === 0 && stage2Status !== "awaiting_human";

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">AI-Tailored Suggestions</h3>
          {stage1Done && stage2Status === "pending" && projectPersonas.length === 0 && (
            <span className="text-xs text-muted-foreground">(generating…)</span>
          )}
        </div>

        {projectPersonas.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              disabled={trigger.isRunning}
              onClick={() => {
                hasAutoDispatched.current = true;
                void trigger.handleRun();
              }}
            >
              <RefreshCw className="size-3" />
              Generate More
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowCustomPrompt((v) => !v)}
            >
              + Add Prompt
            </Button>
          </div>
        )}
      </div>

      {showCustomPrompt && (
        <div className="space-y-2">
          <Textarea
            placeholder="Guide the AI — e.g. 'Focus on ESG and sustainability experts' or 'Include more technical engineering perspectives'"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Note: custom prompts are not yet wired into the generation — this will be supported in a future update.
          </p>
        </div>
      )}

      {!stage1Done && (
        <p className="text-sm text-muted-foreground">Complete Step 1 to generate tailored personas.</p>
      )}

      <StepTriggerOutput trigger={trigger} />

      {projectPersonas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {projectPersonas.map((persona) => (
            <PersonaCardV2
              key={persona.id}
              persona={persona}
              isSelected={selectedIds.includes(persona.id)}
              onSelect={() => onSelect(persona)}
              onView={() => setDrawerPersona(persona)}
              disableSelect={selectedCount >= maxCount && !selectedIds.includes(persona.id)}
            />
          ))}
        </div>
      )}

      <PersonaDrawer
        persona={drawerPersona}
        isSelected={drawerPersona ? selectedIds.includes(drawerPersona.id) : false}
        onSelect={() => { if (drawerPersona) onSelect(drawerPersona); }}
        onClose={() => setDrawerPersona(null)}
      />
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/personas/ai-suggestions-panel.tsx
git commit -m "feat(web): add AISuggestionsPanel with auto-dispatch on mount"
```

---

## Task 15: Build SelectPersonasStep (main orchestrator)

**Files:**
- Create: `apps/web/src/components/projects/steps/select-personas-step.tsx`

**Step 1: Create the component**

```tsx
// apps/web/src/components/projects/steps/select-personas-step.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomPersonaPanel } from "@/components/personas/custom-persona-panel";
import { PersonaLibraryPanel } from "@/components/personas/persona-library-panel";
import { AISuggestionsPanel } from "@/components/personas/ai-suggestions-panel";
import type { Persona } from "@repo/db";

const REQUIRED_COUNT = 5;

interface SelectPersonasStepProps {
  projectId: string;
  stage1Status: string;
  stage2Status: string;
  projectPersonas: Persona[];
}

export function SelectPersonasStep({
  projectId,
  stage1Status,
  stage2Status,
  projectPersonas,
}: SelectPersonasStepProps) {
  const router = useRouter();
  const stage1Done = stage1Status === "completed";

  // Selection state — shared across all panels
  // Initialise from already-confirmed personas if stage is completed
  const alreadySelected = projectPersonas
    .filter((p) => p.isSelected)
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))
    .map((p) => p.id);

  const [selectedIds, setSelectedIds] = useState<string[]>(alreadySelected);
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>(
    projectPersonas.filter((p) => alreadySelected.includes(p.id))
  );

  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function handleSelect(persona: Persona) {
    setSelectedIds((prev) => {
      if (prev.includes(persona.id)) {
        setSelectedPersonas((ps) => ps.filter((p) => p.id !== persona.id));
        return prev.filter((id) => id !== persona.id);
      }
      if (prev.length >= REQUIRED_COUNT) return prev;
      setSelectedPersonas((ps) => [...ps, persona]);
      return [...prev, persona.id];
    });
  }

  async function handleConfirm() {
    if (selectedIds.length !== REQUIRED_COUNT) return;
    setIsConfirming(true);
    setConfirmError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/personas/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaIds: selectedIds }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setConfirmError(body.error ?? "Failed to confirm");
        return;
      }

      router.push(`/projects/${projectId}?step=3`);
    } catch {
      setConfirmError("Network error. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  }

  const isConfirmed = stage2Status === "completed";

  return (
    <div className="space-y-5">
      {isConfirmed ? (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="size-4" />
            <h3 className="font-medium text-sm">5 personas confirmed for this project</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {projectPersonas
              .filter((p) => p.isSelected)
              .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))
              .map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs h-5 px-1.5 shrink-0">{i + 1}</Badge>
                  <span>{p.name}</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <>
          <CustomPersonaPanel
            projectId={projectId}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedCount={selectedIds.length}
            maxCount={REQUIRED_COUNT}
          />

          <PersonaLibraryPanel
            projectId={projectId}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedCount={selectedIds.length}
            maxCount={REQUIRED_COUNT}
          />

          <AISuggestionsPanel
            projectId={projectId}
            stage1Done={stage1Done}
            stage2Status={stage2Status}
            projectPersonas={projectPersonas}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedCount={selectedIds.length}
            maxCount={REQUIRED_COUNT}
          />

          {/* Sticky confirmation bar */}
          <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 backdrop-blur px-5 py-3.5 shadow-lg">
            <div className="flex items-center gap-3">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} / {REQUIRED_COUNT} personas selected
              </span>
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1 max-w-sm">
                  {selectedPersonas.slice(0, 3).map((p) => (
                    <Badge key={p.id} variant="secondary" className="text-xs h-5 max-w-[120px] truncate px-1.5">
                      {p.name.split(" (")[0]}
                    </Badge>
                  ))}
                  {selectedPersonas.length > 3 && (
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      +{selectedPersonas.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {confirmError && (
                <p className="text-xs text-destructive">{confirmError}</p>
              )}
              <Button
                disabled={selectedIds.length !== REQUIRED_COUNT || isConfirming || !stage1Done}
                onClick={() => void handleConfirm()}
                className="shrink-0"
              >
                {isConfirming ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirming…</>
                ) : (
                  `Confirm & Continue to Step 3`
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/projects/steps/select-personas-step.tsx
git commit -m "feat(web): add SelectPersonasStep orchestrator component"
```

---

## Task 16: Wire SelectPersonasStep into pipeline-view.tsx

**Files:**
- Modify: `apps/web/src/components/projects/pipeline-view.tsx`

**Step 1: Import the new component**

Add at the top:

```ts
import { SelectPersonasStep } from "./steps/select-personas-step";
```

**Step 2: Replace case 2 with the new component**

Remove the entire `case 2:` block (lines ~101–135) and replace with:

```tsx
case 2: {
  const s2Stage = stageMap[2];
  const s2Status = s2Stage?.status ?? "pending";
  return (
    <SelectPersonasStep
      projectId={project.id}
      stage1Status={stageMap[1]?.status ?? "pending"}
      stage2Status={s2Status}
      projectPersonas={personas}
    />
  );
}
```

**Step 3: Remove now-unused imports**

Remove `PersonaSelector` import if it's only used in case 2. Check if it's used elsewhere first.

**Step 4: Typecheck**

```bash
pnpm typecheck
```

**Step 5: Commit**

```bash
git add apps/web/src/components/projects/pipeline-view.tsx
git commit -m "feat(web): wire SelectPersonasStep into pipeline-view case 2"
```

---

## Task 17: End-to-end smoke test

**Step 1: Start dev servers**

```bash
pnpm dev
```

**Step 2: Test auto-dispatch**

1. Log in, open a project that has Step 1 completed
2. Navigate to Step 2 (click in step nav or use `?step=2`)
3. Verify: streaming panel appears immediately without clicking anything
4. Wait for completion — personas should appear in the AI Suggestions panel

**Step 3: Test custom persona**

1. In the Customize Persona panel, type `Warren Buffett`
2. Click Generate Persona
3. Verify: streaming panel appears, persona card appears after completion
4. Click View — right-side Sheet drawer opens with full system prompt

**Step 4: Test library search**

1. After personas have been generated, navigate to another project → Step 2
2. The Persona Library panel should show personas from the first project
3. Search for a name — filter works
4. Switch category tabs — filter works

**Step 5: Test selection and confirmation**

1. Select 5 personas from any combination of panels
2. Sticky bar shows `5 / 5 selected`
3. Click Confirm & Continue
4. Verify redirects to Step 3

**Step 6: Typecheck one last time**

```bash
pnpm typecheck
```

---

## Summary of files created / modified

| File | Action |
|------|--------|
| `packages/db/src/schema/personas.ts` | Modified — nullable projectId, add tags |
| `packages/db/drizzle/` | Migration generated + applied |
| `packages/core/src/prompts/personas.ts` | Modified — tags in suggestions, new custom persona prompts |
| `apps/worker/src/jobs/handlers/suggest-personas.ts` | Modified — streaming + tags |
| `apps/worker/src/jobs/handlers/generate-custom-persona.ts` | Created |
| `apps/worker/src/jobs/runner.ts` | Modified — onChunk for step 2, custom_persona job type |
| `apps/worker/src/routes/personas.ts` | Created |
| `apps/worker/src/index.ts` | Modified — register /personas route |
| `apps/web/src/app/api/personas/route.ts` | Created — GET global search |
| `apps/web/src/app/api/personas/[id]/route.ts` | Created — GET by id |
| `apps/web/src/app/api/projects/[id]/personas/generate/route.ts` | Created — POST dispatch |
| `apps/web/src/lib/worker-client.ts` | Modified — add generatePersona |
| `apps/web/src/components/ui/tabs.tsx` | Created — install shadcn tabs |
| `apps/web/src/components/personas/persona-card-v2.tsx` | Created |
| `apps/web/src/components/personas/persona-drawer.tsx` | Created |
| `apps/web/src/components/personas/custom-persona-panel.tsx` | Created |
| `apps/web/src/components/personas/persona-library-panel.tsx` | Created |
| `apps/web/src/components/personas/ai-suggestions-panel.tsx` | Created |
| `apps/web/src/components/projects/steps/select-personas-step.tsx` | Created |
| `apps/web/src/components/projects/pipeline-view.tsx` | Modified — case 2 replaced |
