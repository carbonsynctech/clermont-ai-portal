import { db, projects, stages, versions, auditLogs } from "@repo/db";
import {
  claude,
  buildDevilsAdvocateSystemPrompt,
  buildDevilsAdvocateUserMessage,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function devilsAdvocate(projectId: string, userId: string): Promise<void> {
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

  // 3. Update stage 11 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)));

  const startedAt = Date.now();

  // 4. Call Claude
  const result = await claude.call({
    system: buildDevilsAdvocateSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildDevilsAdvocateUserMessage(
          humanReviewedVersion.content,
          project.masterPrompt
        ),
      },
    ],
    maxTokens: 4096,
  });

  const durationMs = Date.now() - startedAt;

  // 5. Insert red_report version
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 11,
      versionType: "red_report",
      internalLabel: "Devil's Advocate Report",
      content: result.content,
      wordCount: countWords(result.content),
      isClientVisible: false,
    })
    .returning();

  if (!newVersion) throw new Error("Failed to insert red_report version");

  // 6. Insert audit log
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

  // 7. Update stage 11 to awaiting_human (critique selection checkpoint)
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
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 11)));

  // 8. Stay at currentStage = 11 (user must select critiques before advancing)
  await db
    .update(projects)
    .set({ currentStage: 11, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
