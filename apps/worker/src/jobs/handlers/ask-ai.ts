import {
  claude,
  buildAskAiSystemPrompt,
  buildAskAiUserMessage,
  getAvailableContextTokens,
  estimateTokens,
  selectChunksForBudget,
} from "@repo/core";
import type { AskAiPayload, ClaudeCallResult } from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

const ASK_AI_MODEL = "claude-opus-4-6";
const CONTEXT_RESERVE_TOKENS = 4000;

async function getProjectContextText(projectId: string, prompt: string): Promise<string | undefined> {
  const supabase = createAdminClient();

  const materials = assertData(
    await supabase.from("source_materials").select().eq("project_id", projectId),
  );

  if (materials.length === 0) return undefined;

  const materialIds = materials.map((material) => material.id);
  if (materialIds.length === 0) return undefined;

  const chunkRows = assertData(
    await supabase
      .from("source_chunks")
      .select()
      .in("material_id", materialIds)
      .order("chunk_index", { ascending: true }),
  );

  if (chunkRows.length === 0) return undefined;

  const availableTokens = getAvailableContextTokens(ASK_AI_MODEL);
  const promptTokens = estimateTokens(prompt);
  const chunkBudget = Math.max(0, availableTokens - promptTokens - CONTEXT_RESERVE_TOKENS);

  if (chunkBudget <= 0) return undefined;

  const chunksForBudget = chunkRows.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    estimatedTokens: chunk.estimated_tokens,
    summary: chunk.summary,
    chunkIndex: chunk.chunk_index,
  }));

  const selectedChunks = selectChunksForBudget(chunksForBudget, chunkBudget, true);
  if (selectedChunks.length === 0) return undefined;

  return selectedChunks
    .map((chunk, index) => `Chunk ${index + 1}:\n${chunk.content}`)
    .join("\n\n");
}

export async function askAi(payload: AskAiPayload, onChunk?: (chunk: string) => void): Promise<void> {
  const { prompt, userId, projectId } = payload;
  const supabase = createAdminClient();

  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId ?? null,
      user_id: userId,
      action: "agent_job_dispatched",
      payload: {
        kind: "ask_ai",
        hasProjectContext: Boolean(projectId),
        promptLength: prompt.length,
      },
    })
    .throwOnError();

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

    await supabase
      .from("audit_logs")
      .insert({
        project_id: projectId ?? null,
        user_id: userId,
        action: "agent_response_received",
        model_id: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        payload: {
          kind: "ask_ai",
          durationMs,
          hasProjectContext: Boolean(contextText),
        },
        prompt_snapshot: prompt,
        response_snapshot: result.content,
      })
      .throwOnError();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await supabase
      .from("audit_logs")
      .insert({
        project_id: projectId ?? null,
        user_id: userId,
        action: "agent_job_failed",
        payload: {
          kind: "ask_ai",
          error: errorMessage,
        },
        prompt_snapshot: prompt,
      })
      .throwOnError();

    throw error;
  }
}
