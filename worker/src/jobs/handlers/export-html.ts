import {
  openai,
  buildHtmlExportSystemPrompt,
  buildHtmlExportUserMessage,
} from "@repo/lib";
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

  // 3. Fetch Red Report version (if exists) to append as annex
  const { data: redReportVersion } = await supabase
    .from("versions")
    .select()
    .eq("project_id", projectId)
    .eq("version_type", "red_report")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // 4. Update stage 12 to running
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

  // 5. Build memo content with Red Report annex if available
  let memoContent = finalVersion.content;
  if (redReportVersion?.content) {
    memoContent += `\n\n---\n\n# Appendix: Critical Assessment (Red Report)\n\n${redReportVersion.content}`;
  }

  // 6. Call OpenAI to generate HTML
  const result = await openai.call({
    system: buildHtmlExportSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildHtmlExportUserMessage(memoContent, {
          companyName: brief.companyName ?? brief.organizationName ?? brief.systemProductName ?? "Document",
          dealType: brief.dealType ?? brief.documentType ?? "",
          targetAudience: brief.targetAudience,
        }),
      },
    ],
    maxTokens: 16384,
  });

  const durationMs = Date.now() - startedAt;

  // 7. Seal the previous active version before creating a new one
  if (project.active_version_id) {
    await supabase
      .from("versions")
      .update({ is_sealed: true, updated_at: new Date().toISOString() })
      .eq("id", project.active_version_id)
      .throwOnError();
  }

  // 8. Insert exported_html version (client-visible)
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

  // 9. Update active_version_id
  await supabase
    .from("projects")
    .update({ active_version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 10. Insert audit log
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
      payload: { durationMs, hasRedReport: Boolean(redReportVersion) },
    })
    .throwOnError();

  // 11. Update stage 12 to completed
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

  // 12. Mark project as completed
  await supabase
    .from("projects")
    .update({ status: "completed", current_stage: 12, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();
}
