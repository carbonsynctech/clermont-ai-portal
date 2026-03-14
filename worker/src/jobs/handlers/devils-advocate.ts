import {
  openai,
  buildDevilsAdvocateSystemPrompt,
  buildDevilsAdvocateUserMessage,
} from "@repo/lib";
import type { Json } from "@repo/db";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

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

  // 4. Call OpenAI to generate full Red Report (streaming when callback is provided)
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
    maxTokens: 8192,
  };
  const result = onChunk
    ? await openai.stream(callOptions, onChunk)
    : await openai.call(callOptions);

  const durationMs = Date.now() - startedAt;

  // 5. Store as a red_report version
  const [redReportVersion] = assertData(
    await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        produced_by_step: 8,
        version_type: "red_report",
        internal_label: "Red Report — Critical Assessment",
        content: result.content,
        word_count: countWords(result.content),
        is_client_visible: false,
      })
      .select(),
  );

  if (!redReportVersion) throw new Error("Failed to insert red_report version");

  // 6. Insert audit log
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
      payload: { durationMs },
      response_snapshot: result.content,
    })
    .throwOnError();

  // 7. Update stage 8 to completed (no longer awaiting_human — Red Report is annex only)
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        modelId: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
      } as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 8)
    .throwOnError();

  // 8. Auto-skip step 9 (no longer needed — Red Report is annex only)
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { skipped: true, reason: "Red Report is annex only; critique integration removed" } as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 9)
    .throwOnError();

  // 9. Advance project past step 9 to step 10
  await supabase
    .from("projects")
    .update({ current_stage: 10, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
