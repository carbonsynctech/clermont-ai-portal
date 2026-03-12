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

export async function integrateCritiques(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
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

  // 4. Update stage 9 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 9)));

  const startedAt = Date.now();

  onChunk?.("Preparing critique integration input...\n");

  // 5. Integrate critiques (if any). For zero critiques, carry forward V5 as V6.
  const hasSelectedCritiques = selectedCritiques.length > 0;
  if (!hasSelectedCritiques) {
    onChunk?.("No critiques selected, carrying forward Step 7 output as Final V6.\n");
  }
  const result = hasSelectedCritiques
    ? await (onChunk
      ? claude.streamWithThinking(
        {
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
        },
        onChunk,
      )
      : claude.callWithThinking({
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
      }))
    : null;

  const durationMs = Date.now() - startedAt;
  const finalContent = result?.content ?? humanReviewedVersion.content;

  // 6. Insert final version
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 9,
      versionType: "final",
      internalLabel: hasSelectedCritiques ? "Final V6" : "Final V6 (No Critiques Selected)",
      content: finalContent,
      wordCount: countWords(finalContent),
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
  if (result) {
    await db.insert(auditLogs).values({
      projectId,
      userId,
      action: "agent_response_received",
      stepNumber: 9,
      modelId: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      payload: { durationMs, thinkingLength: result.thinking.length },
    });
  } else {
    await db.insert(auditLogs).values({
      projectId,
      userId,
      action: "stage_completed",
      stepNumber: 9,
      payload: {
        durationMs,
        selectedCritiquesCount: 0,
        reason: "No critiques selected; carried forward human-reviewed version",
      },
    });
  }

  // 9. Update stage 9 to completed
  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...(result?.model !== undefined && { modelId: result.model }),
        ...(result?.inputTokens !== undefined && { inputTokens: result.inputTokens }),
        ...(result?.outputTokens !== undefined && { outputTokens: result.outputTokens }),
        durationMs,
        selectedCritiquesCount: selectedCritiques.length,
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 9)));

  // 10. Advance project to stage 10
  await db
    .update(projects)
    .set({ currentStage: 10, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
