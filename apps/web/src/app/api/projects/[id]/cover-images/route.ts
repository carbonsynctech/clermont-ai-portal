import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db, projects, styleGuides } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { workerClient } from "@/lib/worker-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET — return signed URLs for already-generated cover images
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });

  if (!styleGuide?.coverImages) {
    return NextResponse.json({ images: [], selectedStyle: null, styleGuideId: styleGuide?.id ?? null });
  }

  const adminClient = createAdminClient();
  const coverData = styleGuide.coverImages;

  // Generate signed URLs (1 hour expiry)
  const imagesWithUrls = await Promise.all(
    coverData.images.map(async (img) => {
      const { data } = await adminClient.storage
        .from("source-materials")
        .createSignedUrl(img.storagePath, 3600);

      return {
        style: img.style,
        signedUrl: data?.signedUrl ?? null,
        mimeType: img.mimeType,
      };
    }),
  );

  return NextResponse.json({
    styleGuideId: styleGuide.id,
    images: imagesWithUrls.filter((img) => img.signedUrl !== null),
    selectedStyle: coverData.selectedStyle,
    generatedAt: coverData.generatedAt,
  });
}

// POST — trigger cover image generation job
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });
  if (!styleGuide) {
    return NextResponse.json({ error: "No style guide uploaded yet" }, { status: 400 });
  }

  try {
    const result = await workerClient.generateCoverImages(projectId, user.id, styleGuide.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// PATCH — update selectedStyle
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { selectedStyle?: unknown };
  try {
    const raw: unknown = await req.json();
    body = (typeof raw === "object" && raw !== null ? raw : {}) as { selectedStyle?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validStyles = ["corporate", "modern", "minimal", "bold"];
  if (typeof body.selectedStyle !== "string" || !validStyles.includes(body.selectedStyle)) {
    return NextResponse.json({ error: "Invalid selectedStyle" }, { status: 400 });
  }

  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });
  if (!styleGuide?.coverImages) {
    return NextResponse.json({ error: "No cover images generated yet" }, { status: 400 });
  }

  await db
    .update(styleGuides)
    .set({
      coverImages: {
        ...styleGuide.coverImages,
        selectedStyle: body.selectedStyle as "corporate" | "modern" | "minimal" | "bold",
      },
    })
    .where(eq(styleGuides.id, styleGuide.id));

  return NextResponse.json({ ok: true });
}
