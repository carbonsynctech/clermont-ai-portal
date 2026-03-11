import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, personas, stages, auditLogs } from "@repo/db";
import { eq, and, inArray } from "drizzle-orm";

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
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
    });

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
    console.log(`[confirm-personas] Starting for project ${projectId} with ${personaIds.length} personas`);

    // Clear any previously selected personas for this project
    await db
      .update(personas)
      .set({ isSelected: false, selectionOrder: null })
      .where(eq(personas.projectId, projectId));
    console.log(`[confirm-personas] Cleared previous selections`);

    // Fetch the selected personas to check which ones belong to this project
    const selectedPersonaRows = await db.query.personas.findMany({
      where: inArray(personas.id, personaIds),
    });

    // Clone any personas that don't belong to this project (library/global personas)
    const idMapping = new Map<string, string>(); // old id -> new id (for cloned)
    for (const persona of selectedPersonaRows) {
      if (persona.projectId === projectId) {
        idMapping.set(persona.id, persona.id);
      } else {
        // Clone into this project
        const [cloned] = await db
          .insert(personas)
          .values({
            projectId,
            name: persona.name,
            description: persona.description,
            systemPrompt: persona.systemPrompt,
            sourceUrls: persona.sourceUrls,
            tags: persona.tags,
            isSelected: false,
            selectionOrder: null,
          })
          .returning({ id: personas.id });
        if (cloned) {
          idMapping.set(persona.id, cloned.id);
          console.log(`[confirm-personas] Cloned library persona ${persona.id} -> ${cloned.id}`);
        }
      }
    }

    // Resolve final persona IDs (using cloned IDs where applicable)
    const resolvedIds = personaIds.map((id) => idMapping.get(id) ?? id);

    // Mark selected personas with selectionOrder
    const updateResults = await Promise.all(
      resolvedIds.map((personaId, index) =>
        db
          .update(personas)
          .set({ isSelected: true, selectionOrder: index })
          .where(and(eq(personas.id, personaId), eq(personas.projectId, projectId)))
      )
    );
    console.log(`[confirm-personas] Updated ${updateResults.length} personas with selection`);

    // Verify personas were actually updated
    const verifyPersonas = await db.query.personas.findMany({
      where: and(eq(personas.projectId, projectId), eq(personas.isSelected, true)),
    });
    console.log(`[confirm-personas] Verification: ${verifyPersonas.length} personas marked as selected`);

    if (verifyPersonas.length !== 5) {
      console.error(
        `[confirm-personas] ERROR: Expected 5 selected personas but got ${verifyPersonas.length}. PersonaIds: ${JSON.stringify(personaIds)}`
      );
      return NextResponse.json(
        { error: `Failed to update all personas. Expected 5, got ${verifyPersonas.length}` },
        { status: 500 }
      );
    }

    // Audit log
    await db.insert(auditLogs).values({
      projectId,
      userId: user.id,
      action: "persona_selected",
      stepNumber: 2,
      payload: { count: 5, personaIds: resolvedIds },
    });
    console.log(`[confirm-personas] Audit log created`);

    // Complete stage 2
    await db
      .update(stages)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));
    console.log(`[confirm-personas] Stage 2 marked completed`);

    // Advance project to stage 3
    await db
      .update(projects)
      .set({ currentStage: 3, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    console.log(`[confirm-personas] Project advanced to stage 3`);

    console.log(`[confirm-personas] SUCCESS for project ${projectId}`);
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
