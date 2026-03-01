import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CritiqueDraftItem {
  id: number;
  title: string;
  detail: string;
  isCustom?: boolean;
}

function isValidCritiqueDraftItem(value: unknown): value is CritiqueDraftItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number"
    && Number.isFinite(record.id)
    && typeof record.title === "string"
    && record.title.trim().length > 0
    && typeof record.detail === "string"
    && record.detail.trim().length > 0
    && (record.isCustom === undefined || typeof record.isCustom === "boolean")
  );
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

  // Auth + ownership check
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    selectedCritiques?: unknown;
    critiques?: unknown;
    selectedIds?: unknown;
  };

  if (
    body.selectedCritiques !== undefined &&
    (!Array.isArray(body.selectedCritiques) ||
      !body.selectedCritiques.every((c) => typeof c === "string"))
  ) {
    return NextResponse.json(
      { error: "selectedCritiques must be an array of strings" },
      { status: 400 }
    );
  }

  if (
    body.critiques !== undefined
    && (!Array.isArray(body.critiques) || !body.critiques.every(isValidCritiqueDraftItem))
  ) {
    return NextResponse.json(
      { error: "critiques must be an array of valid critique items" },
      { status: 400 },
    );
  }

  if (
    body.selectedIds !== undefined
    && (!Array.isArray(body.selectedIds)
      || !body.selectedIds.every((id) => typeof id === "number" && Number.isFinite(id)))
  ) {
    return NextResponse.json(
      { error: "selectedIds must be an array of numbers" },
      { status: 400 },
    );
  }

  const selectedCritiques = (body.selectedCritiques as string[] | undefined) ?? [];
  const critiques = (body.critiques as CritiqueDraftItem[] | undefined) ?? [];
  const selectedIds = (body.selectedIds as number[] | undefined) ?? [];

  const stage11 = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)),
  });

  const existingMetadata =
    stage11?.metadata && typeof stage11.metadata === "object" && !Array.isArray(stage11.metadata)
      ? stage11.metadata
      : {};

  // Insert audit log with selected critiques in payload
  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "critique_selected",
    stepNumber: 11,
    payload: { selectedCritiques, count: selectedCritiques.length },
  });

  // Update stage 11 to completed
  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...existingMetadata,
        selectedCritiquesCount: selectedCritiques.length,
        devilsAdvocateDraft: {
          critiques,
          selectedIds,
          selectedCritiques,
          savedAt: new Date().toISOString(),
        },
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)));

  if (selectedCritiques.length === 0) {
    // Skip step 12 entirely when no critiques are selected
    await db
      .update(stages)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        metadata: { reviewNotes: "Skipped Step 12 because no critiques were selected." },
      })
      .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 12)));

    await db
      .update(projects)
      .set({ currentStage: 13, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ ok: true, nextStep: 13, skippedStep12: true });
  }

  // Advance project to stage 12
  await db
    .update(projects)
    .set({ currentStage: 12, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ ok: true, nextStep: 12, skippedStep12: false });
}
