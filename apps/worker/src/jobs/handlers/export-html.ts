import {
  claude,
  buildHtmlExportSystemPrompt,
  buildHtmlExportUserMessage,
} from "@repo/core";
import type { ProjectBriefData, Json } from "@repo/db";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

export async function exportHtml(projectId: string, userId: string): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch project + brief data
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  const brief = project.brief_data as ProjectBriefData | null;
  if (!brief) throw new Error(`Project ${projectId} has no brief data`);

  // 2. Fetch final version
  const finalVersion = assertData(
    await supabase
      .from("versions")
      .select()
      .eq("project_id", projectId)
      .eq("version_type", "final")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  );

  // 3. Update stage 12 to running
  await supabase
    .from("stages")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("step_number", 12)
    .throwOnError();

  const startedAt = Date.now();

  // 4. Call Claude to generate HTML
  const result = await claude.call({
    system: buildHtmlExportSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildHtmlExportUserMessage(finalVersion.content, {
          companyName: brief.companyName ?? brief.organizationName ?? brief.systemProductName ?? "Document",
          dealType: brief.dealType ?? brief.documentType ?? "",
          targetAudience: brief.targetAudience,
        }),
      },
    ],
    maxTokens: 8192,
  });

  const durationMs = Date.now() - startedAt;

  // 5. Seal the previous active version before creating a new one
  if (project.active_version_id) {
    await supabase
      .from("versions")
      .update({ is_sealed: true, updated_at: new Date().toISOString() })
      .eq("id", project.active_version_id)
      .throwOnError();
  }

  // 6. Insert exported_html version (client-visible)
  const [newVersion] = assertData(
    await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        produced_by_step: 12,
        version_type: "exported_html",
        internal_label: "Export HTML V7",
        content: result.content,
        word_count: 0,
        is_client_visible: true,
      })
      .select(),
  );

  if (!newVersion) throw new Error("Failed to insert exported_html version");

  // 6. Update active_version_id
  await supabase
    .from("projects")
    .update({ active_version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 7. Insert audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "export_requested",
      step_number: 12,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs },
    })
    .throwOnError();

  // 8. Update stage 12 to completed
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
    .eq("step_number", 12)
    .throwOnError();

  // 9. Mark project as completed
  await supabase
    .from("projects")
    .update({ status: "completed", current_stage: 12, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
