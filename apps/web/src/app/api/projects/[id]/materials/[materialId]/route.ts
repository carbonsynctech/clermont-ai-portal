import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select()
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify material belongs to project
    const { data: material, error: materialError } = await supabase
      .from("source_materials")
      .select()
      .eq("id", materialId)
      .eq("project_id", projectId)
      .single();

    if (materialError || !material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    // Delete from storage
    const adminSupabase = createAdminClient();
    const { error: deleteError } = await adminSupabase.storage
      .from("source-materials")
      .remove([material.storage_path]);

    if (deleteError) {
      console.error("Failed to delete file from storage:", deleteError);
      // Continue with DB deletion even if storage deletion fails
    }

    // Delete from database (do this first — it's the critical operation)
    await supabase.from("source_materials").delete().eq("id", materialId);

    // Audit log + timestamp update (non-critical — don't fail the response if these error)
    try {
      await supabase.from("audit_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "source_deleted",
        payload: { materialId, filename: material.original_filename },
      });

      await supabase
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", projectId);
    } catch (auditError) {
      console.error("Failed to write audit log for source deletion:", auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete material error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
