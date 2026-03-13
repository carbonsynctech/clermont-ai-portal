import {
  claude,
  buildDevilsAdvocateSystemPrompt,
  buildDevilsAdvocateUserMessage,
  parseCritiques,
} from "@repo/core";
import type { Json } from "@repo/db";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

export async function devilsAdvocate(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch project
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  if (!project.master_prompt) throw new Error(`Project ${projectId} has no master prompt`);

  // 2. Fetch human_reviewed version
  const humanReviewedVersion = assertData(
    await supabase
      .from("versions")
      .select()
      .eq("project_id", projectId)
      .eq("version_type", "human_reviewed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  );

  // 3. Update stage 8 to running
  await supabase
    .from("stages")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("step_number", 8)
    .throwOnError();

  const startedAt = Date.now();

  // 4. Call Claude (streaming when callback is provided)
  const callOptions = {
    system: buildDevilsAdvocateSystemPrompt(),
    messages: [
      {
        role: "user" as const,
        content: buildDevilsAdvocateUserMessage(
          humanReviewedVersion.content,
          project.master_prompt
        ),
      },
    ],
    maxTokens: 4096,
  };
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  const parsedCritiques = parseCritiques(result.content).map((critique) => ({
    id: critique.id,
    title: critique.title,
    detail: critique.detail,
    isCustom: false,
  }));
  const savedAt = new Date().toISOString();

  // 5. Insert audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 8,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs, generatedCritiquesCount: parsedCritiques.length },
      response_snapshot: result.content,
    })
    .throwOnError();

  // 6. Update stage 8 to awaiting_human (critique selection checkpoint)
  await supabase
    .from("stages")
    .update({
      status: "awaiting_human",
      updated_at: new Date().toISOString(),
      metadata: {
        modelId: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
        selectedCritiquesCount: 0,
        devilsAdvocateDraft: {
          critiques: parsedCritiques,
          selectedIds: [],
          selectedCritiques: [],
          savedAt,
        },
      } as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 8)
    .throwOnError();

  // 7. Stay at current_stage = 8 (user must select critiques before advancing)
  await supabase
    .from("projects")
    .update({ current_stage: 8, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
