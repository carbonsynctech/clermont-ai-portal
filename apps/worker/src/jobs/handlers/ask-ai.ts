import { db, auditLogs, sourceMaterials } from "@repo/db";
import {
  claude,
  buildAskAiSystemPrompt,
  buildAskAiUserMessage,
  getAvailableContextTokens,
  estimateTokens,
  selectChunksForBudget,
} from "@repo/core";
import type { AskAiPayload, ClaudeCallResult } from "@repo/core";
import { eq } from "drizzle-orm";

const ASK_AI_MODEL = "claude-opus-4-6";
const CONTEXT_RESERVE_TOKENS = 4000;

async function getProjectContextText(projectId: string, prompt: string): Promise<string | undefined> {
  const materials = await db.query.sourceMaterials.findMany({
    where: eq(sourceMaterials.projectId, projectId),
  });

  if (materials.length === 0) return undefined;

  const materialIds = materials.map((material) => material.id);
  if (materialIds.length === 0) return undefined;

  const chunkRows = await db.query.sourceChunks.findMany({
    where: (chunk, { inArray }) => inArray(chunk.materialId, materialIds),
    orderBy: (chunk, { asc }) => [asc(chunk.chunkIndex)],
  });

  if (chunkRows.length === 0) return undefined;

  const availableTokens = getAvailableContextTokens(ASK_AI_MODEL);
  const promptTokens = estimateTokens(prompt);
  const chunkBudget = Math.max(0, availableTokens - promptTokens - CONTEXT_RESERVE_TOKENS);

  if (chunkBudget <= 0) return undefined;

  const chunksForBudget = chunkRows.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    estimatedTokens: chunk.estimatedTokens,
    summary: chunk.summary,
    chunkIndex: chunk.chunkIndex,
  }));

  const selectedChunks = selectChunksForBudget(chunksForBudget, chunkBudget, true);
  if (selectedChunks.length === 0) return undefined;

  return selectedChunks
    .map((chunk, index) => `Chunk ${index + 1}:\n${chunk.content}`)
    .join("\n\n");
}

export async function askAi(payload: AskAiPayload, onChunk?: (chunk: string) => void): Promise<void> {
  const { prompt, userId, projectId } = payload;

  await db.insert(auditLogs).values({
    projectId: projectId ?? null,
    userId,
    action: "agent_job_dispatched",
    payload: {
      kind: "ask_ai",
      hasProjectContext: Boolean(projectId),
      promptLength: prompt.length,
    },
  });

  const startedAt = Date.now();
  const contextText = projectId ? await getProjectContextText(projectId, prompt) : undefined;

  try {
    let result: ClaudeCallResult;
    if (onChunk) {
      result = await claude.stream(
        {
          system: buildAskAiSystemPrompt(Boolean(contextText)),
          messages: [{ role: "user", content: buildAskAiUserMessage(prompt, contextText) }],
          model: ASK_AI_MODEL,
        },
        onChunk,
      );
    } else {
      result = await claude.call({
        system: buildAskAiSystemPrompt(Boolean(contextText)),
        messages: [{ role: "user", content: buildAskAiUserMessage(prompt, contextText) }],
        model: ASK_AI_MODEL,
      });
    }

    const durationMs = Date.now() - startedAt;

    await db.insert(auditLogs).values({
      projectId: projectId ?? null,
      userId,
      action: "agent_response_received",
      modelId: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      payload: {
        kind: "ask_ai",
        durationMs,
        hasProjectContext: Boolean(contextText),
      },
      promptSnapshot: prompt,
      responseSnapshot: result.content,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.insert(auditLogs).values({
      projectId: projectId ?? null,
      userId,
      action: "agent_job_failed",
      payload: {
        kind: "ask_ai",
        error: errorMessage,
      },
      promptSnapshot: prompt,
    });

    throw error;
  }
}
