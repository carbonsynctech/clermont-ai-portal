import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages } from "@repo/db";
import type { ProjectBriefData } from "@repo/db";
import { SOP_STEP_NAMES } from "@repo/core";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

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

  const whereClause =
    status === "trashed"
      ? and(eq(projects.ownerId, user.id), isNotNull(projects.deletedAt))
      : status === "all"
      ? eq(projects.ownerId, user.id)
      : and(eq(projects.ownerId, user.id), isNull(projects.deletedAt));

  const rows = await db.query.projects.findMany({
    where: whereClause,
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

  const body = ((await req.json().catch(() => ({}))) as { title?: unknown; briefData?: unknown });

  const title =
    typeof body.title === "string" && body.title.trim() !== ""
      ? body.title.trim()
      : "Untitled Project";

  const [project] = await db
    .insert(projects)
    .values({
      ownerId: user.id,
      title,
      briefData:
        body.briefData != null ? (body.briefData as ProjectBriefData) : undefined,
      status: "draft",
      currentStage: 1,
    })
    .returning();

  if (!project) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }

  // Create all 12 stage rows
  const stageRows = Array.from({ length: 12 }, (_, i) => ({
    projectId: project.id,
    stepNumber: i + 1,
    stepName: SOP_STEP_NAMES[(i + 1) as keyof typeof SOP_STEP_NAMES],
    status: "pending" as const,
  }));

  await db.insert(stages).values(stageRows);

  return NextResponse.json(project, { status: 201 });
}
