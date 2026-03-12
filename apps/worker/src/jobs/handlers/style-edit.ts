import { PDFParse } from "pdf-parse";
import { db, projects, stages, versions, styleGuides, auditLogs } from "@repo/db";
import {
  claude,
  buildStyleEditSystemPrompt,
  buildStyleEditUserMessage,
  parseStyleEditResponse,
} from "@repo/core";
import { eq, and, desc } from "drizzle-orm";
import { createAdminClient } from "../../lib/supabase-admin";

export async function styleEdit(projectId: string, userId: string, onChunk?: (chunk: string) => void): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  // 2. Update stage 11 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)));

  const startedAt = Date.now();

  // Step 6: Extract style guide text
  // 3. Fetch most recent style guide
  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });

  if (!styleGuide) throw new Error(`Project ${projectId} has no style guide`);

  // 4. Download style guide file
  const adminSupabase = createAdminClient();
  const { data: fileData, error: downloadError } = await adminSupabase.storage
    .from("source-materials")
    .download(styleGuide.storagePath);

  if (downloadError ?? !fileData) {
    throw new Error(`Failed to download style guide: ${String(downloadError?.message)}`);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let styleGuideText: string;
  if (
    styleGuide.originalFilename.toLowerCase().endsWith(".pdf") ||
    buffer[0] === 0x25 // PDF magic byte %
  ) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    styleGuideText = result.text;
    await parser.destroy();
  } else {
    styleGuideText = buffer.toString("utf-8");
  }

  // Step 7: Fetch synthesis version to edit
  // 5. Get synthesis version (activeVersionId or latest synthesis)
  let synthesisContent: string;
  if (project.activeVersionId) {
    const activeVersion = await db.query.versions.findFirst({
      where: eq(versions.id, project.activeVersionId),
    });
    synthesisContent = activeVersion?.content ?? "";
  } else {
    const latestSynthesis = await db.query.versions.findFirst({
      where: and(
        eq(versions.projectId, projectId),
        eq(versions.versionType, "synthesis")
      ),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
    });
    synthesisContent = latestSynthesis?.content ?? "";
  }

  if (!synthesisContent) {
    throw new Error(`Project ${projectId} has no synthesis version to edit`);
  }

  // 6. Call Claude: extract rules + apply in one pass
  const callOptions = {
    system: buildStyleEditSystemPrompt(),
    messages: [
      {
        role: "user" as const,
        content: buildStyleEditUserMessage(styleGuideText, synthesisContent),
      },
    ],
    maxTokens: 8192,
  };
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  // 7. Parse XML response (only rules are used; Step 7 no longer persists a styled text version)
  const { rules } = parseStyleEditResponse(result.content);

  // 8. Update style guide with extracted rules
  await db
    .update(styleGuides)
    .set({
      condensedRulesText: rules,
      isProcessed: true,
    })
    .where(eq(styleGuides.id, styleGuide.id));

  // 9. Keep active version unchanged (Step 7 is display/style metadata only)
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 11. Audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 11,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs },
  });

  // 12. Update stage 11 to completed
  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        modelId: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)));

  // 13. Advance project to stage 12
  await db
    .update(projects)
    .set({ currentStage: 12, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
