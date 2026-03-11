import { db, projects, stages, versions, personas, sourceChunks, sourceMaterials, auditLogs } from "@repo/db";
import {
  claude,
  buildSynthesisSystemPrompt,
  buildSynthesisUserMessage,
  estimateTokens,
  selectChunksForBudget,
  getAvailableContextTokens,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function synthesize(
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

  onChunk?.("Preparing synthesis input...\n");

  // 2. Update stage to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 5)));

  const startedAt = Date.now();

  // 3. Clear any existing synthesis versions so re-runs produce a fresh memo
  const existingSynthesis = await db.query.versions.findMany({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "synthesis")),
  });
  if (existingSynthesis.length > 0) {
    await db
      .delete(versions)
      .where(and(eq(versions.projectId, projectId), eq(versions.versionType, "synthesis")));
    onChunk?.(`Cleared ${existingSynthesis.length} previous synthesis version(s).\n`);
  }

  // 4. Fetch persona opinion versions with persona names
  const opinionVersions = await db.query.versions.findMany({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "persona_draft")
    ),
    orderBy: (v, { asc }) => [asc(v.createdAt)],
  });

  if (opinionVersions.length === 0) {
    throw new Error(`Project ${projectId} has no persona opinion versions`);
  }

  onChunk?.(`Loaded ${opinionVersions.length} persona opinions.\n`);

  // Fetch persona names
  const personaRows = await db.query.personas.findMany({
    where: eq(personas.projectId, projectId),
  });
  const personaMap = Object.fromEntries(personaRows.map((p) => [p.id, p.name]));

  // 4. Build opinions array
  const opinions = opinionVersions.map((v) => ({
    personaName: v.personaId ? (personaMap[v.personaId] ?? v.internalLabel) : v.internalLabel,
    content: v.content,
  }));

  // 5. Load source chunks for direct inclusion
  const materials = await db.query.sourceMaterials.findMany({
    where: eq(sourceMaterials.projectId, projectId),
  });

  const materialIds = materials.map((m) => m.id);

  let allChunks: Array<{ id: string; content: string; estimatedTokens: number; chunkIndex: number; summary?: string | null }> = [];

  if (materialIds.length > 0) {
    const chunkRows = await db.query.sourceChunks.findMany({
      where: (c, { inArray }) => inArray(c.materialId, materialIds),
      orderBy: (c, { asc }) => [asc(c.chunkIndex)],
    });
    allChunks = chunkRows.map((c) => ({
      id: c.id,
      content: c.content,
      estimatedTokens: c.estimatedTokens,
      chunkIndex: c.chunkIndex,
      summary: c.summary,
    }));
  }

  // 6. Calculate token budget for source chunks
  const opinionsTokens = opinions.reduce((sum, o) => sum + estimateTokens(o.content), 0);
  const masterPromptTokens = estimateTokens(project.masterPrompt);
  const availableTokens = getAvailableContextTokens("claude-sonnet-4-6");
  const chunkBudget = availableTokens - masterPromptTokens - opinionsTokens - 4000;
  const selectedChunks = selectChunksForBudget(allChunks, chunkBudget);

  onChunk?.(
    `Selected ${selectedChunks.length} source chunks (${Math.max(chunkBudget, 0)} token budget).\n`,
  );

  onChunk?.("Writing investment memo with Claude extended thinking...\n");

  // 7. Call Claude with extended thinking
  const result = await claude.callWithThinking({
    system: buildSynthesisSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildSynthesisUserMessage(project.masterPrompt, opinions, selectedChunks),
      },
    ],
    maxTokens: 18192, // 8192 output + 10000 thinking budget
  });

  const durationMs = Date.now() - startedAt;
  onChunk?.(`Memo written in ${Math.round(durationMs / 1000)}s. Saving version...\n`);

  // 8. Insert synthesis version
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

  onChunk?.("Synthesis version saved. Finalizing stage...\n");

  // 9. Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 10. Audit log
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

  // 11. Update stage to completed
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

  // 12. Advance project to stage 6
  await db
    .update(projects)
    .set({ currentStage: 6, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
