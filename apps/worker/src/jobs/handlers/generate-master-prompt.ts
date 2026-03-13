import type { StageMetadata, Json, ProjectBriefData } from "@repo/db";
import { claude, buildMasterPromptSystemPrompt, buildMasterPromptUserMessage } from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

export async function generateMasterPrompt(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch project and brief data
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  if (!project.brief_data) throw new Error(`Project ${projectId} has no brief data`);

  // 2. Update stage to running
  await supabase
    .from("stages")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("step_number", 1)
    .throwOnError();

  const startedAt = Date.now();

  // 3. Call Claude (streaming if a chunk callback is provided)
  const callOptions = {
    system: buildMasterPromptSystemPrompt(),
    messages: [{ role: "user" as const, content: buildMasterPromptUserMessage(project.brief_data as unknown as ProjectBriefData) }],
  };
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);

  const durationMs = Date.now() - startedAt;

  // 4. Write master prompt to project
  await supabase
    .from("projects")
    .update({ master_prompt: result.content, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 5. Write audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 1,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs },
    })
    .throwOnError();

  // 6. Update stage to completed
  const metadata: StageMetadata = {
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs,
  };
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: metadata as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 1)
    .throwOnError();

  // 7. Advance project stage
  await supabase
    .from("projects")
    .update({ current_stage: 2, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
