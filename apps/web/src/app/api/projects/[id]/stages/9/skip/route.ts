import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: carryForwardVersion } = await supabase
    .from("versions")
    .select()
    .eq("project_id", projectId)
    .in("version_type", [...CARRY_FORWARD_VERSION_TYPES])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!carryForwardVersion) {
    return NextResponse.json(
      { error: "No eligible version found to carry forward as final." },
      { status: 400 }
    );
  }

  const { data: finalVersion } = await supabase
    .from("versions")
    .insert({
      project_id: projectId,
      produced_by_step: 9,
      version_type: "final",
      internal_label: "Final V6 (Step 9 Skipped)",
      content: carryForwardVersion.content,
      word_count: countWords(carryForwardVersion.content),
      is_client_visible: false,
    })
    .select()
    .single();

  if (!finalVersion) {
    return NextResponse.json(
      { error: "Failed to create final version for skipped Step 9." },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();

  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
      metadata: { reviewNotes: "User skipped Step 9 manually." },
    })
    .eq("project_id", projectId)
    .eq("step_number", 9);

  await supabase
    .from("projects")
    .update({ current_stage: 10, active_version_id: finalVersion.id, updated_at: now })
    .eq("id", projectId);

  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "stage_completed",
    step_number: 9,
    payload: {
      skipped: true,
      reason: "User skipped Step 9",
      carriedForwardFromVersionId: carryForwardVersion.id,
      carriedForwardFromVersionType: carryForwardVersion.version_type,
      finalVersionId: finalVersion.id,
    },
  });

  return NextResponse.json({ ok: true, nextStep: 10, skippedStep9: true });
}
