import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, sourceMaterials, auditLogs } from "@repo/db";
import { workerClient } from "@/lib/worker-client";
import { eq, and } from "drizzle-orm";

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

  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Dispatch extraction job (fire and forget)
  void workerClient.extractMaterial(material.id, projectId).catch((err: unknown) => {
    console.error("Failed to dispatch extract-material job:", err);
  });

  return NextResponse.json({ materialId: material.id, storagePath });
}
