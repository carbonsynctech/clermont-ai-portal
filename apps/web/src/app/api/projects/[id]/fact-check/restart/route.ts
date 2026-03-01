import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, auditLogs, projects, stages, versions } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
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

  const synthesisVersion = await db.query.versions.findFirst({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "synthesis")),
    orderBy: [desc(versions.createdAt)],
  });

  if (!synthesisVersion) {
    return NextResponse.json({ error: "No Step 5 synthesis version found" }, { status: 400 });
  }

  await db
    .update(stages)
    .set({
      status: "pending",
      workerJobId: null,
      errorMessage: null,
      metadata: null,
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  await db
    .update(projects)
    .set({
      activeVersionId: synthesisVersion.id,
      currentStage: 8,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "stage_started",
    stepNumber: 8,
    payload: {
      event: "fact_check_restart_requested",
      resetToVersionId: synthesisVersion.id,
      resetToVersionType: synthesisVersion.versionType,
    },
  });

  return NextResponse.json({ ok: true });
}
