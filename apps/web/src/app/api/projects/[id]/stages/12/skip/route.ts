import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db, auditLogs, projects, stages, versions } from "@repo/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const CARRY_FORWARD_VERSION_TYPES = [
  "final",
  "human_reviewed",
  "final_styled",
  "fact_checked",
  "styled",
  "synthesis",
] as const;

export async function POST(_req: NextRequest, { params }: RouteParams) {
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

  const carryForwardVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      inArray(versions.versionType, [...CARRY_FORWARD_VERSION_TYPES])
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!carryForwardVersion) {
    return NextResponse.json(
      { error: "No eligible version found to carry forward as final." },
      { status: 400 }
    );
  }

  const [finalVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 12,
      versionType: "final",
      internalLabel: "Final V6 (Step 12 Skipped)",
      content: carryForwardVersion.content,
      wordCount: countWords(carryForwardVersion.content),
      isClientVisible: false,
    })
    .returning();

  if (!finalVersion) {
    return NextResponse.json(
      { error: "Failed to create final version for skipped Step 12." },
      { status: 500 }
    );
  }

  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: { reviewNotes: "User skipped Step 12 manually." },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 12)));

  await db
    .update(projects)
    .set({ currentStage: 13, activeVersionId: finalVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "stage_completed",
    stepNumber: 12,
    payload: {
      skipped: true,
      reason: "User skipped Step 12",
      carriedForwardFromVersionId: carryForwardVersion.id,
      carriedForwardFromVersionType: carryForwardVersion.versionType,
      finalVersionId: finalVersion.id,
    },
  });

  return NextResponse.json({ ok: true, nextStep: 13, skippedStep12: true });
}
