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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json()) as { content?: unknown };

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: stage7 } = await supabase
    .from("stages")
    .select()
    .eq("project_id", projectId)
    .eq("step_number", 7)
    .single();

  const existingMetadata =
    stage7?.metadata && typeof stage7.metadata === "object" && !Array.isArray(stage7.metadata)
      ? stage7.metadata
      : {};

  await supabase
    .from("stages")
    .update({
      metadata: {
        ...(existingMetadata as Record<string, unknown>),
        reviewDraftContent: body.content,
        reviewDraftSavedAt: now,
      },
      updated_at: now,
    })
    .eq("project_id", projectId)
    .eq("step_number", 7);

  await supabase
    .from("projects")
    .update({ updated_at: now })
    .eq("id", projectId);

  return NextResponse.json({ ok: true, savedAt: now });
}
