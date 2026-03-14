import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: styleGuide } = await supabase
    .from("style_guides")
    .select()
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .single();

  if (!styleGuide?.cover_images) {
    return NextResponse.json({ images: [], selectedStyle: null, styleGuideId: styleGuide?.id ?? null });
  }

  const adminClient = createAdminClient();
  const coverData = styleGuide.cover_images as {
    images: Array<{ style: string; storagePath: string; mimeType: string }>;
    selectedStyle: string | null;
    generatedAt: string;
  };

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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: styleGuide } = await supabase
    .from("style_guides")
    .select()
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .single();
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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();
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

  const { data: styleGuide } = await supabase
    .from("style_guides")
    .select()
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .single();
  if (!styleGuide?.cover_images) {
    return NextResponse.json({ error: "No cover images generated yet" }, { status: 400 });
  }

  const coverImages = styleGuide.cover_images as {
    images: Array<{ style: string; storagePath: string; mimeType: string }>;
    selectedStyle: string | null;
    generatedAt: string;
  };

  await supabase
    .from("style_guides")
    .update({
      cover_images: {
        ...coverImages,
        selectedStyle: body.selectedStyle as "corporate" | "modern" | "minimal" | "bold",
      },
    })
    .eq("id", styleGuide.id);

  return NextResponse.json({ ok: true });
}
