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

export async function finalStylePass(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  // 2. Fetch latest synthesis version (Step 5 canonical source)
  const synthesisVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "synthesis")
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!synthesisVersion) {
    throw new Error(`Project ${projectId} has no synthesis version`);
  }

  // 3. Fetch approved fact-check issues from Step 8 persisted metadata
  const step8 = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)),
  });

  const approvedIssuesRaw = step8?.metadata?.factCheckApprovedIssues;
  const approvedIssues = Array.isArray(approvedIssuesRaw)
    ? approvedIssuesRaw.filter((issue): issue is string => typeof issue === "string")
    : [];

  // 4. Fetch condensed rules from style guide
  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
  });

  const condensedRules = styleGuide?.condensedRulesText ?? "Apply professional investment memo standards: clear structure, consistent tone, concise language.";

  // 5. Update stage 9 to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 9)));

  const startedAt = Date.now();

  const issueBlock = approvedIssues.length
    ? `\n\nApproved fact-check corrections to integrate before final styling:\n${approvedIssues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}\n\nRequirements:\n- Integrate each approved correction into the memo where relevant.\n- Keep markdown structure and headings intact.\n- Preserve memo intent and readability while correcting factual claims.`
    : "\n\nNo approved fact-check corrections were selected. Apply only the final style pass.";

  // 6. Call Claude (streaming when callback is provided)
  const callOptions = {
    system: buildFinalStyleSystemPrompt(condensedRules),
    messages: [
      {
        role: "user" as const,
        content: `${buildFinalStyleUserMessage(synthesisVersion.content)}${issueBlock}`,
      },
    ],
    maxTokens: 8192,
  };
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  // 7. Insert final_styled version
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

  // 8. Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 9. Insert audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 9,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: {
      durationMs,
      factCheckIssuesIntegrated: approvedIssues.length,
    },
  });

  // 10. Update stage 9 to completed
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

  // 11. Update stage 10 to awaiting_human
  await db
    .update(stages)
    .set({ status: "awaiting_human", updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 10)));

  // 12. Advance project to stage 10
  await db
    .update(projects)
    .set({ currentStage: 10, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
