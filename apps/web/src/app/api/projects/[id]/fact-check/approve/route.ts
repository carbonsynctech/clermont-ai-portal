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

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    issuesApproved?: unknown;
    findingIds?: unknown;
  };
  const issuesApproved = Array.isArray(body.issuesApproved)
    ? body.issuesApproved.filter((issue): issue is string => typeof issue === "string")
    : [];
  const findingIds = Array.isArray(body.findingIds)
    ? body.findingIds.filter((findingId): findingId is string => typeof findingId === "string")
    : [];

  await db
    .update(stages)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "fact_check_approved",
    stepNumber: 8,
    payload: { issuesApproved, findingIds, count: issuesApproved.length },
  });

  await db
    .update(projects)
    .set({ currentStage: 9, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ ok: true });
}
