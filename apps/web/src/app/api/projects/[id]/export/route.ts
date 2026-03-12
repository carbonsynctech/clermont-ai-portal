import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { auditLogs, projects, stages, versions } from "@repo/db";
import { eq, and } from "drizzle-orm";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
} from "docx";
import { readFileSync } from "fs";
import { join } from "path";
import { buildStyledExportHtml, buildFlowingPdfHtml } from "@/lib/export-html";

/* ------------------------------------------------------------------ */
/*  Inline external assets as base64 data URIs so Puppeteer on the    */
/*  worker has zero external network dependencies.                     */
/* ------------------------------------------------------------------ */

function guessMime(url: string): string {
  const l = url.toLowerCase();
  if (l.includes(".png")) return "image/png";
  if (l.includes(".jpg") || l.includes(".jpeg")) return "image/jpeg";
  if (l.includes(".svg")) return "image/svg+xml";
  if (l.includes(".gif")) return "image/gif";
  if (l.includes(".webp")) return "image/webp";
  if (l.includes(".ttf")) return "font/ttf";
  if (l.includes(".woff2")) return "font/woff2";
  if (l.includes(".woff")) return "font/woff";
  return "application/octet-stream";
}

async function inlineHtmlAssets(
  html: string,
  origin?: string
): Promise<string> {
  const urlSet = new Set<string>();

  // Collect src="https://..." URLs
  const srcRe = /src=(["'])(https?:\/\/[^"']+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html)) !== null) {
    if (m[2]) urlSet.add(m[2]);
  }

  // Collect url("https://...") / url('https://...') / url(https://...) URLs
  const urlFnRe = /url\((["']?)(https?:\/\/[^"')\s]+)\1\)/g;
  while ((m = urlFnRe.exec(html)) !== null) {
    if (m[2]) urlSet.add(m[2]);
  }

  if (urlSet.size === 0) return html;

  const replacements = new Map<string, string>();

  await Promise.all(
    [...urlSet].map(async (url) => {
      try {
        // Same-origin assets → read from public/ directory (no HTTP needed)
        if (origin && url.startsWith(origin + "/")) {
          const relativePath = url.slice(origin.length); // e.g. "/clermont-logo.png"
          const filePath = join(process.cwd(), "public", relativePath);
          const buf = readFileSync(filePath);
          const ct = guessMime(url);
          replacements.set(
            url,
            `data:${ct};base64,${buf.toString("base64")}`
          );
          return;
        }

        // External assets → fetch with timeout
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") || guessMime(url);
        replacements.set(url, `data:${ct};base64,${buf.toString("base64")}`);
      } catch {
        // leave original URL — Puppeteer will just skip the asset
      }
    })
  );

  for (const [url, dataUri] of replacements) {
    html = html.split(url).join(dataUri);
  }

  return html;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const runtime = "nodejs";
export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/*  Markdown → DOCX                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  GET /api/projects/[id]/export?format=html|pdf|docx|md              */
/* ------------------------------------------------------------------ */

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
  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  const coverImageUrl = req.nextUrl.searchParams.get("coverImageUrl") ?? undefined;

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

  // Build styled HTML (reuses same template as preview)
  const styledHtml = buildStyledExportHtml({
    content: finalVersion.content,
    projectTitle: title,
    companyName: project.title,
    dealType: undefined,
    coverImageUrl,
    assetBaseUrl: req.nextUrl.origin,
  });

  async function markStep12Completed(exportFormat: string) {
    const now = new Date();

    await db
      .update(stages)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
        errorMessage: null,
      })
      .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 12)));

    await db
      .update(projects)
      .set({ status: "completed", currentStage: 12, updatedAt: now })
      .where(eq(projects.id, projectId));

    await db.insert(auditLogs).values({
      projectId,
      userId,
      action: "export_requested",
      stepNumber: 12,
      payload: { format: exportFormat },
    });
  }

  /* ---------- HTML ---------- */
  if (format === "html") {
    await markStep12Completed("html");
    return new NextResponse(styledHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${title}.html"`,
      },
    });
  }

  /* ---------- Markdown ---------- */
  if (format === "md") {
    await markStep12Completed("md");
    return new NextResponse(finalVersion.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${title}.md"`,
      },
    });
  }

  /* ---------- DOCX ---------- */
  if (format === "docx") {
    const doc = markdownToDocx(finalVersion.content);
    const buffer = await Packer.toBuffer(doc);
    await markStep12Completed("docx");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${title}.docx"`,
      },
    });
  }

  /* ---------- PDF (via worker Puppeteer) ---------- */
  const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:3001";
  const workerSecret = process.env["WORKER_SECRET"] ?? "";

  try {
    // Build flowing CSS-layout HTML for PDF (no fixed-height pages = no clipping)
    const flowingPdfHtml = buildFlowingPdfHtml({
      content: finalVersion.content,
      projectTitle: title,
      companyName: project.title,
      dealType: undefined,
      coverImageUrl,
      assetBaseUrl: req.nextUrl.origin,
    });

    // Inline all external images/fonts as base64 so the worker's Puppeteer
    // doesn't need to fetch anything over the network.
    const inlinedHtml = await inlineHtmlAssets(flowingPdfHtml, req.nextUrl.origin);

    const workerRes = await fetch(`${workerUrl}/export/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({ projectId, html: inlinedHtml }),
      signal: AbortSignal.timeout(50_000), // stay under Vercel 60s limit
    });

    if (!workerRes.ok) {
      const errorBody = await workerRes.text().catch(() => "Unknown error");
      console.error("[export/pdf] Worker error:", workerRes.status, errorBody);
      return NextResponse.json(
        { error: "PDF generation failed. The worker returned an error.", detail: errorBody },
        { status: 502 }
      );
    }

    const pdfBuffer = new Uint8Array(await workerRes.arrayBuffer());
    await markStep12Completed("pdf");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${title}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[export/pdf] Worker unreachable:", err);
    return NextResponse.json(
      { error: "PDF generation failed. Could not reach the export worker." },
      { status: 502 }
    );
  }
}
