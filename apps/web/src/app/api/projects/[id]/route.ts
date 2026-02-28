import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { auditLogs, projects, sourceMaterials, styleGuides } from "@repo/db";
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
  const body = (await req.json()) as {
    action?: unknown;
    title?: unknown;
    briefData?: unknown;
    masterPrompt?: unknown;
  };

  const existing = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (typeof body.action === "string") {
    if (body.action === "trash") {
      if (existing.deletedAt) {
        return NextResponse.json(existing);
      }

      const [trashed] = await db
        .update(projects)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.ownerId, user.id)))
        .returning();

      await db.insert(auditLogs).values({
        projectId: id,
        userId: user.id,
        action: "project_trashed",
        payload: { retentionDays: 30 },
      });

      return NextResponse.json(trashed);
    }

    if (body.action === "restore") {
      if (!existing.deletedAt) {
        return NextResponse.json(existing);
      }

      const [restored] = await db
        .update(projects)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.ownerId, user.id)))
        .returning();

      await db.insert(auditLogs).values({
        projectId: id,
        userId: user.id,
        action: "project_restored",
        payload: { restoredAt: new Date().toISOString() },
      });

      return NextResponse.json(restored);
    }

    if (body.action === "purge") {
      const [materials, guides] = await Promise.all([
        db.query.sourceMaterials.findMany({
          where: eq(sourceMaterials.projectId, id),
          columns: { storagePath: true },
        }),
        db.query.styleGuides.findMany({
          where: eq(styleGuides.projectId, id),
          columns: { storagePath: true },
        }),
      ]);

      const storagePaths = Array.from(
        new Set(
          [...materials, ...guides]
            .map((item) => item.storagePath)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      );

      if (storagePaths.length > 0) {
        const admin = createAdminClient();
        const { error: removeError } = await admin.storage
          .from("source-materials")
          .remove(storagePaths);

        if (removeError) {
          console.error("Failed to remove storage files before purge:", removeError);
          return NextResponse.json({ error: "Failed to remove project files" }, { status: 500 });
        }
      }

      await db.delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, user.id)));

      await db.insert(auditLogs).values({
        projectId: id,
        userId: user.id,
        action: "project_purged",
        payload: { source: "manual" },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updates: Partial<{ title: string; briefData: ProjectBriefData; masterPrompt: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  };

  if (typeof body.title === "string" && body.title.trim() !== "") {
    updates.title = body.title.trim();
  }

  if (body.briefData != null) {
    updates.briefData = body.briefData as ProjectBriefData;
  }

  if (typeof body.masterPrompt === "string") {
    updates.masterPrompt = body.masterPrompt;
  }

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.id, id), eq(projects.ownerId, user.id)))
    .returning();

  return NextResponse.json(updated);
}
