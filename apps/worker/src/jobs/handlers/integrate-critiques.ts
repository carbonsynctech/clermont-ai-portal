import {
  claude,
  buildCritiqueIntegrationSystemPrompt,
  buildCritiqueIntegrationUserMessage,
} from "@repo/core";
import type { Json } from "@repo/db";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function integrateCritiques(
  projectId: string,
  userId: string,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch project
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

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

  // 3. Fetch selected critiques from most recent critique_selected audit log
  const critiqueLog = assertData(
    await supabase
      .from("audit_logs")
      .select()
      .eq("project_id", projectId)
      .eq("action", "critique_selected")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  );

  const logPayload = critiqueLog.payload as { selectedCritiques: string[] } | null;
  const selectedCritiques = logPayload?.selectedCritiques ?? [];

  // 4. Update stage 9 to running
  await supabase
    .from("stages")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("step_number", 9)
    .throwOnError();

  const startedAt = Date.now();

  onChunk?.("Preparing critique integration input...\n");

  // 5. Integrate critiques (if any). For zero critiques, carry forward V5 as V6.
  const hasSelectedCritiques = selectedCritiques.length > 0;
  if (!hasSelectedCritiques) {
    onChunk?.("No critiques selected, carrying forward Step 7 output as Final V6.\n");
  }
  const result = hasSelectedCritiques
    ? await (onChunk
      ? claude.streamWithThinking(
        {
          system: buildCritiqueIntegrationSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildCritiqueIntegrationUserMessage(
                humanReviewedVersion.content,
                selectedCritiques
              ),
            },
          ],
          maxTokens: 18192, // 8192 output + 10000 thinking budget
        },
        onChunk,
      )
      : claude.callWithThinking({
        system: buildCritiqueIntegrationSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildCritiqueIntegrationUserMessage(
              humanReviewedVersion.content,
              selectedCritiques
            ),
          },
        ],
        maxTokens: 18192, // 8192 output + 10000 thinking budget
      }))
    : null;

  const durationMs = Date.now() - startedAt;
  const finalContent = result?.content ?? humanReviewedVersion.content;

  // 6. Insert final version
  const [newVersion] = assertData(
    await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        produced_by_step: 9,
        version_type: "final",
        internal_label: hasSelectedCritiques ? "Final V6" : "Final V6 (No Critiques Selected)",
        content: finalContent,
        word_count: countWords(finalContent),
        is_client_visible: false,
      })
      .select(),
  );

  if (!newVersion) throw new Error("Failed to insert final version");

  // 7. Update active_version_id
  await supabase
    .from("projects")
    .update({ active_version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 8. Insert audit log
  if (result) {
    await supabase
      .from("audit_logs")
      .insert({
        project_id: projectId,
        user_id: userId,
        action: "agent_response_received",
        step_number: 9,
        model_id: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        payload: { durationMs, thinkingLength: result.thinking.length },
      })
      .throwOnError();
  } else {
    await supabase
      .from("audit_logs")
      .insert({
        project_id: projectId,
        user_id: userId,
        action: "stage_completed",
        step_number: 9,
        payload: {
          durationMs,
          selectedCritiquesCount: 0,
          reason: "No critiques selected; carried forward human-reviewed version",
        },
      })
      .throwOnError();
  }

  // 9. Update stage 9 to completed
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...(result?.model !== undefined && { modelId: result.model }),
        ...(result?.inputTokens !== undefined && { inputTokens: result.inputTokens }),
        ...(result?.outputTokens !== undefined && { outputTokens: result.outputTokens }),
        durationMs,
        selectedCritiquesCount: selectedCritiques.length,
      } as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 9)
    .throwOnError();

  // 10. Advance project to stage 10
  await supabase
    .from("projects")
    .update({ current_stage: 10, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
