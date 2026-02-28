# Step 13 Export UI – Design Doc

**Date:** 2026-03-01

## Overview

Replace the plain Step 13 card with the same two-column layout used in Step 12 (IntegrateCritiquesStep): document preview on the left, sticky control panel on the right.

## Layout

```
grid gap-4 lg:grid-cols-[1fr_360px]
├── left:  StyledDocumentPreview (final version content)
└── right: sticky panel (360px)
           ├── [FileOutput] Export Ready — V7
           ├── badge: X words
           ├── StepTriggerButton "Regenerate HTML Export"
           ├── StepTriggerOutput
           └── Export section (4 buttons)
               ├── Download HTML   → <a href="/api/projects/[id]/export?format=html">
               ├── Download PDF    → <a href="/api/projects/[id]/export"> (existing)
               ├── Download DOCX   → <a href="/api/projects/[id]/export?format=docx">
               └── Download Markdown → <a href="/api/projects/[id]/export?format=md">
```

When no `exported_html` version exists yet, fall back to the existing plain trigger card.

## New Component

`apps/web/src/components/projects/steps/export-step.tsx`

Props mirror IntegrateCritiquesStep:
- `projectId`, `projectTitle`, `companyName?`, `dealType?`, `coverImageUrl?`
- `finalVersion?: Version` — the `final` versionType (content source for preview + MD/DOCX)
- `exportedHtmlVersion?: Version` — the `exported_html` versionType (gating whether export buttons show)
- `stage12Status`, `stage13Status`
- `onRunningChange?: (running: boolean) => void`

## API Routes

All under `GET /api/projects/[id]/export`:

| format param | Source | Response |
|---|---|---|
| _(none)_ | Worker Puppeteer (existing) | `application/pdf` |
| `html` | `exported_html` version content from DB | `text/html`, `attachment; filename="memo-<id>.html"` |
| `md` | `final` version content from DB | `text/markdown`, `attachment; filename="memo-<id>.md"` |
| `docx` | `final` version content → convert with `docx` npm pkg | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

DOCX conversion: parse markdown into paragraphs/headings using the `docx` package. Headings (`# ## ###`) → Heading1/2/3 styles. Bold/italic inline. Bullet lists. No AI call — pure Node.js.

## Files Changed

1. `apps/web/src/app/api/projects/[id]/export/route.ts` — add `format` query param handling
2. `apps/web/src/components/projects/steps/export-step.tsx` — new component
3. `apps/web/src/components/projects/pipeline-view.tsx` — wire case 13 to ExportStep
4. `apps/worker/` — no changes needed

## Dependencies

- `docx` npm package — install in `apps/web`
