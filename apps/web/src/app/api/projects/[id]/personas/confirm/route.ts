import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, personas, stages, auditLogs } from "@repo/db";
import { eq, and, inArray } from "drizzle-orm";

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

  // Mark selected personas with selectionOrder
  await Promise.all(
    personaIds.map((personaId, index) =>
      db
        .update(personas)
        .set({ isSelected: true, selectionOrder: index })
        .where(and(eq(personas.id, personaId), eq(personas.projectId, projectId)))
    )
  );

  // Audit log
  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "persona_selected",
    stepNumber: 2,
    payload: { count: 5, personaIds },
  });

  // Complete stage 2
  await db
    .update(stages)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));

  // Advance project to stage 3
  await db
    .update(projects)
    .set({ currentStage: 3, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ ok: true });
}
