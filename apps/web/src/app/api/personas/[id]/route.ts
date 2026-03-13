import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: persona } = await supabase
    .from("personas")
    .select()
    .eq("id", id)
    .single();

  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(persona);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: persona } = await supabase
    .from("personas")
    .select()
    .eq("id", id)
    .single();

  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!persona.project_id) {
    return NextResponse.json({ error: "Cannot delete global persona" }, { status: 403 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", persona.project_id)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabase.from("personas").delete().eq("id", id);

  await supabase.from("audit_logs").insert({
    project_id: persona.project_id,
    user_id: user.id,
    action: "persona_selected",
    step_number: 2,
    payload: { event: "persona_deleted", personaId: id, name: persona.name },
  });

  return NextResponse.json({ ok: true });
}
