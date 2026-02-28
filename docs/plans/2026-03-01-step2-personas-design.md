# Step 2 — Select Personas: Redesign

**Date:** 2026-03-01
**Status:** Approved

---

## Overview

Replace the current minimal Step 2 (a single "Suggest Expert Personas" trigger button) with a rich, three-panel persona selection experience:

1. **Customize Persona** — generate a named persona from a LinkedIn URL or person name
2. **Persona Library** — browse and search the global shared library of all personas in the system
3. **AI-Tailored Suggestions** — auto-generated tailored personas that fire on page load

---

## Layout

```
┌─────────────────────────────────────────────┐
│  1. CUSTOMIZE PERSONA  (custom / LinkedIn)  │
├─────────────────────────────────────────────┤
│  2. PERSONA LIBRARY  (global search/browse) │
├─────────────────────────────────────────────┤
│  3. AI-TAILORED SUGGESTIONS  (auto-runs)    │
└─────────────────────────────────────────────┘
         ↕  Confirm 5 Selected  (sticky bottom)
```

---

## Section 1 — Customize Persona

- **LinkedIn URL or person name** text input (e.g. `https://linkedin.com/in/satya-nadella` or `Ray Dalio`)
- Optional **context textarea** for extra hints
- **Generate button** → dispatches new worker job `generate-custom-persona`
- While generating: inline streaming panel (reuses `StepTriggerOutput` pattern)
- On completion: new persona card appears with "Select" pre-toggled for this project

---

## Section 2 — Persona Library

- **Search bar** — full-text search across `name` + `description`
- **Category tab filter** — Technology, Finance, Healthcare, Strategy, Legal, Operations, Other
- **Card grid** (3 columns) of all global personas (`projectId IS NULL`) + project personas from all projects
- Each card: **Name** (bold), **Role** subtitle, faded `description` (line-clamp-2)
- **Two card buttons**: `Select` (toggle into current selection) | `View` (opens right Drawer)
- **View Drawer** (right side): full persona details, full `systemPrompt` rendered as markdown, Select/Deselect button

---

## Section 3 — AI-Tailored Suggestions

- **Auto-dispatches** Step 2 job when:
  - Stage 1 status = `"completed"`
  - Stage 2 status = `"pending"` (never run)
  - No personas exist for this project yet
- Shows `StepTriggerOutput` streaming panel during generation
- After completion: same card grid layout as Section 2, pre-filtered to this project's personas
- **"Generate More" button** re-runs with a fresh prompt
- **"Add Prompt" button** opens a small textarea to guide regeneration with custom instructions

---

## Selection & Confirmation

- Selection state is unified across all three sections
- Badge counter: `3 / 5 selected`
- Confirm button: `Confirm & Continue to Step 3` — disabled until exactly 5 selected
- On confirm: PATCH `isSelected + selectionOrder`, advance stage to `awaiting_human` → `completed`, router.refresh()

---

## Database Changes

### 1. `personas` table — make `projectId` nullable

```sql
ALTER TABLE personas ALTER COLUMN project_id DROP NOT NULL;
```

Global library personas have `project_id = NULL`. Project-specific AI-generated personas have `project_id = {uuid}`.

### 2. Add `tags` column to `personas`

```sql
ALTER TABLE personas ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
```

Used for category filtering in the library. Values: `"Technology"`, `"Finance"`, `"Healthcare"`, `"Strategy"`, `"Legal"`, `"Operations"`, `"Other"`.

---

## New Worker Job — `generate-custom-persona`

**File:** `apps/worker/src/jobs/handlers/generate-custom-persona.ts`

**Input:** `{ name: string, linkedinUrl?: string, context?: string, projectId: string, userId: string }`

**Logic:**
1. Call Claude with a prompt asking it to generate a realistic named persona
2. Format: `"Ray Dalio (Macro Investor, Bridgewater)"` — real name + role + org
3. Full `.md`-style system prompt based on their known public profile
4. Save to `personas` table with `projectId`, `sourceUrls: [linkedinUrl]`, appropriate `tags`
5. Write audit log
6. Return persona id in job result

**New worker route:** `POST /generate-custom-persona` in `apps/worker/src/routes/stages.ts` (or a new `personas.ts` route)

---

## New Web API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/personas` | GET | Search global persona library (`q`, `tags`, `limit`, `offset`) |
| `POST /api/projects/:id/personas/generate` | POST | Dispatch `generate-custom-persona` job, returns `jobId` |

---

## Frontend Components

### New file: `components/projects/steps/select-personas-step.tsx`

Extracted from inline `case 2:` in `pipeline-view.tsx`. Contains:

- `SelectPersonasStep` — main component
- `CustomPersonaPanel` — section 1
- `PersonaLibraryPanel` — section 2 (fetches `GET /api/personas`)
- `AISuggestionsPanel` — section 3 (auto-dispatches, shows streaming)
- `PersonaDrawer` — right-side Drawer with full persona details
- `PersonaCardV2` — updated card with Select + View buttons (no click-to-select on whole card)

### Modified: `pipeline-view.tsx`

`case 2:` replaced with `<SelectPersonasStep ... />`.

### Modified: `persona-selector.tsx` + `persona-card.tsx`

Either updated in place or superseded by the new `SelectPersonasStep` component.

---

## Streaming for Custom Persona Generation

The `generate-custom-persona` handler uses `claude.stream()` with `onChunk` callback (same pattern as Step 1's `generate-master-prompt`). The runner thread passes `onChunk` to accumulate `job.partialOutput`.

---

## Auto-Dispatch Logic

In `SelectPersonasStep`, a `useEffect` fires once on mount:

```ts
useEffect(() => {
  if (stage1Done && stage2Pending && projectPersonas.length === 0) {
    void step2Trigger.handleRun();
  }
}, []);
```

This calls the existing `/api/projects/:id/stages/2/run` endpoint — no new dispatch path needed.

---

## Out of Scope (for this phase)

- Actual LinkedIn scraping (Claude generates based on public knowledge only)
- Promoting project personas to the global library (future feature)
- Per-user persona ownership/privacy
