import type { StageMetadata, Json } from "@repo/db";
import {
  claude,
  buildSynthesisSystemPrompt,
  buildSynthesisUserMessage,
  estimateTokens,
  selectChunksForBudget,
  getAvailableContextTokens,
} from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function synthesize(
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

  onChunk?.("Preparing synthesis input...\n");

  // 2. Update stage to running
  await supabase
    .from("stages")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("step_number", 5)
    .throwOnError();

  const startedAt = Date.now();

  // 3. Hide any existing synthesis versions so re-runs produce a fresh memo (never delete versions)
  const existingSynthesis = assertData(
    await supabase
      .from("versions")
      .select("id, is_sealed")
      .eq("project_id", projectId)
      .eq("version_type", "synthesis")
      .eq("is_client_visible", true),
  );
  if (existingSynthesis.length > 0) {
    const unsealed = existingSynthesis.filter((v) => !v.is_sealed);
    if (unsealed.length > 0) {
      await supabase
        .from("versions")
        .update({ is_client_visible: false, updated_at: new Date().toISOString() })
        .in("id", unsealed.map((v) => v.id))
        .throwOnError();
    }
    onChunk?.(`Hid ${unsealed.length} previous synthesis version(s).\n`);
  }

  // 4. Fetch persona opinion versions with persona names
  const opinionVersions = assertData(
    await supabase
      .from("versions")
      .select()
      .eq("project_id", projectId)
      .eq("version_type", "persona_draft")
      .order("created_at", { ascending: true }),
  );

  if (opinionVersions.length === 0) {
    throw new Error(`Project ${projectId} has no persona opinion versions`);
  }

  onChunk?.(`Loaded ${opinionVersions.length} persona opinions.\n`);

  // Fetch persona names
  const personaRows = assertData(
    await supabase.from("personas").select().eq("project_id", projectId),
  );
  const personaMap = Object.fromEntries(personaRows.map((p) => [p.id, p.name]));

  // 4. Build opinions array
  const opinions = opinionVersions.map((v) => ({
    personaName: v.persona_id ? (personaMap[v.persona_id] ?? v.internal_label) : v.internal_label,
    content: v.content,
  }));

  // 5. Load source chunks for direct inclusion
  const materials = assertData(
    await supabase.from("source_materials").select().eq("project_id", projectId),
  );

  const materialIds = materials.map((m) => m.id);

  let allChunks: Array<{ id: string; content: string; estimatedTokens: number; chunkIndex: number; summary?: string | null }> = [];

  if (materialIds.length > 0) {
    const chunkRows = assertData(
      await supabase
        .from("source_chunks")
        .select()
        .in("material_id", materialIds)
        .order("chunk_index", { ascending: true }),
    );
    allChunks = chunkRows.map((c) => ({
      id: c.id,
      content: c.content,
      estimatedTokens: c.estimated_tokens,
      chunkIndex: c.chunk_index,
      summary: c.summary,
    }));
  }

  // 6. Calculate token budget for source chunks
  const opinionsTokens = opinions.reduce((sum, o) => sum + estimateTokens(o.content), 0);
  const masterPromptTokens = estimateTokens(project.master_prompt);
  const availableTokens = getAvailableContextTokens("claude-sonnet-4-6");
  const chunkBudget = availableTokens - masterPromptTokens - opinionsTokens - 4000;
  const selectedChunks = selectChunksForBudget(allChunks, chunkBudget);

  onChunk?.(
    `Selected ${selectedChunks.length} source chunks (${Math.max(chunkBudget, 0)} token budget).\n`,
  );

  onChunk?.("Writing investment memo with Claude extended thinking...\n");

  // 7. Call Claude with extended thinking
  const result = await claude.callWithThinking({
    system: buildSynthesisSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildSynthesisUserMessage(project.master_prompt, opinions, selectedChunks),
      },
    ],
    maxTokens: 18192, // 8192 output + 10000 thinking budget
  });

  const durationMs = Date.now() - startedAt;
  onChunk?.(`Memo written in ${Math.round(durationMs / 1000)}s. Saving version...\n`);

  // 8. Insert synthesis version
  const [newVersion] = assertData(
    await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        produced_by_step: 5,
        version_type: "synthesis",
        internal_label: "Synthesis V1",
        content: result.content,
        word_count: countWords(result.content),
        is_client_visible: false,
      })
      .select()
  );

  if (!newVersion) throw new Error("Failed to insert synthesis version");

  onChunk?.("Synthesis version saved. Finalizing stage...\n");

  // 9. Update activeVersionId
  await supabase
    .from("projects")
    .update({ active_version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 10. Audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 5,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs, thinkingLength: result.thinking.length },
    })
    .throwOnError();

  // 11. Update stage to completed
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
    .eq("step_number", 5)
    .throwOnError();

  // 12. Advance project to stage 6
  await supabase
    .from("projects")
    .update({ current_stage: 6, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
