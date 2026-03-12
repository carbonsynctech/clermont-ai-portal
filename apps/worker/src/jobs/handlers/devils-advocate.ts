import { db, projects, stages, versions, auditLogs } from "@repo/db";
import {
  claude,
  buildDevilsAdvocateSystemPrompt,
  buildDevilsAdvocateUserMessage,
  parseCritiques,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

export async function devilsAdvocate(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.masterPrompt) throw new Error(`Project ${projectId} has no master prompt`);

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

  // 3. Update stage 8 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  const startedAt = Date.now();

  // 4. Call Claude (streaming when callback is provided)
  const callOptions = {
    system: buildDevilsAdvocateSystemPrompt(),
    messages: [
      {
        role: "user" as const,
        content: buildDevilsAdvocateUserMessage(
          humanReviewedVersion.content,
          project.masterPrompt
        ),
      },
    ],
    maxTokens: 4096,
  };
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  const parsedCritiques = parseCritiques(result.content).map((critique) => ({
    id: critique.id,
    title: critique.title,
    detail: critique.detail,
    isCustom: false,
  }));
  const savedAt = new Date().toISOString();

  // 5. Insert audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 8,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, generatedCritiquesCount: parsedCritiques.length },
    responseSnapshot: result.content,
  });

  // 6. Update stage 8 to awaiting_human (critique selection checkpoint)
  await db
    .update(stages)
    .set({
      status: "awaiting_human",
      updatedAt: new Date(),
      metadata: {
        modelId: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
        selectedCritiquesCount: 0,
        devilsAdvocateDraft: {
          critiques: parsedCritiques,
          selectedIds: [],
          selectedCritiques: [],
          savedAt,
        },
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  // 7. Stay at currentStage = 8 (user must select critiques before advancing)
  await db
    .update(projects)
    .set({ currentStage: 8, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
