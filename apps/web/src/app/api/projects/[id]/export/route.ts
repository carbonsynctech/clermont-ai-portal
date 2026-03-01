import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { auditLogs, projects, stages, versions } from "@repo/db";
import { buildExportHtmlDocument } from "@repo/core";
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
  const userId = user.id;

  const { id: projectId } = await params;
  const format = req.nextUrl.searchParams.get("format");

  // Ownership check
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

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

  const title = project.title || `memo-${projectId}`;
  const htmlDocument = buildExportHtmlDocument(finalVersion.content, title);

  async function markStep13Completed(exportFormat: "html" | "pdf" | "docx" | "md") {
    const now = new Date();

    await db
      .update(stages)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
        errorMessage: null,
      })
      .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 13)));

    await db
      .update(projects)
      .set({ status: "completed", currentStage: 13, updatedAt: now })
      .where(eq(projects.id, projectId));

    await db.insert(auditLogs).values({
      projectId,
      userId,
      action: "export_requested",
      stepNumber: 13,
      payload: { format: exportFormat },
    });
  }

  // HTML export — generate from final markdown
  if (format === "html") {
    await markStep13Completed("html");

    return new NextResponse(htmlDocument, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="memo-${projectId}.html"`,
      },
    });
  }

  // Markdown export — serve final version content (already markdown)
  if (format === "md") {
    await markStep13Completed("md");

    return new NextResponse(finalVersion.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="memo-${projectId}.md"`,
      },
    });
  }

  // DOCX export — convert final markdown to DOCX
  if (format === "docx") {
    const doc = markdownToDocx(finalVersion.content);
    const buffer = await Packer.toBuffer(doc);
    await markStep13Completed("docx");

    return new NextResponse(new Uint8Array(buffer), {
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

  const workerRes = await fetch(`${workerUrl}/export/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({ projectId, html: htmlDocument }),
  });

  if (!workerRes.ok) {
    const text = await workerRes.text();
    return NextResponse.json(
      { error: `Export failed: ${text}` },
      { status: workerRes.status }
    );
  }

  const pdfBuffer = await workerRes.arrayBuffer();
  await markStep13Completed("pdf");

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="memo-${projectId}.pdf"`,
    },
  });
}
