import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects } from "@repo/db";
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

  const body = (await req.json()) as { filename: string; contentType: string };
  const { filename, contentType } = body;

  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType are required" }, { status: 400 });
  }

  // Sanitize filename to ASCII-safe characters to prevent JWT signature mismatches
  // when Supabase signed URLs encode special chars differently than the browser.
  // Original filename is preserved in source_materials.originalFilename.
  const safeFilename = filename
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // smart single quotes → apostrophe
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')    // smart double quotes
    .replace(/[\u2013\u2014]/g, "-")                 // en/em dashes
    .replace(/[^\w.\-]/g, "_")                       // anything non-alphanumeric → underscore
    .replace(/_{2,}/g, "_")                          // collapse consecutive underscores
    .replace(/^_|_(?=\.\w+$)/g, "");                 // trim leading _ and _ before extension

  const storagePath = `${user.id}/${projectId}/${randomUUID()}-${safeFilename}`;
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase.storage
    .from("source-materials")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("Failed to create signed upload URL:", error);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
  });
}
