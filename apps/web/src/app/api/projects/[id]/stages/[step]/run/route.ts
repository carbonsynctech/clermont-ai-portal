import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages } from "@repo/db";
import { workerClient } from "@/lib/worker-client";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string; step: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, step: stepStr } = await params;
  const stepNumber = parseInt(stepStr, 10);

  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 13) {
    return NextResponse.json({ error: "Invalid step number" }, { status: 400 });
  }

  // Verify user owns the project
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Update stage status to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, stepNumber)));

  try {
    const body = (await req.json().catch(() => ({}))) as { payload?: unknown };
    const result = await workerClient.runStage(stepNumber, projectId, body.payload);

    // Store the worker job ID on the stage
    if (result.jobId) {
      await db
        .update(stages)
        .set({ workerJobId: result.jobId, updatedAt: new Date() })
        .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, stepNumber)));
    }

    return NextResponse.json(result);
  } catch (err) {
    // Roll back stage status on dispatch failure
    await db
      .update(stages)
      .set({ status: "failed", errorMessage: String(err), updatedAt: new Date() })
      .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, stepNumber)));

    return NextResponse.json({ error: "Failed to dispatch job" }, { status: 502 });
  }
}
