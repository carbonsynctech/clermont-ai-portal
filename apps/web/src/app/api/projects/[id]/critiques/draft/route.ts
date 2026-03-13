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
    critiques?: unknown;
    selectedIds?: unknown;
    selectedCritiques?: unknown;
  };

  if (!Array.isArray(body.critiques) || !body.critiques.every(isValidCritiqueDraftItem)) {
    return NextResponse.json(
      { error: "critiques must be an array of valid critique items" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.selectedIds) || !body.selectedIds.every((id) => typeof id === "number" && Number.isFinite(id))) {
    return NextResponse.json(
      { error: "selectedIds must be an array of numbers" },
      { status: 400 },
    );
  }

  if (
    !Array.isArray(body.selectedCritiques)
    || !body.selectedCritiques.every((entry) => typeof entry === "string")
  ) {
    return NextResponse.json(
      { error: "selectedCritiques must be an array of strings" },
      { status: 400 },
    );
  }

  const { data: stage11 } = await supabase
    .from("stages")
    .select()
    .eq("project_id", projectId)
    .eq("step_number", 11)
    .single();

  const existingMetadata =
    stage11?.metadata && typeof stage11.metadata === "object" && !Array.isArray(stage11.metadata)
      ? stage11.metadata
      : {};

  const now = new Date().toISOString();

  await supabase
    .from("stages")
    .update({
      metadata: {
        ...(existingMetadata as Record<string, unknown>),
        devilsAdvocateDraft: {
          critiques: body.critiques,
          selectedIds: body.selectedIds,
          selectedCritiques: body.selectedCritiques,
          savedAt: now,
        },
        selectedCritiquesCount: body.selectedCritiques.length,
      } as unknown as Json,
      updated_at: now,
    })
    .eq("project_id", projectId)
    .eq("step_number", 11);

  await supabase
    .from("projects")
    .update({ updated_at: now })
    .eq("id", projectId);

  return NextResponse.json({ ok: true, savedAt: now });
}
