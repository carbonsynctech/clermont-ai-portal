// apps/worker/src/jobs/handlers/suggest-personas.ts
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
  tags?: string[];
}

export async function suggestPersonas(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.masterPrompt) throw new Error(`Project ${projectId} has no master prompt`);

  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 2)));

  const startedAt = Date.now();

  const callOptions = {
    system: buildPersonaSuggestionSystemPrompt(),
    messages: [
      { role: "user" as const, content: buildPersonaSuggestionUserMessage(project.masterPrompt) },
    ],
  };

  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  let suggestions: PersonaSuggestion[] = [];
  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Failed to parse persona suggestions from Claude response");
    }
    suggestions = JSON.parse(jsonMatch[0]) as PersonaSuggestion[];
  } catch (err) {
    throw err instanceof Error ? err : new Error("Failed to parse persona suggestions from Claude response");
  }

  if (suggestions.length > 0) {
    await db.insert(personas).values(
      suggestions.map((s) => ({
        projectId,
        name: s.name,
        description: s.description,
        systemPrompt: s.systemPrompt,
        tags: s.tags ?? [],
      }))
    );
  }

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
