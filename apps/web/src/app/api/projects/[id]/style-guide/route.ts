import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { sanitizeFilename } from "@/lib/sanitize-filename";

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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const originalFilename = file.name;
  const mimeType = file.type || "application/octet-stream";
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const safeFilename = sanitizeFilename(originalFilename);

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${projectId}/style-guide-${randomUUID()}-${safeFilename}`;
  const adminSupabase = createAdminClient();

  const { error: uploadError } = await adminSupabase.storage
    .from("source-materials")
    .upload(storagePath, fileBuffer, { contentType: mimeType });

  if (uploadError) {
    console.error("Style guide upload error:", uploadError);
    return NextResponse.json({ error: "Failed to upload style guide" }, { status: 500 });
  }

  // Insert style_guides row
  const { data: styleGuide } = await supabase
    .from("style_guides")
    .insert({
      project_id: projectId,
      original_filename: originalFilename,
      storage_path: storagePath,
      is_processed: false,
    })
    .select()
    .single();

  if (!styleGuide) {
    return NextResponse.json({ error: "Failed to create style guide record" }, { status: 500 });
  }

  // Mark stage 6 as completed (style guide uploaded = step 6 done)
  const now = new Date().toISOString();
  await supabase
    .from("stages")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("project_id", projectId)
    .eq("step_number", 6);

  await supabase
    .from("projects")
    .update({ updated_at: now })
    .eq("id", projectId);

  return NextResponse.json({ styleGuideId: styleGuide.id });
}
