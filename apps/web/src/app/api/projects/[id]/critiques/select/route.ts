import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";

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

  // Auth + ownership check
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json()) as { selectedCritiques?: unknown };

  if (
    !Array.isArray(body.selectedCritiques) ||
    body.selectedCritiques.length < 1 ||
    !body.selectedCritiques.every((c) => typeof c === "string")
  ) {
    return NextResponse.json(
      { error: "selectedCritiques must be a non-empty array of strings" },
      { status: 400 }
    );
  }

  const selectedCritiques = body.selectedCritiques as string[];

  // Insert audit log with selected critiques in payload
  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "critique_selected",
    stepNumber: 11,
    payload: { selectedCritiques, count: selectedCritiques.length },
  });

  // Update stage 11 to completed
  await db
    .update(stages)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)));

  // Advance project to stage 12
  await db
    .update(projects)
    .set({ currentStage: 12, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ ok: true });
}
