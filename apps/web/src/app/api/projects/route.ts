import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@repo/db";
import { SOP_STEP_NAMES } from "@repo/core";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam === "trashed" || statusParam === "all" ? statusParam : "active";

  let query = supabase.from("projects").select().eq("owner_id", user.id);

  if (status === "trashed") {
    query = query.not("deleted_at", "is", null);
  } else if (status === "active") {
    query = query.is("deleted_at", null);
  }
  // status === "all" has no additional filter

  const { data: rows, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = ((await req.json().catch(() => ({}))) as { title?: unknown; briefData?: unknown });

  const title =
    typeof body.title === "string" && body.title.trim() !== ""
      ? body.title.trim()
      : "Untitled Project";

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      title,
      brief_data:
        body.briefData != null ? (body.briefData as unknown as Json) : undefined,
      status: "draft",
      current_stage: 1,
    })
    .select()
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: projectError?.message ?? "Failed to create project" }, { status: 500 });
  }

  // Create all 12 stage rows
  const stageRows = Array.from({ length: 12 }, (_, i) => ({
    project_id: project.id,
    step_number: i + 1,
    step_name: SOP_STEP_NAMES[(i + 1) as keyof typeof SOP_STEP_NAMES],
    status: "pending" as const,
  }));

  const { error: stagesError } = await supabase.from("stages").insert(stageRows);

  if (stagesError) {
    return NextResponse.json({ error: stagesError.message }, { status: 500 });
  }

  return NextResponse.json(project, { status: 201 });
}
