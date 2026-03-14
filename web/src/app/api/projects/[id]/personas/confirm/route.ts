import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify ownership
    const { data: project } = await supabase
      .from("projects")
      .select()
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await req.json()) as { personaIds?: unknown };

    if (
      !Array.isArray(body.personaIds) ||
      body.personaIds.length !== 5 ||
      !body.personaIds.every((id) => typeof id === "string")
    ) {
      return NextResponse.json({ error: "personaIds must be an array of exactly 5 strings" }, { status: 400 });
    }

    const personaIds = body.personaIds as string[];

    // Clear any previously selected personas for this project
    await supabase
      .from("personas")
      .update({ is_selected: false, selection_order: null })
      .eq("project_id", projectId);

    // Fetch the selected personas to check which ones belong to this project
    const { data: selectedPersonaRows } = await supabase
      .from("personas")
      .select()
      .in("id", personaIds);

    // Clone any personas that don't belong to this project (library/global personas)
    const idMapping = new Map<string, string>(); // old id -> new id (for cloned)
    for (const persona of selectedPersonaRows ?? []) {
      if (persona.project_id === projectId) {
        idMapping.set(persona.id, persona.id);
      } else {
        // Clone into this project
        const { data: cloned } = await supabase
          .from("personas")
          .insert({
            project_id: projectId,
            name: persona.name,
            description: persona.description,
            system_prompt: persona.system_prompt,
            source_urls: persona.source_urls,
            tags: persona.tags,
            is_selected: false,
            selection_order: null,
          })
          .select("id")
          .single();
        if (cloned) {
          idMapping.set(persona.id, cloned.id);
        }
      }
    }

    // Resolve final persona IDs (using cloned IDs where applicable)
    const resolvedIds = personaIds.map((id) => idMapping.get(id) ?? id);

    // Mark selected personas with selectionOrder
    const updateResults = await Promise.all(
      resolvedIds.map((personaId, index) =>
        supabase
          .from("personas")
          .update({ is_selected: true, selection_order: index })
          .eq("id", personaId)
          .eq("project_id", projectId)
      )
    );

    // Verify personas were actually updated
    const { data: verifyPersonas } = await supabase
      .from("personas")
      .select()
      .eq("project_id", projectId)
      .eq("is_selected", true);

    if (!verifyPersonas || verifyPersonas.length !== 5) {
      console.error(
        `[confirm-personas] ERROR: Expected 5 selected personas but got ${verifyPersonas?.length ?? 0}. PersonaIds: ${JSON.stringify(personaIds)}`
      );
      return NextResponse.json(
        { error: `Failed to update all personas. Expected 5, got ${verifyPersonas?.length ?? 0}` },
        { status: 500 }
      );
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      project_id: projectId,
      user_id: user.id,
      action: "persona_selected",
      step_number: 2,
      payload: { count: 5, personaIds: resolvedIds },
    });

    // Complete stage 2
    const now = new Date().toISOString();
    await supabase
      .from("stages")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .eq("project_id", projectId)
      .eq("step_number", 2);

    // Advance project to stage 3
    await supabase
      .from("projects")
      .update({ current_stage: 3, updated_at: now })
      .eq("id", projectId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[confirm-personas] Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error("[confirm-personas] Stack:", error.stack);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to confirm personas" },
      { status: 500 }
    );
  }
}
