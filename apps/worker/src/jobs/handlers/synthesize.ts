import { db, projects, stages, versions, personas, auditLogs } from "@repo/db";
import {
  claude,
  buildSynthesisSystemPrompt,
  buildSynthesisUserMessage,
  estimateTokens,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

const MAX_DRAFT_TOKENS = 120000;

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function synthesize(projectId: string, userId: string): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.masterPrompt) throw new Error(`Project ${projectId} has no master prompt`);

  // 2. Update stage to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 5)));

  const startedAt = Date.now();

  // 3. Fetch persona draft versions with persona names
  const draftVersions = await db.query.versions.findMany({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "persona_draft")
    ),
    orderBy: (v, { asc }) => [asc(v.createdAt)],
  });

  if (draftVersions.length === 0) {
    throw new Error(`Project ${projectId} has no persona draft versions`);
  }

  // Fetch persona names
  const personaRows = await db.query.personas.findMany({
    where: eq(personas.projectId, projectId),
  });
  const personaMap = Object.fromEntries(personaRows.map((p) => [p.id, p.name]));

  // 4. Build drafts array, truncate proportionally if total tokens exceed limit
  let drafts = draftVersions.map((v) => ({
    personaName: v.personaId ? (personaMap[v.personaId] ?? v.internalLabel) : v.internalLabel,
    content: v.content,
  }));

  const totalTokens = drafts.reduce((sum, d) => sum + estimateTokens(d.content), 0);
  if (totalTokens > MAX_DRAFT_TOKENS) {
    const ratio = MAX_DRAFT_TOKENS / totalTokens;
    drafts = drafts.map((d) => ({
      ...d,
      content: d.content.slice(0, Math.floor(d.content.length * ratio)),
    }));
  }

  // 5. Call Claude with extended thinking
  const result = await claude.callWithThinking({
    system: buildSynthesisSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildSynthesisUserMessage(project.masterPrompt, drafts),
      },
    ],
    maxTokens: 18192, // 8192 output + 10000 thinking budget
  });

  const durationMs = Date.now() - startedAt;

  // 6. Insert synthesis version
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 5,
      versionType: "synthesis",
      internalLabel: "Synthesis V1",
      content: result.content,
      wordCount: countWords(result.content),
      isClientVisible: false,
    })
    .returning();

  if (!newVersion) throw new Error("Failed to insert synthesis version");

  // 7. Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 8. Audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 5,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, thinkingLength: result.thinking.length },
  });

  // 9. Update stage to completed
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
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 5)));

  // 10. Advance project to stage 6
  await db
    .update(projects)
    .set({ currentStage: 6, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
