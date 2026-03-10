import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, styleGuides } from "@repo/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_PRESET_IDS = ["corporate", "modern", "minimal", "executive"] as const;

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

  const body = (await req.json()) as { presetId?: string };

  if (!body.presetId || !VALID_PRESET_IDS.includes(body.presetId as (typeof VALID_PRESET_IDS)[number])) {
    return NextResponse.json({ error: "Invalid preset ID" }, { status: 400 });
  }

  const presetId = body.presetId;

  // Import presets at runtime to avoid bundling issues
  const { STYLE_PRESETS } = await import(
    "@/components/projects/steps/document-template"
  );

  const preset = STYLE_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 400 });
  }

  // Encode preset metadata in extractedRules using the existing shape
  const presetRules = {
    toneRules: [preset.condensedRules],
    formattingRules: [] as string[],
    vocabularyRules: [] as string[],
    structureRules: [`presetId:${presetId}`, `presetName:${preset.name}`],
    prohibitions: [] as string[],
  };

  // Check for existing style guide and update or create
  const existingStyleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });

  if (existingStyleGuide) {
    await db
      .update(styleGuides)
      .set({
        originalFilename: `preset:${presetId}`,
        storagePath: `preset:${presetId}`,
        condensedRulesText: preset.condensedRules,
        isProcessed: true,
        extractedRules: presetRules,
      })
      .where(eq(styleGuides.id, existingStyleGuide.id));
  } else {
    await db.insert(styleGuides).values({
      projectId,
      originalFilename: `preset:${presetId}`,
      storagePath: `preset:${presetId}`,
      condensedRulesText: preset.condensedRules,
      isProcessed: true,
      extractedRules: presetRules,
    });
  }

  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ presetId, presetName: preset.name });
}
