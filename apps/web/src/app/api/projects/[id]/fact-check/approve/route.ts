import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, versions, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface FindingRecord {
  id: string;
  issue: string;
  incorrectText?: string | null;
  correctedText?: string | null;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function isFindingRecordArray(value: unknown): value is FindingRecord[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return typeof record.id === "string" && typeof record.issue === "string";
  });
}

function applyAcceptedCorrections(content: string, findings: FindingRecord[]): {
  revisedContent: string;
  appliedCount: number;
} {
  let revisedContent = content;
  let appliedCount = 0;

  for (const finding of findings) {
    const incorrectText = typeof finding.incorrectText === "string" ? finding.incorrectText.trim() : "";
    const correctedText = typeof finding.correctedText === "string" ? finding.correctedText.trim() : "";
    if (!incorrectText || !correctedText) continue;

    if (revisedContent.includes(incorrectText)) {
      revisedContent = revisedContent.replace(incorrectText, correctedText);
      appliedCount += 1;
    }
  }

  return { revisedContent, appliedCount };
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
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    baseContent?: unknown;
    findingIds?: unknown;
  };
  const baseContent = typeof body.baseContent === "string" ? body.baseContent : null;
  const findingIds = Array.isArray(body.findingIds)
    ? body.findingIds.filter((findingId): findingId is string => typeof findingId === "string")
    : [];

  const stage8 = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)),
  });
  const rawFindings = stage8?.metadata?.factCheckFindings;
  const allFindings = isFindingRecordArray(rawFindings) ? rawFindings : [];
  const selectedFindingSet = new Set(findingIds);
  const selectedFindings = allFindings.filter((finding) => selectedFindingSet.has(finding.id));
  const issuesApproved = selectedFindings.map((finding) => finding.issue);

  const latestFactChecked = await db.query.versions.findFirst({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "fact_checked")),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!latestFactChecked) {
    return NextResponse.json({ error: "Fact-checked version not found" }, { status: 404 });
  }

  const startingContent = baseContent ?? latestFactChecked.content;
  const { revisedContent, appliedCount } = applyAcceptedCorrections(startingContent, selectedFindings);

  let finalFactCheckedVersionId = latestFactChecked.id;
  if (revisedContent !== latestFactChecked.content) {
    const [newVersion] = await db
      .insert(versions)
      .values({
        projectId,
        parentVersionId: latestFactChecked.id,
        producedByStep: 8,
        versionType: "fact_checked",
        internalLabel: `Fact-Checked V3 (Approved ${appliedCount} correction${appliedCount === 1 ? "" : "s"})`,
        content: revisedContent,
        wordCount: countWords(revisedContent),
        isClientVisible: false,
      })
      .returning();

    if (!newVersion) {
      return NextResponse.json({ error: "Failed to save revised fact-checked version" }, { status: 500 });
    }
    finalFactCheckedVersionId = newVersion.id;
  }

  await db
    .update(projects)
    .set({ activeVersionId: finalFactCheckedVersionId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...(stage8?.metadata ?? {}),
        factCheckApprovedFindingIds: findingIds,
        factCheckApprovedIssues: issuesApproved,
        factCheckAppliedCorrections: appliedCount,
        factCheckRevisedVersionId: finalFactCheckedVersionId,
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "stage_completed",
    stepNumber: 8,
    payload: {
      event: "fact_check_approved",
      issuesApproved,
      findingIds,
      count: issuesApproved.length,
      appliedCorrections: appliedCount,
    },
  });

  await db
    .update(projects)
    .set({ currentStage: 9, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({
    ok: true,
    revisedContent,
    appliedCorrections: appliedCount,
  });
}
