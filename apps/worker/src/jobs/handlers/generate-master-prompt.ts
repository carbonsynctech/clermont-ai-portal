import { db, projects, stages, auditLogs } from "@repo/db";
import { claude, buildMasterPromptSystemPrompt, buildMasterPromptUserMessage } from "@repo/core";
import { eq, and } from "drizzle-orm";

export async function generateMasterPrompt(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  // 1. Fetch project and brief data
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.briefData) throw new Error(`Project ${projectId} has no brief data`);

  // 2. Update stage to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 1)));

  const startedAt = Date.now();

  // 3. Call Claude (streaming if a chunk callback is provided)
  const callOptions = {
    system: buildMasterPromptSystemPrompt(),
    messages: [{ role: "user" as const, content: buildMasterPromptUserMessage(project.briefData) }],
  };
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  // 4. Write master prompt to project
  await db
    .update(projects)
    .set({ masterPrompt: result.content, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 5. Write audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 1,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs },
  });

  // 6. Update stage to completed
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
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 1)));

  // 7. Advance project stage
  await db
    .update(projects)
    .set({ currentStage: 2, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
