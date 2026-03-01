import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db, auditLogs, projects, stages } from "@repo/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

  const now = new Date();

  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 9)));

  await db
    .update(projects)
    .set({
      currentStage: project.currentStage < 10 ? 10 : project.currentStage,
      updatedAt: now,
    })
    .where(eq(projects.id, projectId));

  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "stage_completed",
    stepNumber: 9,
    payload: {
      source: "manual_continue",
      fromStep: 9,
      toStep: 10,
    },
  });

  return NextResponse.json({ ok: true, nextStep: 10 });
}
