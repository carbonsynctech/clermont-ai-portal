import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, sourceMaterials, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string; materialId: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId, materialId } = await params;

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify material belongs to project
    const material = await db.query.sourceMaterials.findFirst({
      where: and(eq(sourceMaterials.id, materialId), eq(sourceMaterials.projectId, projectId)),
    });

    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    // Delete from storage
    const adminSupabase = createAdminClient();
    const { error: deleteError } = await adminSupabase.storage
      .from("source-materials")
      .remove([material.storagePath]);

    if (deleteError) {
      console.error("Failed to delete file from storage:", deleteError);
      // Continue with DB deletion even if storage deletion fails
    }

    // Delete from database
    await db.delete(sourceMaterials).where(eq(sourceMaterials.id, materialId));

    // Audit log
    await db.insert(auditLogs).values({
      projectId,
      userId: user.id,
      action: "source_deleted",
      payload: { materialId, filename: material.originalFilename },
    });

    // Update project timestamp
    await db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete material error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
