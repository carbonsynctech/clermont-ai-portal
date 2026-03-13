import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workerClient } from "@/lib/worker-client";

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

  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 12) {
    return NextResponse.json({ error: "Invalid step number" }, { status: 400 });
  }

  if (stepNumber === 12) {
    return NextResponse.json(
      { error: "Step 12 is export-only. Use /api/projects/[id]/export endpoints." },
      { status: 400 }
    );
  }

  // Verify user owns the project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Update stage status to running
  await supabase
    .from("stages")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("step_number", stepNumber);

  try {
    const body = (await req.json().catch(() => ({}))) as { payload?: unknown };
    const result = await workerClient.runStage(stepNumber, projectId, user.id, body.payload);

    // Store the worker job ID on the stage
    if (result.jobId) {
      await supabase
        .from("stages")
        .update({ worker_job_id: result.jobId, updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("step_number", stepNumber);
    }

    return NextResponse.json(result);
  } catch (err) {
    // Roll back stage status on dispatch failure
    await supabase
      .from("stages")
      .update({ status: "failed", error_message: String(err), updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("step_number", stepNumber);

    return NextResponse.json({ error: "Failed to dispatch job" }, { status: 502 });
  }
}
