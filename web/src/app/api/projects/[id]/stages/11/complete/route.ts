import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("project_id", projectId)
    .eq("step_number", 11);

  await supabase
    .from("projects")
    .update({
      current_stage: project.current_stage < 12 ? 12 : project.current_stage,
      updated_at: now,
    })
    .eq("id", projectId);

  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "stage_completed",
    step_number: 11,
    payload: {
      source: "manual_continue",
      fromStep: 11,
      toStep: 12,
    },
  });

  return NextResponse.json({ ok: true, nextStep: 12 });
}
