import type { StageMetadata, Json, ProjectBriefData, TocEntry } from "@repo/db";
import {
  openai,
  buildPersonaDraftSystemPrompt,
  buildPersonaDraftUserMessage,
  selectChunksForBudget,
  getAvailableContextTokens,
  estimateTokens,
} from "@repo/lib";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function generatePersonaDrafts(
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

  onChunk?.("Preparing persona draft generation...\n");

  // 2. Update stage to running
  await supabase
    .from("stages")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("step_number", 4)
    .throwOnError();

  const startedAt = Date.now();

  // 3. Hide any existing persona_draft versions so re-runs produce fresh opinions (never delete versions)
  const existingDrafts = assertData(
    await supabase
      .from("versions")
      .select("id, is_sealed")
      .eq("project_id", projectId)
      .eq("version_type", "persona_draft"),
  );

  if (existingDrafts.length > 0) {
    const unsealed = existingDrafts.filter((v) => !v.is_sealed);
    if (unsealed.length > 0) {
      await supabase
        .from("versions")
        .update({ is_client_visible: false, updated_at: new Date().toISOString() })
        .in("id", unsealed.map((v) => v.id))
        .throwOnError();
    }
    onChunk?.(`Hid ${unsealed.length} previous persona drafts.\n`);
  }

  // 4. Fetch selected personas ordered by selectionOrder
  const selectedPersonas = assertData(
    await supabase
      .from("personas")
      .select()
      .eq("project_id", projectId)
      .eq("is_selected", true)
      .order("selection_order", { ascending: true }),
  );

  if (selectedPersonas.length === 0) {
    throw new Error(`Project ${projectId} has no selected personas`);
  }

  onChunk?.(`Found ${selectedPersonas.length} selected personas.\n`);

  // 5. Fetch all source chunks for this project (via source_materials)
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

  // 5. Select chunks within token budget (leave room for master prompt + system + response)
  const masterPromptTokens = estimateTokens(project.master_prompt);
  const availableTokens = getAvailableContextTokens("gpt-4o");
  const chunkBudget = availableTokens - masterPromptTokens - 4000; // reserve for system + response
  const selectedChunks = selectChunksForBudget(allChunks, chunkBudget);

  onChunk?.(
    `Selected ${selectedChunks.length} source chunks for context (${Math.max(
      chunkBudget,
      0,
    )} token budget).\n\nStarting parallel persona draft generation...\n`,
  );

  // Extract TOC from brief data if available
  const briefData = project.brief_data as ProjectBriefData & { tableOfContents?: TocEntry[] } | null;
  const tableOfContents = briefData?.tableOfContents;

  // 6. Run all 5 persona drafts in parallel
  const results = await Promise.all(
    selectedPersonas.map((persona) =>
      (async () => {
        onChunk?.(`\n[${persona.name}] Generating opinion points...\n`);
        const result = await openai.callWithDeepResearch({
          system: buildPersonaDraftSystemPrompt(persona.name, persona.system_prompt),
          messages: [
            {
              role: "user",
              content: buildPersonaDraftUserMessage(project.master_prompt!, selectedChunks, tableOfContents),
            },
          ],
          maxTokens: 4096,
        });
        onChunk?.(
          `[${persona.name}] Completed (${result.outputTokens} output tokens).\n`,
        );
        return result;
      })()
    )
  );

  const durationMs = Date.now() - startedAt;
  onChunk?.(`\nAll persona opinions completed in ${Math.round(durationMs / 1000)}s.\n`);

  // 7. Insert a version row for each persona draft
  for (let i = 0; i < selectedPersonas.length; i++) {
    const persona = selectedPersonas[i]!;
    const result = results[i]!;

    await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        produced_by_step: 4,
        version_type: "persona_draft",
        persona_id: persona.id,
        internal_label: `Opinions – ${persona.name}`,
        content: result.content,
        word_count: countWords(result.content),
        is_client_visible: false,
      })
      .throwOnError();

    // Audit log per draft
    await supabase
      .from("audit_logs")
      .insert({
        project_id: projectId,
        user_id: userId,
        action: "agent_response_received",
        step_number: 4,
        model_id: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        payload: { personaName: persona.name, durationMs },
      })
      .throwOnError();
  }

  // 8. Update stage to completed
  const metadata: StageMetadata = { durationMs };
  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: metadata as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 4)
    .throwOnError();

  // 9. Advance project to stage 5
  await supabase
    .from("projects")
    .update({ current_stage: 5, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
