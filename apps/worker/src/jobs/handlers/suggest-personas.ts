// apps/worker/src/jobs/handlers/suggest-personas.ts
import type { StageMetadata, Json } from "@repo/db";
import {
  claude,
  buildPersonaSuggestionSystemPrompt,
  buildPersonaSuggestionUserMessage,
} from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

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
  const supabase = createAdminClient();

  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  if (!project.master_prompt) throw new Error(`Project ${projectId} has no master prompt`);

  await supabase
    .from("stages")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("step_number", 2)
    .throwOnError();

  const startedAt = Date.now();

  const callOptions = {
    system: buildPersonaSuggestionSystemPrompt(),
    messages: [
      { role: "user" as const, content: buildPersonaSuggestionUserMessage(project.master_prompt) },
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
    await supabase
      .from("personas")
      .insert(
        suggestions.map((s) => ({
          project_id: projectId,
          name: s.name,
          description: s.description,
          system_prompt: s.systemPrompt,
          tags: s.tags ?? [],
        }))
      )
      .throwOnError();
  }

  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 2,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs, personaCount: suggestions.length },
    })
    .throwOnError();

  const metadata: StageMetadata = {
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs,
  };
  await supabase
    .from("stages")
    .update({
      status: "awaiting_human",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: metadata as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 2)
    .throwOnError();
}
