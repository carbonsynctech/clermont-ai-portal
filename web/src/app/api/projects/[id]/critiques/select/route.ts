import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@repo/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CritiqueDraftItem {
  id: number;
  title: string;
  detail: string;
  isCustom?: boolean;
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

function isValidCritiqueDraftItem(value: unknown): value is CritiqueDraftItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number"
    && Number.isFinite(record.id)
    && typeof record.title === "string"
    && record.title.trim().length > 0
    && typeof record.detail === "string"
    && record.detail.trim().length > 0
    && (record.isCustom === undefined || typeof record.isCustom === "boolean")
  );
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
  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    selectedCritiques?: unknown;
    critiques?: unknown;
    selectedIds?: unknown;
  };

  if (
    body.selectedCritiques !== undefined &&
    (!Array.isArray(body.selectedCritiques) ||
      !body.selectedCritiques.every((c) => typeof c === "string"))
  ) {
    return NextResponse.json(
      { error: "selectedCritiques must be an array of strings" },
      { status: 400 }
    );
  }

  if (
    body.critiques !== undefined
    && (!Array.isArray(body.critiques) || !body.critiques.every(isValidCritiqueDraftItem))
  ) {
    return NextResponse.json(
      { error: "critiques must be an array of valid critique items" },
      { status: 400 },
    );
  }

  if (
    body.selectedIds !== undefined
    && (!Array.isArray(body.selectedIds)
      || !body.selectedIds.every((id) => typeof id === "number" && Number.isFinite(id)))
  ) {
    return NextResponse.json(
      { error: "selectedIds must be an array of numbers" },
      { status: 400 },
    );
  }

  const selectedCritiques = (body.selectedCritiques as string[] | undefined) ?? [];
  const critiques = (body.critiques as CritiqueDraftItem[] | undefined) ?? [];
  const selectedIds = (body.selectedIds as number[] | undefined) ?? [];

  const { data: stage8 } = await supabase
    .from("stages")
    .select()
    .eq("project_id", projectId)
    .eq("step_number", 8)
    .single();

  const existingMetadata =
    stage8?.metadata && typeof stage8.metadata === "object" && !Array.isArray(stage8.metadata)
      ? stage8.metadata
      : {};

  const now = new Date().toISOString();

  // Insert audit log with selected critiques in payload
  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "critique_selected",
    step_number: 8,
    payload: { selectedCritiques, count: selectedCritiques.length },
  });

  // Update stage 8 to completed
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
      metadata: {
        ...(existingMetadata as Record<string, unknown>),
        selectedCritiquesCount: selectedCritiques.length,
        devilsAdvocateDraft: {
          critiques,
          selectedIds,
          selectedCritiques,
          savedAt: now,
        },
      } as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 8);

  if (selectedCritiques.length === 0) {
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
        internal_label: "Final V6 (No Critiques Selected)",
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

    // Skip step 9 entirely when no critiques are selected
    await supabase
      .from("stages")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
        metadata: { reviewNotes: "Skipped Step 9 because no critiques were selected." },
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
        reason: "No critiques selected",
        carriedForwardFromVersionId: carryForwardVersion.id,
        carriedForwardFromVersionType: carryForwardVersion.version_type,
        finalVersionId: finalVersion.id,
      },
    });

    return NextResponse.json({ ok: true, nextStep: 12, skippedStep9: true });
  }

  // Advance project to stage 9
  await supabase
    .from("projects")
    .update({ current_stage: 9, updated_at: now })
    .eq("id", projectId);

  return NextResponse.json({ ok: true, nextStep: 9, skippedStep9: false });
}
