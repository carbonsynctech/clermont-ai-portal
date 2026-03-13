import {
  openai,
  buildStyleEditSystemPrompt,
  buildStyleEditUserMessage,
  parseStyleEditResponse,
} from "@repo/core";
import type { ProjectBriefData, Json } from "@repo/db";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

export async function styleEdit(projectId: string, userId: string, onChunk?: (chunk: string) => void): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch project
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  // 2. Update stage 11 to running
  await supabase
    .from("stages")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("step_number", 11)
    .throwOnError();

  const startedAt = Date.now();

  // Step 6: Extract style guide text
  // 3. Fetch most recent style guide
  const styleGuide = assertData(
    await supabase
      .from("style_guides")
      .select()
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .single(),
  );

  // 4. Get style guide text — either from preset rules or by downloading file
  let styleGuideText: string;
  const isPreset = styleGuide.storage_path.startsWith("preset:");

  if (isPreset && styleGuide.condensed_rules_text) {
    // Preset style: use pre-defined condensed rules directly
    styleGuideText = styleGuide.condensed_rules_text;
  } else {
    // File-based style guide: download and parse
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("source-materials")
      .download(styleGuide.storage_path);

    if (downloadError ?? !fileData) {
      throw new Error(`Failed to download style guide: ${String(downloadError?.message)}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (
      styleGuide.original_filename.toLowerCase().endsWith(".pdf") ||
      buffer[0] === 0x25 // PDF magic byte %
    ) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      styleGuideText = result.text;
      await parser.destroy();
    } else {
      styleGuideText = buffer.toString("utf-8");
    }
  }

  // Step 7: Fetch synthesis version to edit
  // 5. Get synthesis version (active_version_id or latest synthesis)
  let synthesisContent: string;
  if (project.active_version_id) {
    const activeVersion = assertData(
      await supabase.from("versions").select().eq("id", project.active_version_id).single(),
    );
    synthesisContent = activeVersion?.content ?? "";
  } else {
    const latestSynthesis = assertData(
      await supabase
        .from("versions")
        .select()
        .eq("project_id", projectId)
        .eq("version_type", "synthesis")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    );
    synthesisContent = latestSynthesis?.content ?? "";
  }

  if (!synthesisContent) {
    throw new Error(`Project ${projectId} has no synthesis version to edit`);
  }

  // 6. Call Claude: extract rules + apply in one pass
  const callOptions = {
    system: buildStyleEditSystemPrompt(),
    messages: [
      {
        role: "user" as const,
        content: isPreset
          ? buildStyleEditUserMessage(styleGuideText, synthesisContent, styleGuideText)
          : buildStyleEditUserMessage(styleGuideText, synthesisContent),
      },
    ],
    maxTokens: 8192,
  };
  const result = onChunk
    ? await openai.stream(callOptions, onChunk)
    : await openai.call(callOptions);

  const durationMs = Date.now() - startedAt;

  // 7. Parse XML response (only rules are used; Step 7 no longer persists a styled text version)
  const { rules } = parseStyleEditResponse(result.content);

  // 8. Update style guide with extracted rules
  await supabase
    .from("style_guides")
    .update({
      condensed_rules_text: rules,
      is_processed: true,
    })
    .eq("id", styleGuide.id)
    .throwOnError();

  // 9. Keep active version unchanged (Step 7 is display/style metadata only)
  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 11. Audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 11,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs },
    })
    .throwOnError();

  // 12. Update stage 11 to completed
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
    .eq("step_number", 11)
    .throwOnError();

  // 13. Advance project to stage 12
  await supabase
    .from("projects")
    .update({ current_stage: 12, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
