import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects } from "@repo/db";
import type { ProjectBriefData } from "@repo/db";
import { and, eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json()) as { title?: unknown; briefData?: unknown };

  const existing = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Partial<{ title: string; briefData: ProjectBriefData; updatedAt: Date }> = {
    updatedAt: new Date(),
  };

  if (typeof body.title === "string" && body.title.trim() !== "") {
    updates.title = body.title.trim();
  }

  if (body.briefData != null) {
    updates.briefData = body.briefData as ProjectBriefData;
  }

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.id, id), eq(projects.ownerId, user.id)))
    .returning();

  return NextResponse.json(updated);
}
