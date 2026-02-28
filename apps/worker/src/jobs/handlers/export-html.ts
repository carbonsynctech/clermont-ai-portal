import { db, projects, stages, versions, auditLogs } from "@repo/db";
import {
  claude,
  buildHtmlExportSystemPrompt,
  buildHtmlExportUserMessage,
} from "@repo/core";
import { eq, and } from "drizzle-orm";
import type { ProjectBriefData } from "@repo/db";

export async function exportHtml(projectId: string, userId: string): Promise<void> {
  // 1. Fetch project + brief data
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  const brief = project.briefData as ProjectBriefData | null;
  if (!brief) throw new Error(`Project ${projectId} has no brief data`);

  // 2. Fetch final version
  const finalVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "final")
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!finalVersion) {
    throw new Error(`Project ${projectId} has no final version`);
  }

  // 3. Update stage 13 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 13)));

  const startedAt = Date.now();

  // 4. Call Claude to generate HTML
  const result = await claude.call({
    system: buildHtmlExportSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildHtmlExportUserMessage(finalVersion.content, {
          companyName: brief.companyName ?? brief.organizationName ?? brief.systemProductName ?? "Document",
          dealType: brief.dealType ?? brief.documentType ?? "",
          targetAudience: brief.targetAudience,
        }),
      },
    ],
    maxTokens: 8192,
  });

  const durationMs = Date.now() - startedAt;

  // 5. Insert exported_html version (client-visible)
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 13,
      versionType: "exported_html",
      internalLabel: "Export HTML V7",
      content: result.content,
      wordCount: 0,
      isClientVisible: true,
    })
    .returning();

  if (!newVersion) throw new Error("Failed to insert exported_html version");

  // 6. Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 7. Insert audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "export_requested",
    stepNumber: 13,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs },
  });

  // 8. Update stage 13 to completed
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
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 13)));

  // 9. Mark project as completed
  await db
    .update(projects)
    .set({ status: "completed", currentStage: 13, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
