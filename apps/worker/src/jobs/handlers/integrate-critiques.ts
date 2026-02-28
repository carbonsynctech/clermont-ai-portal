import { db, projects, stages, versions, auditLogs } from "@repo/db";
import {
  claude,
  buildCritiqueIntegrationSystemPrompt,
  buildCritiqueIntegrationUserMessage,
} from "@repo/core";
import { eq, and, desc } from "drizzle-orm";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function integrateCritiques(projectId: string, userId: string): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  // 2. Fetch human_reviewed version
  const humanReviewedVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "human_reviewed")
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!humanReviewedVersion) {
    throw new Error(`Project ${projectId} has no human-reviewed version`);
  }

  // 3. Fetch selected critiques from most recent critique_selected audit log
  const critiqueLog = await db.query.auditLogs.findFirst({
    where: and(
      eq(auditLogs.projectId, projectId),
      eq(auditLogs.action, "critique_selected")
    ),
    orderBy: (al, { desc }) => [desc(al.createdAt)],
  });

  if (!critiqueLog) {
    throw new Error(`Project ${projectId} has no critique selection audit log`);
  }

  const logPayload = critiqueLog.payload as { selectedCritiques: string[] } | null;
  const selectedCritiques = logPayload?.selectedCritiques ?? [];

  if (selectedCritiques.length === 0) {
    throw new Error(`Project ${projectId} has no selected critiques`);
  }

  // 4. Update stage 12 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 12)));

  const startedAt = Date.now();

  // 5. Call Claude with extended thinking (10k budget per architecture rules)
  const result = await claude.callWithThinking({
    system: buildCritiqueIntegrationSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildCritiqueIntegrationUserMessage(
          humanReviewedVersion.content,
          selectedCritiques
        ),
      },
    ],
    maxTokens: 18192, // 8192 output + 10000 thinking budget
  });

  const durationMs = Date.now() - startedAt;

  // 6. Insert final version
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 12,
      versionType: "final",
      internalLabel: "Final V6",
      content: result.content,
      wordCount: countWords(result.content),
      isClientVisible: false,
    })
    .returning();

  if (!newVersion) throw new Error("Failed to insert final version");

  // 7. Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 8. Insert audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 12,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, thinkingLength: result.thinking.length },
  });

  // 9. Update stage 12 to completed
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
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 12)));

  // 10. Advance project to stage 13
  await db
    .update(projects)
    .set({ currentStage: 13, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
