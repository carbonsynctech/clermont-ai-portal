import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, sourceMaterials, auditLogs } from "@repo/db";
import { workerClient } from "@/lib/worker-client";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_MATERIAL_TYPES = [
  "financial_report",
  "business_model",
  "cv_biography",
  "market_research",
  "legal_document",
  "other",
] as const;

type MaterialType = (typeof VALID_MATERIAL_TYPES)[number];

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Verify ownership
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get("file");
  const materialTypeRaw = formData.get("materialType");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (typeof materialTypeRaw !== "string" || !VALID_MATERIAL_TYPES.includes(materialTypeRaw as MaterialType)) {
    return NextResponse.json({ error: "Invalid materialType" }, { status: 400 });
  }

  const materialType = materialTypeRaw as MaterialType;
  const originalFilename = file.name;
  const mimeType = file.type || "application/octet-stream";
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileSizeBytes = fileBuffer.length;

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${projectId}/${randomUUID()}-${originalFilename}`;
  const adminSupabase = createAdminClient();

  const { error: uploadError } = await adminSupabase.storage
    .from("source-materials")
    .upload(storagePath, fileBuffer, { contentType: mimeType });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return NextResponse.json({ error: "Failed to upload file to storage" }, { status: 500 });
  }

  // Insert source_materials row
  const [material] = await db
    .insert(sourceMaterials)
    .values({
      projectId,
      materialType,
      originalFilename,
      storagePath,
      mimeType,
      fileSizeBytes,
      ndaAcknowledged: true,
    })
    .returning();

  if (!material) {
    return NextResponse.json({ error: "Failed to create material record" }, { status: 500 });
  }

  // Audit log
  await db.insert(auditLogs).values({
    projectId,
    userId: user.id,
    action: "source_uploaded",
    payload: { materialId: material.id, filename: originalFilename, materialType },
  });

  // Dispatch extraction job (fire and forget)
  void workerClient.extractMaterial(material.id, projectId).catch((err: unknown) => {
    console.error("Failed to dispatch extract-material job:", err);
  });

  return NextResponse.json({ materialId: material.id, storagePath });
}
