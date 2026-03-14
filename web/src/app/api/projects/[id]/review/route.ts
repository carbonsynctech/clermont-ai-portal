import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
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
  const { data: newVersion, error: versionError } = await supabase
    .from("versions")
    .insert({
      project_id: projectId,
      produced_by_step: 7,
      version_type: "human_reviewed",
      internal_label: "Human Review V5",
      content,
      word_count: wordCount,
      is_client_visible: false,
    })
    .select()
    .single();

  if (versionError || !newVersion) {
    return NextResponse.json({ error: versionError?.message ?? "Failed to create version" }, { status: 500 });
  }

  // Update activeVersionId
  await supabase
    .from("projects")
    .update({ active_version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  // Insert audit log
  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "human_review_approved",
    step_number: 7,
    payload: {
      wordCount,
      ...(reviewNotes ? { reviewNotes } : {}),
    },
  });

  // Update stage 7 to completed
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        reviewDraftContent: content,
        ...(reviewNotes ? { reviewNotes } : {}),
      },
    })
    .eq("project_id", projectId)
    .eq("step_number", 7);

  // Advance project to stage 8 only if currently behind
  await supabase
    .from("projects")
    .update({
      current_stage: project.current_stage < 8 ? 8 : project.current_stage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  return NextResponse.json({ ok: true });
}
