# Architecture – Clermont AI Portal

C4 model diagrams for the investment memo automation platform.

## C1 – System Context

Who interacts with the portal and what external systems it depends on.

```mermaid
graph LR
    Analyst([Investment Analyst])
    Portal[Clermont AI Portal]
    Claude[Claude API]
    Gemini[Gemini API]
    Supabase[(Supabase PostgreSQL)]

    Analyst -->|creates briefs,<br>reviews memos| Portal
    Portal -->|steps 1-7, 9, 11-13| Claude
    Portal -->|step 8 fact-check| Gemini
    Portal -->|auth, storage,<br>RLS queries| Supabase
```

## C2 – Container

How the monorepo packages map to deployable units and shared libraries.

```mermaid
graph TD
    subgraph Vercel
        Web[apps/web<br>Next.js 16 App Router]
    end

    subgraph Railway
        Worker[apps/worker<br>Hono HTTP Server]
    end

    subgraph Shared Packages
        Core[packages/core<br>AI clients, prompts, types]
        DB[packages/db<br>Drizzle ORM schema]
    end

    subgraph External
        Claude[Claude API]
        Gemini[Gemini API]
        Supabase[(Supabase PostgreSQL)]
    end

    Web -->|POST /stages/:id/run<br>fire-and-forget| Worker
    Web -->|anon key, RLS| Supabase
    Worker -->|service role key| Supabase
    Worker --> Claude
    Worker --> Gemini
    Web --> Core
    Web --> DB
    Worker --> Core
    Worker --> DB
```

## C3 – Component: Worker

The worker receives stage-run requests, queues jobs, and delegates to step-specific handlers.

```mermaid
graph TD
    subgraph Routes
        StagesRoute[stages.ts<br>POST /stages/:id/run]
        JobsRoute[jobs.ts<br>GET /jobs/:id]
        ExportRoute[export.ts<br>GET /export/:id/pdf]
        HealthRoute[health.ts<br>GET /health]
    end

    subgraph Job Runner
        Queue[Job Queue]
        Runner[Runner Loop]
    end

    subgraph Handlers
        H1[generate-master-prompt]
        H2[suggest-personas]
        H3[extract-and-chunk]
        H4[generate-persona-drafts]
        H5[synthesize]
        H6[style-edit]
        H7[fact-check]
        H8[final-style-pass]
        H9[devils-advocate]
        H10[integrate-critiques]
        H11[export-html]
    end

    subgraph packages/core
        ClaudeClient[Claude Client]
        GeminiClient[Gemini Client]
        Prompts[Prompt Templates]
        TokenBudget[Token Budget]
    end

    StagesRoute --> Queue
    Queue --> Runner
    Runner --> H1 & H2 & H3 & H4 & H5 & H6 & H7 & H8 & H9 & H10 & H11
    H1 & H2 & H4 & H5 & H6 & H8 & H9 & H10 --> ClaudeClient
    H7 --> GeminiClient
    H1 & H2 & H4 & H5 & H6 & H7 & H8 & H9 & H10 --> Prompts
    H3 & H4 & H5 --> TokenBudget
```

## C3 – Component: Web

The Next.js app organizes pages, API routes, and UI component groups.

```mermaid
graph TD
    subgraph Pages
        Dashboard[dashboard/]
        ProjectList[projects/]
        Pipeline[projects/id/ – pipeline view]
        AuditLog[projects/id/audit/]
    end

    subgraph API Routes
        Materials[api/materials]
        Personas[api/personas]
        Stages[api/stages]
        StyleGuide[api/style-guide]
        Versions[api/versions]
        Review[api/review]
        Critiques[api/critiques]
        Export[api/export]
    end

    subgraph Components
        Brief[brief/ – BriefWizard]
        Layout[layout/ – Sidebar, Header]
        PersonaUI[personas/ – Cards, Selector]
        ProjectUI[projects/ – Pipeline, StepTrigger]
        ReviewUI[review/ – InlineEditor, CritiqueSelector]
        SourceUI[sources/ – MaterialUpload]
        VersionUI[versions/ – Diff, Viewer]
    end

    WorkerClient[workerClient.runStage]

    Pages --> API Routes
    Pages --> Components
    Stages -->|fire-and-forget| WorkerClient
    Export -->|proxy| WorkerClient
