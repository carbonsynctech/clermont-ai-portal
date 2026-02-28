import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, styleGuides, stages } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

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

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const originalFilename = file.name;
  const mimeType = file.type || "application/octet-stream";
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${projectId}/style-guide-${randomUUID()}-${originalFilename}`;
  const adminSupabase = createAdminClient();

  const { error: uploadError } = await adminSupabase.storage
    .from("source-materials")
    .upload(storagePath, fileBuffer, { contentType: mimeType });

  if (uploadError) {
    console.error("Style guide upload error:", uploadError);
    return NextResponse.json({ error: "Failed to upload style guide" }, { status: 500 });
  }

  // Insert style_guides row
  const [styleGuide] = await db
    .insert(styleGuides)
    .values({
      projectId,
      originalFilename,
      storagePath,
      isProcessed: false,
    })
    .returning();

  if (!styleGuide) {
    return NextResponse.json({ error: "Failed to create style guide record" }, { status: 500 });
  }

  // Mark stage 6 as completed (style guide uploaded = step 6 done)
  await db
    .update(stages)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 6)));

  return NextResponse.json({ styleGuideId: styleGuide.id });
}
