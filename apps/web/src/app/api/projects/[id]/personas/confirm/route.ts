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
    const clearResult = await db
      .update(personas)
      .set({ isSelected: false, selectionOrder: null })
      .where(eq(personas.projectId, projectId));
    console.log(`[confirm-personas] Cleared previous selections`);

    // Mark selected personas with selectionOrder
    const updateResults = await Promise.all(
      personaIds.map((personaId, index) =>
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
      payload: { count: 5, personaIds },
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
