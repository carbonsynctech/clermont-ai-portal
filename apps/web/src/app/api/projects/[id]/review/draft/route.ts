import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages } from "@repo/db";
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

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json()) as { content?: unknown };

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const now = new Date();

  const stage7 = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.stepNumber, 7)),
  });

  const existingMetadata =
    stage7?.metadata && typeof stage7.metadata === "object" && !Array.isArray(stage7.metadata)
      ? stage7.metadata
      : {};

  await db
    .update(stages)
    .set({
      metadata: {
        ...existingMetadata,
        reviewDraftContent: body.content,
        reviewDraftSavedAt: now.toISOString(),
      },
      updatedAt: now,
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 7)));

  await db
    .update(projects)
    .set({ updatedAt: now })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ ok: true, savedAt: now.toISOString() });
}
