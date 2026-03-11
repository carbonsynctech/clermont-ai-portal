# Step 7 Preview Incident Log (Step 5 Parity + Pagination)

Date: 2026-03-01  
Project: Clermont AI Portal  
Area: Step 7 Styled Document Preview

## Goal
Step 7 must display all and only Step 5 synthesis content, with no hidden text, no extra injected text, no boilerplate headers, and stable two-column pagination without clipping.

## Reported Symptoms
- Missing text / clipped text near bottom of pages.
- Large empty bottom-right whitespace on some pages.
- Extra text shown in Step 7 that user says is not in Step 5.
- Boilerplate still visible:
  - Strategic Briefing for Decision Makers
  - Prepared by the Global Games Research & Strategy Practice
- Unexpected line breaks / paragraph chunking that looks random.

## Files Touched During Investigation
- apps/web/src/components/projects/pipeline-view.tsx
- apps/web/src/components/projects/steps/style-edit-step.tsx
- apps/web/src/components/projects/steps/document-pages.ts
- apps/web/src/components/projects/steps/document-template.ts
- apps/web/src/components/projects/steps/styled-document-preview.tsx
- packages/core/src/prompts/style.ts
- apps/worker/src/jobs/handlers/style-edit.ts

## Attempt Timeline (What Was Tried)

### 1) Version selection fix
- Change: switched version lookup from first-match behavior to latest version behavior.
- Files: pipeline-view.tsx
- Intended effect: ensure Step 7/9 show latest generated content.
- Outcome: fixed stale version selection issue, but pagination/content integrity issues persisted.

### 2) Heading-aware pagination + section starts
- Change: reworked content pagination into section-based pages with heading handling and centered section title on first page of section.
- Files: document-pages.ts, document-template.ts
- Intended effect: remove orphan headings and improve continuity.
- Outcome: improved structure, but clipping and fill trade-offs remained.

### 3) XML parser hardening for Step 7 output
- Change: made style response parser more defensive for edited draft extraction.
- Files: packages/core/src/prompts/style.ts
- Intended effect: prevent rules/metadata leakage into content.
- Outcome: reduced one class of contamination, but previously saved content and preview-layer artifacts still surfaced.

### 4) Worker-side rules-blob fallback
- Change: detect style-rules-only output and fallback to synthesis content.
- Files: apps/worker/src/jobs/handlers/style-edit.ts
- Intended effect: avoid storing malformed styled content.
- Outcome: helped on new runs; did not fully resolve already-stored or preview-transformed artifacts.

### 5) Preview sanitization additions
- Change: added stripping for rules blocks, boilerplate blocks, and various noise lines.
- Files: document-pages.ts
- Intended effect: remove non-document text at render time.
- Outcome: partial; specific boilerplate lines still reported as visible in some flows.

### 6) CSS column/overflow experiments
- Changes attempted:
  - column-fill balance vs auto
  - overflow hidden vs visible
  - content area height constraints
  - break-inside avoid/auto adjustments
- Files: document-template.ts
- Intended effect: avoid clipping and avoid blank corner.
- Outcome: each setting fixed one side effect while causing another (cutoff, pseudo 3rd-column spill, or underfill).

### 7) Character-budget pagination tuning
- Change: tuned char/line budgets and backfill thresholds repeatedly.
- Files: document-pages.ts
- Intended effect: keep two columns full but avoid clipping.
- Outcome: unstable due mismatch between estimated vs rendered height.

### 8) Paragraph splitting into atomic blocks
- Change: split long paragraph HTML into smaller chunks (sentence/clause-based).
- Files: document-pages.ts
- Intended effect: fill leftover space and reduce bottom-right gaps.
- Outcome: improved fill opportunity but introduced visible line fragmentation and still did not guarantee perfect continuity.

### 9) Adaptive overflow safety loop
- Change: detect runtime overflow in preview and rebuild with stricter safety levels.
- Files: styled-document-preview.tsx, document-pages.ts
- Intended effect: guarantee no hidden text.
- Outcome: reduced clipping risk but increased page-break variability and did not satisfy strict visual expectations.

### 10) Step 7 source precedence changed to Step 5-first
- Change: Step 7 source set to synthesis-first fallback instead of styled-first.
- Files: style-edit-step.tsx
- Intended effect: show Step 5 canonical content in Step 7.
- Outcome: logic updated, but user still reported mismatch/extra text in display.

### 11) Explicit synthesis boilerplate stripping
- Change: added exact pattern stripping for known lines and Document Note block.
- Files: document-pages.ts
- Intended effect: remove specified synthesis boilerplate from preview.
- Outcome: user still reported visibility in some cases.

## Why This Has Been Hard
- Multiple competing constraints conflict:
  1. Never clip text,
  2. Never leave large bottom-right whitespace,
  3. Keep strict two-column layout,
  4. Preserve exact Step 5 order/content,
  5. Avoid visual fragmentation.
- Heuristic pagination cannot perfectly predict browser column layout from plain text estimates.
- Preview sanitization + dynamic chunking can alter apparent flow even when source text is preserved.
- Session-level display mutation and cache/state behavior can make old content appear despite source changes.

## Current Known Risk Areas
- Heuristic line-estimation in document-pages.ts can diverge from actual browser rendering.
- Chunk-splitting can create unexpected visual line breaks.
- Boilerplate stripping may miss variants due punctuation/spacing differences.
- Session persistence in Step 7 (style-edit-content-*) can keep prior rendered state.

## What Was Requested Most Recently
- Create a written log of issues and failed attempts (this document).

## Recommended Clean Reset (Next Action Plan)
1. Freeze Step 7 preview to literal Step 5 text path only (no styled fallback, no chat-applied local mutation).
2. Temporarily disable paragraph chunk splitting and adaptive safety loop.
3. Implement deterministic pagination from rendered measurement (DOM measure-and-fit per block), not heuristic estimates.
4. Add an explicit pre-render source snapshot panel for debugging:
   - raw Step 5 text length,
   - sanitized text length,
   - first/last 200 chars.
5. Add strict boilerplate denylist with normalization pass (case, punctuation, repeated spaces).
6. Clear session keys when source hash changes, not only version id.

## Notes
This log is a technical incident/history document only. It does not claim final resolution.
