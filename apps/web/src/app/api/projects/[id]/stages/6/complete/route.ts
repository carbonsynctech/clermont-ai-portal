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

  // Ensure a style preset has been selected
  const { data: styleGuide } = await supabase
    .from("style_guides")
    .select()
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .single();

  if (!styleGuide) {
    return NextResponse.json({ error: "Select a style preset first" }, { status: 400 });
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
    .eq("step_number", 6);

  await supabase
    .from("projects")
    .update({
      current_stage: project.current_stage < 7 ? 7 : project.current_stage,
      updated_at: now,
    })
    .eq("id", projectId);

  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "stage_completed",
    step_number: 6,
    payload: {
      source: "manual_continue",
      presetId: styleGuide.original_filename,
      fromStep: 6,
      toStep: 7,
    },
  });

  return NextResponse.json({ ok: true, nextStep: 7 });
}
