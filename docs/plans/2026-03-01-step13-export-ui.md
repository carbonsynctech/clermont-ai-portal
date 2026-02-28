# Step 13 Export UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plain Step 13 card with a two-column layout (document preview left, sticky export panel right) matching Step 12's design, and add HTML/DOCX/MD download routes alongside the existing PDF route.

**Architecture:** New `ExportStep` component mirrors `IntegrateCritiquesStep` — `StyledDocumentPreview` on the left, sticky 360px panel on the right with re-run button and 4 export format buttons. The existing `/api/projects/[id]/export` route gains a `format` query param (`html`, `md`, `docx`); the existing no-param behaviour (PDF via worker) is unchanged. DOCX conversion is pure Node.js using the `docx` npm package — no AI, no worker.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `docx` npm package, shadcn/ui, Lucide icons, Tailwind v4.

---

### Task 1: Install `docx` package

**Files:**
- Modify: `apps/web/package.json` (via pnpm)

**Step 1: Install the package**

```bash
cd apps/web && pnpm add docx
```

**Step 2: Verify it resolves**

```bash
cd ../.. && pnpm typecheck 2>&1 | head -20
```
Expected: no new errors (docx ships its own types).

**Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add docx package for DOCX export"
```

---

### Task 2: Extend the export API route

**Files:**
- Modify: `apps/web/src/app/api/projects/[id]/export/route.ts`

**Context:** Current file is ~61 lines. It only handles PDF (no query param). We need to add `format=html`, `format=md`, and `format=docx` branches before the existing PDF proxy. The `final` version has `versionType = "final"` and its `content` field is markdown. The `exported_html` version has `versionType = "exported_html"`.

**Step 1: Read the current file**

Read `apps/web/src/app/api/projects/[id]/export/route.ts` (already done in planning — 61 lines).

**Step 2: Replace the file with the extended version**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, versions } from "@repo/db";
import { eq, and } from "drizzle-orm";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
} from "docx";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function markdownToDocx(markdown: string): Document {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
        })
      );
    } else if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
        })
      );
    } else if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_1,
        })
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2),
          bullet: { level: 0 },
        })
      );
    } else if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "" }));
    } else {
      // Handle bold (**text**) and italic (*text*) inline
      const runs: TextRun[] = [];
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
        } else if (part.startsWith("*") && part.endsWith("*")) {
          runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
        } else {
          runs.push(new TextRun({ text: part }));
        }
      }
      paragraphs.push(
        new Paragraph({
          children: runs,
          alignment: AlignmentType.LEFT,
        })
      );
    }
  }

  return new Document({ sections: [{ children: paragraphs }] });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const format = req.nextUrl.searchParams.get("format");

  // Ownership check
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // HTML export — serve exported_html version content
  if (format === "html") {
    const htmlVersion = await db.query.versions.findFirst({
      where: and(
        eq(versions.projectId, projectId),
        eq(versions.versionType, "exported_html")
      ),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
    });

    if (!htmlVersion) {
      return NextResponse.json(
        { error: "HTML export not yet generated. Run Step 13 first." },
        { status: 404 }
      );
    }

    return new NextResponse(htmlVersion.content, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="memo-${projectId}.html"`,
      },
    });
  }

  // Markdown export — serve final version content (already markdown)
  if (format === "md") {
    const finalVersion = await db.query.versions.findFirst({
      where: and(
        eq(versions.projectId, projectId),
        eq(versions.versionType, "final")
      ),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
    });

    if (!finalVersion) {
      return NextResponse.json(
        { error: "No final version found." },
        { status: 404 }
      );
    }

    return new NextResponse(finalVersion.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="memo-${projectId}.md"`,
      },
    });
  }

  // DOCX export — convert final markdown to DOCX
  if (format === "docx") {
    const finalVersion = await db.query.versions.findFirst({
      where: and(
        eq(versions.projectId, projectId),
        eq(versions.versionType, "final")
      ),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
    });

    if (!finalVersion) {
      return NextResponse.json(
        { error: "No final version found." },
        { status: 404 }
      );
    }

    const doc = markdownToDocx(finalVersion.content);
    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="memo-${projectId}.docx"`,
      },
    });
  }

  // Default: PDF via worker proxy (existing behaviour)
  const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:3001";
  const workerSecret = process.env["WORKER_SECRET"] ?? "";

  const workerRes = await fetch(
    `${workerUrl}/export/pdf?projectId=${encodeURIComponent(projectId)}`,
    {
      headers: {
        "x-worker-secret": workerSecret,
      },
    }
  );

  if (!workerRes.ok) {
    const text = await workerRes.text();
    return NextResponse.json(
      { error: `Export failed: ${text}` },
      { status: workerRes.status }
    );
  }

  const pdfBuffer = await workerRes.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="memo-${projectId}.pdf"`,
    },
  });
}
```

**Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "error|warning" | head -20
```
Expected: no errors in the export route file.

**Step 4: Commit**

```bash
git add apps/web/src/app/api/projects/[id]/export/route.ts
git commit -m "feat(web): add html/md/docx export format routes"
```

---

### Task 3: Create ExportStep component

**Files:**
- Create: `apps/web/src/components/projects/steps/export-step.tsx`

**Context:** Mirrors `integrate-critiques-step.tsx` exactly. When `exportedHtmlVersion` is falsy, render the plain trigger card (same as current Step 13 fallback). When it exists, render the two-column layout. The left panel shows `StyledDocumentPreview` using `finalVersion.content` (the markdown final version — same source used for DOCX/MD). The right panel has: header with `FileOutput` icon + "Export Ready — V7", word count badge from `finalVersion`, re-run `StepTriggerButton`, `StepTriggerOutput`, a separator, then 4 export `<a>` buttons.

**Step 1: Write the component**

```typescript
"use client";

import { useEffect } from "react";
import { FileOutput, Code2, FileDown, FileText, FileCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  StepTriggerButton,
  StepTriggerOutput,
  useStepTrigger,
} from "@/components/projects/step-trigger";
import { StyledDocumentPreview } from "./styled-document-preview";
import type { Version } from "@repo/db";

interface ExportStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  finalVersion?: Version;
  exportedHtmlVersion?: Version;
  stage12Status: string;
  stage13Status: string;
  onRunningChange?: (running: boolean) => void;
}

export function ExportStep({
  projectId,
  projectTitle,
  companyName,
  dealType,
  coverImageUrl,
  finalVersion,
  exportedHtmlVersion,
  stage12Status,
  stage13Status,
  onRunningChange,
}: ExportStepProps) {
  const canRun = stage12Status === "completed";
  const trigger = useStepTrigger(projectId, 13, stage13Status, canRun);

  useEffect(() => {
    onRunningChange?.(trigger.isRunning);
  }, [onRunningChange, trigger.isRunning]);

  if (!exportedHtmlVersion || !finalVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <StepTriggerButton
          trigger={trigger}
          label={
            stage13Status === "completed"
              ? "Regenerate HTML Export"
              : "Generate HTML Export"
          }
          disabled={!canRun}
          disabledReason="Complete Step 12 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border bg-card p-4">
        <StyledDocumentPreview
          content={finalVersion.content}
          projectTitle={projectTitle}
          companyName={companyName}
          dealType={dealType}
          coverImageUrl={coverImageUrl}
        />
      </div>

      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 h-fit space-y-3">
        <div className="flex items-center gap-2">
          <FileOutput className="size-4 text-primary" />
          <h3 className="font-medium text-base">Export Ready — V7</h3>
        </div>
        <Badge variant="outline">
          {finalVersion.wordCount?.toLocaleString() ?? "?"} words
        </Badge>
        <StepTriggerButton
          trigger={trigger}
          label="Regenerate HTML Export"
          disabled={!canRun}
          disabledReason="Complete Step 12 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />

        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Export
          </p>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a
                href={`/api/projects/${projectId}/export?format=html`}
                download
              >
                <Code2 className="size-4" />
                Download HTML
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a href={`/api/projects/${projectId}/export`} download>
                <FileDown className="size-4" />
                Download PDF
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a
                href={`/api/projects/${projectId}/export?format=docx`}
                download
              >
                <FileText className="size-4" />
                Download DOCX
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a
                href={`/api/projects/${projectId}/export?format=md`}
                download
              >
                <FileCode className="size-4" />
                Download Markdown
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "error" | head -20
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/projects/steps/export-step.tsx
git commit -m "feat(web): add ExportStep component with two-column layout"
```

---

### Task 4: Wire ExportStep into pipeline-view

**Files:**
- Modify: `apps/web/src/components/projects/pipeline-view.tsx`

**Context:** `case 13` currently renders an inline `<div>` with `StepTrigger` and a `Download PDF` link. Replace it with `<ExportStep>`. The `versions` array is already in scope — filter it for `versionType === "final"` and `versionType === "exported_html"`.

**Step 1: Add the import**

Add to the existing import block near `IntegrateCritiquesStep`:

```typescript
import { ExportStep } from "./steps/export-step";
```

**Step 2: Replace case 13**

Find this block in `renderStepContent()`:

```typescript
      case 13:
        const canRunStep13 = stageMap[12]?.status === "completed";
        const canTriggerStep13 = status === "completed" || canRunStep13;
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <StepTrigger
              key={`step13-${step13RunId}`}
              projectId={project.id}
              stepNumber={13}
              label={status === "completed" ? "Regenerate HTML Export" : "Generate HTML Export"}
              currentStatus={status}
              disabled={!canTriggerStep13}
              disabledReason="Complete Step 12 to run this step."
              onRunningChange={setStep13Running}
            />
            {status === "completed" && (
              <div className="flex items-center gap-3">
                <Link
                  href={`/api/projects/${project.id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Download PDF
                </Link>
              </div>
            )}
          </div>
        );
```

Replace with:

```typescript
      case 13:
        return (
          <ExportStep
            key={`step13-${step13RunId}`}
            projectId={project.id}
            projectTitle={project.title}
            companyName={brief?.companyName}
            dealType={brief?.dealType}
            coverImageUrl={coverImageUrl}
            finalVersion={versions.find((v) => v.versionType === "final")}
            exportedHtmlVersion={versions.find((v) => v.versionType === "exported_html")}
            stage12Status={stageMap[12]?.status ?? "pending"}
            stage13Status={status}
            onRunningChange={setStep13Running}
          />
        );
```

**Step 3: Remove now-unused imports**

Check if `Link` is still used elsewhere in the file (it is — in the completion banner). Leave it. The `step13RunId` state is still used as the `key` prop, so leave that too.

**Step 4: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "error" | head -20
```
Expected: no errors.

**Step 5: Commit**

```bash
git add apps/web/src/components/projects/pipeline-view.tsx
git commit -m "feat(web): wire ExportStep into pipeline-view case 13"
```

---

### Task 5: Smoke test in browser

**Steps:**

1. Start dev servers: `pnpm dev`
2. Navigate to a project at step 13
3. **Before export generated:** confirm the plain trigger card renders (no two-column layout)
4. Run Step 13 to generate the HTML export
5. After completion: confirm two-column layout appears — preview left, panel right
6. Click each download button and verify:
   - **HTML** → downloads `.html` file, opens in browser as styled document
   - **PDF** → downloads `.pdf` (existing Puppeteer behaviour)
   - **DOCX** → downloads `.docx`, opens in Word/LibreOffice with headings intact
   - **Markdown** → downloads `.md`, contains raw markdown content
7. Confirm "Regenerate HTML Export" button re-runs the step

---

## Summary of Files Changed

| File | Action |
|---|---|
| `apps/web/package.json` | Add `docx` dependency |
| `apps/web/src/app/api/projects/[id]/export/route.ts` | Add `format` query param branches |
| `apps/web/src/components/projects/steps/export-step.tsx` | New component |
| `apps/web/src/components/projects/pipeline-view.tsx` | Wire case 13 to ExportStep |
