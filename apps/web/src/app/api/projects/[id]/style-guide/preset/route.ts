import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_PRESET_IDS = ["corporate", "modern", "minimal", "executive"] as const;

export async function POST(req: NextRequest, { params }: RouteParams) {
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

  const body = (await req.json()) as { presetId?: string };

  if (!body.presetId || !VALID_PRESET_IDS.includes(body.presetId as (typeof VALID_PRESET_IDS)[number])) {
    return NextResponse.json({ error: "Invalid preset ID" }, { status: 400 });
  }

  const presetId = body.presetId;

  // Import presets at runtime to avoid bundling issues
  const { STYLE_PRESETS } = await import(
    "@/components/projects/steps/document-template"
  );

  const preset = STYLE_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 400 });
  }

  // Encode preset metadata in extractedRules using the existing shape
  const presetRules = {
    toneRules: [preset.condensedRules],
    formattingRules: [] as string[],
    vocabularyRules: [] as string[],
    structureRules: [`presetId:${presetId}`, `presetName:${preset.name}`],
    prohibitions: [] as string[],
  };

  // Check for existing style guide and update or create
  const { data: existingStyleGuide } = await supabase
    .from("style_guides")
    .select()
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .single();

  if (existingStyleGuide) {
    await supabase
      .from("style_guides")
      .update({
        original_filename: `preset:${presetId}`,
        storage_path: `preset:${presetId}`,
        condensed_rules_text: preset.condensedRules,
        is_processed: true,
        extracted_rules: presetRules,
      })
      .eq("id", existingStyleGuide.id);
  } else {
    await supabase.from("style_guides").insert({
      project_id: projectId,
      original_filename: `preset:${presetId}`,
      storage_path: `preset:${presetId}`,
      condensed_rules_text: preset.condensedRules,
      is_processed: true,
      extracted_rules: presetRules,
    });
  }

  const now = new Date().toISOString();

  await supabase
    .from("projects")
    .update({ updated_at: now })
    .eq("id", projectId);

  // Mark step 10 as completed
  if (project) {
    const { data: step10Stage } = await supabase
      .from("stages")
      .select()
      .eq("project_id", projectId)
      .eq("step_number", 10)
      .single();

    if (step10Stage && step10Stage.status !== "completed") {
      await supabase
        .from("stages")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("project_id", projectId)
        .eq("step_number", 10);

      await supabase.from("audit_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "stage_completed",
        step_number: 10,
        payload: {
          source: "preset_selected",
          presetId,
          presetName: preset.name,
        },
      });

      // Update currentStage if needed
      if (project.current_stage < 11) {
        await supabase
          .from("projects")
          .update({ current_stage: 11, updated_at: now })
          .eq("id", projectId);
      }
    }
  }

  return NextResponse.json({ presetId, presetName: preset.name });
}
