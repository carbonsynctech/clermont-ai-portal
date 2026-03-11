import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, versions, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
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

  const body = (await req.json()) as { content?: unknown; reviewNotes?: unknown };

  if (!body.content || typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const content = body.content as string;
  const wordCount = content.trim().split(/\s+/).length;
  const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes.trim() : "";

  // Insert human_reviewed version
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 10,
      versionType: "human_reviewed",
      internalLabel: "Human Review V5",
      content,
      wordCount,
      isClientVisible: false,
    })
    .returning();

  if (!newVersion) {
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
  }

  // Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Insert audit log
  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "human_review_approved",
    stepNumber: 10,
    payload: {
      wordCount,
      ...(reviewNotes ? { reviewNotes } : {}),
    },
  });

  // Update stage 10 to completed
  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        reviewDraftContent: content,
        ...(reviewNotes ? { reviewNotes } : {}),
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 10)));

  // Advance project to stage 11 only if currently behind
  await db
    .update(projects)
    .set({
      currentStage: project.currentStage < 11 ? 11 : project.currentStage,
      updatedAt: new Date()
    })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ ok: true });
}
