import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: synthesisVersion } = await supabase
    .from("versions")
    .select()
    .eq("project_id", projectId)
    .eq("version_type", "synthesis")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!synthesisVersion) {
    return NextResponse.json({ error: "No Step 5 synthesis version found" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await supabase
    .from("stages")
    .update({
      status: "pending",
      worker_job_id: null,
      error_message: null,
      metadata: null,
      started_at: null,
      completed_at: null,
      updated_at: now,
    })
    .eq("project_id", projectId)
    .eq("step_number", 8);

  await supabase
    .from("projects")
    .update({
      active_version_id: synthesisVersion.id,
      current_stage: 8,
      updated_at: now,
    })
    .eq("id", projectId);

  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "stage_started",
    step_number: 8,
    payload: {
      event: "fact_check_restart_requested",
      resetToVersionId: synthesisVersion.id,
      resetToVersionType: synthesisVersion.version_type,
    },
  });

  return NextResponse.json({ ok: true });
}
