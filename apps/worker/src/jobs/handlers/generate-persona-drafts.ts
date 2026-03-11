import { db, projects, stages, personas, versions, sourceChunks, sourceMaterials, auditLogs } from "@repo/db";
import {
  claude,
  buildPersonaDraftSystemPrompt,
  buildPersonaDraftUserMessage,
  selectChunksForBudget,
  getAvailableContextTokens,
  estimateTokens,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function generatePersonaDrafts(
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

  onChunk?.("Preparing persona draft generation...\n");

  // 2. Update stage to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 4)));

  const startedAt = Date.now();

  // 3. Clear any existing persona_draft versions so re-runs produce fresh opinions
  const existingDrafts = await db.query.versions.findMany({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "persona_draft")),
  });

  if (existingDrafts.length > 0) {
    await db
      .delete(versions)
      .where(and(eq(versions.projectId, projectId), eq(versions.versionType, "persona_draft")));
    onChunk?.(`Cleared ${existingDrafts.length} previous persona drafts.\n`);
  }

  // 4. Fetch selected personas ordered by selectionOrder
  const selectedPersonas = await db.query.personas.findMany({
    where: and(eq(personas.projectId, projectId), eq(personas.isSelected, true)),
    orderBy: (p, { asc }) => [asc(p.selectionOrder)],
  });

  if (selectedPersonas.length === 0) {
    throw new Error(`Project ${projectId} has no selected personas`);
  }

  onChunk?.(`Found ${selectedPersonas.length} selected personas.\n`);

  // 5. Fetch all source chunks for this project (via source_materials)
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

  // 5. Select chunks within token budget (leave room for master prompt + system + response)
  const masterPromptTokens = estimateTokens(project.masterPrompt);
  const availableTokens = getAvailableContextTokens("claude-opus-4-6");
  const chunkBudget = availableTokens - masterPromptTokens - 4000; // reserve for system + response
  const selectedChunks = selectChunksForBudget(allChunks, chunkBudget);

  onChunk?.(
    `Selected ${selectedChunks.length} source chunks for context (${Math.max(
      chunkBudget,
      0,
    )} token budget).\n\nStarting parallel persona draft generation...\n`,
  );

  // 6. Run all 5 persona drafts in parallel
  const results = await Promise.all(
    selectedPersonas.map((persona) =>
      (async () => {
        onChunk?.(`\n[${persona.name}] Generating opinion points...\n`);
        const result = await claude.call({
          system: buildPersonaDraftSystemPrompt(persona.name, persona.systemPrompt),
          messages: [
            {
              role: "user",
              content: buildPersonaDraftUserMessage(project.masterPrompt!, selectedChunks),
            },
          ],
          maxTokens: 1024,
        });
        onChunk?.(
          `[${persona.name}] Completed (${result.outputTokens} output tokens).\n`,
        );
        return result;
      })()
    )
  );

  const durationMs = Date.now() - startedAt;
  onChunk?.(`\nAll persona opinions completed in ${Math.round(durationMs / 1000)}s.\n`);

  // 7. Insert a version row for each persona draft
  for (let i = 0; i < selectedPersonas.length; i++) {
    const persona = selectedPersonas[i]!;
    const result = results[i]!;

    await db.insert(versions).values({
      projectId,
      producedByStep: 4,
      versionType: "persona_draft",
      personaId: persona.id,
      internalLabel: `Opinions – ${persona.name}`,
      content: result.content,
      wordCount: countWords(result.content),
      isClientVisible: false,
    });

    // Audit log per draft
    await db.insert(auditLogs).values({
      projectId,
      userId,
      action: "agent_response_received",
      stepNumber: 4,
      modelId: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      payload: { personaName: persona.name, durationMs },
    });
  }

  // 8. Update stage to completed
  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: { durationMs },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 4)));

  // 9. Advance project to stage 5
  await db
    .update(projects)
    .set({ currentStage: 5, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
