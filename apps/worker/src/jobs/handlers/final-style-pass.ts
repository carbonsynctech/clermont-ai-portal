import { db, projects, stages, versions, styleGuides, auditLogs } from "@repo/db";
import {
  claude,
  buildFinalStyleSystemPrompt,
  buildFinalStyleUserMessage,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function finalStylePass(projectId: string, userId: string): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  // 2. Fetch latest fact_checked version
  const factCheckedVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "fact_checked")
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!factCheckedVersion) {
    throw new Error(`Project ${projectId} has no fact-checked version`);
  }

  // 3. Fetch condensed rules from style guide
  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });

  const condensedRules = styleGuide?.condensedRulesText ?? "Apply professional investment memo standards: clear structure, consistent tone, concise language.";

  // 4. Update stage 9 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 9)));

  const startedAt = Date.now();

  // 5. Call Claude
  const result = await claude.call({
    system: buildFinalStyleSystemPrompt(condensedRules),
    messages: [
      {
        role: "user",
        content: buildFinalStyleUserMessage(factCheckedVersion.content),
      },
    ],
    maxTokens: 8192,
  });

  const durationMs = Date.now() - startedAt;

  // 6. Insert final_styled version
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 9,
      versionType: "final_styled",
      internalLabel: "Final Styled V4",
      content: result.content,
      wordCount: countWords(result.content),
      isClientVisible: false,
    })
    .returning();

  if (!newVersion) throw new Error("Failed to insert final_styled version");

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
    stepNumber: 9,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs },
  });

  // 9. Update stage 9 to completed
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
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 9)));

  // 10. Update stage 10 to awaiting_human
  await db
    .update(stages)
    .set({ status: "awaiting_human", updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 10)));

  // 11. Advance project to stage 10
  await db
    .update(projects)
    .set({ currentStage: 10, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
