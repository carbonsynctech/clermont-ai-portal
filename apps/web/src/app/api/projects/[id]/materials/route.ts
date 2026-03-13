import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workerClient } from "@/lib/worker-client";

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
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Accept JSON body with metadata (file already uploaded directly to storage)
  const body = (await req.json()) as {
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    materialType?: string;
  };

  const { storagePath, originalFilename, mimeType, fileSizeBytes } = body;

  if (!storagePath || !originalFilename || !mimeType || !fileSizeBytes) {
    return NextResponse.json(
      { error: "storagePath, originalFilename, mimeType, and fileSizeBytes are required" },
      { status: 400 }
    );
  }

  // Validate the storage path belongs to this user/project
  if (!storagePath.startsWith(`${user.id}/${projectId}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 403 });
  }

  const materialType =
    typeof body.materialType === "string" && VALID_MATERIAL_TYPES.includes(body.materialType as MaterialType)
      ? (body.materialType as MaterialType)
      : "other";

  // Insert source_materials row
  const { data: material, error: materialError } = await supabase
    .from("source_materials")
    .insert({
      project_id: projectId,
      material_type: materialType,
      original_filename: originalFilename,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      nda_acknowledged: true,
    })
    .select()
    .single();

  if (materialError || !material) {
    return NextResponse.json({ error: materialError?.message ?? "Failed to create material record" }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "source_uploaded",
    payload: { materialId: material.id, filename: originalFilename, materialType },
  });

  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);

  // Dispatch extraction job (fire and forget)
  void workerClient.extractMaterial(material.id, projectId).catch((err: unknown) => {
    console.error("Failed to dispatch extract-material job:", err);
  });

  return NextResponse.json({ materialId: material.id, storagePath });
}
