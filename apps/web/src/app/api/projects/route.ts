import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages } from "@repo/db";
import type { ProjectBriefData } from "@repo/db";
import { SOP_STEP_NAMES } from "@repo/core";
import { eq } from "drizzle-orm";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.projects.findMany({
    where: eq(projects.ownerId, user.id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

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

  const body = (await req.json()) as { title?: unknown; briefData?: unknown };

  if (!body.title || typeof body.title !== "string" || body.title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const [project] = await db
    .insert(projects)
    .values({
      ownerId: user.id,
      title: body.title.trim(),
      briefData:
        body.briefData != null ? (body.briefData as ProjectBriefData) : undefined,
      status: "draft",
      currentStage: 1,
    })
    .returning();

  if (!project) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }

  // Create all 13 stage rows
  const stageRows = Array.from({ length: 13 }, (_, i) => ({
    projectId: project.id,
    stepNumber: i + 1,
    stepName: SOP_STEP_NAMES[(i + 1) as keyof typeof SOP_STEP_NAMES],
    status: "pending" as const,
  }));

  await db.insert(stages).values(stageRows);

  return NextResponse.json(project, { status: 201 });
}
