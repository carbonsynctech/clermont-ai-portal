import { db, projects, stages, personas, auditLogs } from "@repo/db";
import {
  claude,
  buildPersonaSuggestionSystemPrompt,
  buildPersonaSuggestionUserMessage,
} from "@repo/core";
import { eq, and } from "drizzle-orm";

interface PersonaSuggestion {
  name: string;
  description: string;
  systemPrompt: string;
}

export async function suggestPersonas(projectId: string, userId: string): Promise<void> {
  // 1. Fetch project and master prompt
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.masterPrompt) throw new Error(`Project ${projectId} has no master prompt`);

  // 2. Update stage to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));

  const startedAt = Date.now();

  // 3. Call Claude for persona suggestions
  const result = await claude.call({
    system: buildPersonaSuggestionSystemPrompt(),
    messages: [
      { role: "user", content: buildPersonaSuggestionUserMessage(project.masterPrompt) },
    ],
  });

  const durationMs = Date.now() - startedAt;

  // 4. Parse suggestions
  let suggestions: PersonaSuggestion[] = [];
  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]) as PersonaSuggestion[];
    }
  } catch {
    throw new Error("Failed to parse persona suggestions from Claude response");
  }

  // 5. Insert personas
  if (suggestions.length > 0) {
    await db.insert(personas).values(
      suggestions.map((s) => ({
        projectId,
        name: s.name,
        description: s.description,
        systemPrompt: s.systemPrompt,
      }))
    );
  }

  // 6. Write audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 2,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, personaCount: suggestions.length },
  });

  // 7. Update stage - awaiting human selection
  await db
    .update(stages)
    .set({
      status: "awaiting_human",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        modelId: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
      },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));
}
