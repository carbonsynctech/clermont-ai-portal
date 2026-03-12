# Clermont AI Portal

AI-powered investment memo creation portal for analysts. Automates a 13-step Standard Operating Procedure (SOP) using Claude (primary author) and Gemini (fact-checker), turning a brief and source documents into a polished, export-ready investment memo.

## Architecture

```mermaid
graph TD
    subgraph Vercel
        Web[apps/web – Next.js 16]
    end
    subgraph Railway
        Worker[apps/worker – Hono]
    end
    subgraph Shared
        Core[packages/core]
        DB[packages/db]
    end
    Web -->|fire-and-forget| Worker
    Worker --> Claude[Claude API]
    Worker --> Gemini[Gemini API]
    Web & Worker --> DB
    DB --> Supabase[(Supabase)]
```

See [`docs/architecture.md`](docs/architecture.md) for full C4 diagrams (context, container, component).

## Tech Stack

| Package | Framework | Deploy | Purpose |
|---------|-----------|--------|---------|
| `apps/web` | Next.js 16 (App Router) | Vercel | Frontend, API routes, auth |
| `apps/worker` | Hono | Railway | Long-running AI jobs |
| `packages/db` | Drizzle ORM | – | Schema, migrations, Supabase client |
| `packages/core` | – | – | Claude/Gemini clients, prompts, types |

## Prerequisites

- Node.js 22+
- pnpm 10+
- Supabase project (PostgreSQL + Auth)
- Anthropic API key (Claude)
- Google Gemini API key

## Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url> && cd clermont-ai-portal
   pnpm install
   ```
2. Configure environment variables:
   - Copy `.env.example` → `.env.local` (root) and fill in values
   - Copy `.env.example` → `apps/web/.env.local` (Next.js needs its own copy of `DATABASE_URL`)
3. Run database migrations:
   ```bash
   pnpm db:migrate
   ```
4. Apply RLS policies in Supabase SQL Editor: `docs/sql/rls-policies.sql`
5. Start development:
   ```bash
   pnpm dev
   ```

## Commands

```bash
pnpm dev          # Start web (3000) + worker (3001)
pnpm build        # Build all apps
pnpm typecheck    # TypeScript check all packages
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Apply migrations to Supabase
pnpm db:studio    # Open Drizzle Studio (DB browser)
```

## Project Structure

```
clermont-ai-portal/
├── apps/
│   ├── web/                 # Next.js frontend + API routes
│   └── worker/              # Hono background job server
├── packages/
│   ├── core/                # AI clients, prompts, pipeline types
│   └── db/                  # Drizzle schema + Supabase client
├── docs/
│   ├── architecture.md      # C4 diagrams (Mermaid)
│   ├── proposal.pdf         # Original client proposal
│   ├── sync-notes.pdf       # Meeting decisions
│   └── sql/                 # RLS policies
└── CLAUDE.md                # AI coding conventions
```

## 13-Step Pipeline

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

## Further Reading

- [`CLAUDE.md`](CLAUDE.md) – coding conventions, architecture rules, pitfalls
- [`docs/architecture.md`](docs/architecture.md) – full C4 architecture diagrams
