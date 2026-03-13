import type { Json, ProjectBriefData, TocEntry } from "@repo/db";
import { openai, buildTocSystemPrompt, buildTocUserMessage } from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

export interface GenerateTocPayload {
  projectId: string;
  userId: string;
}

export async function generateToc(
  payload: GenerateTocPayload,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const { projectId, userId } = payload;
  const supabase = createAdminClient();

  // 1. Fetch project
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  if (!project.master_prompt) throw new Error(`Project ${projectId} has no master prompt`);

  const brief = project.brief_data as ProjectBriefData | null;
  const documentType = brief?.documentType ?? "Document";

  onChunk?.("Generating table of contents...\n");

  const startedAt = Date.now();

  // 2. Call OpenAI to generate TOC
  const result = await openai.call({
    system: buildTocSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildTocUserMessage(project.master_prompt, documentType),
      },
    ],
    maxTokens: 4096,
  });

  const durationMs = Date.now() - startedAt;

  // 3. Parse TOC entries
  let tocEntries: TocEntry[] = [];
  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in TOC response");
    tocEntries = JSON.parse(jsonMatch[0]) as TocEntry[];
  } catch {
    throw new Error("Failed to parse TOC from OpenAI response");
  }

  onChunk?.(`Generated ${tocEntries.length} TOC entries.\n`);

  // 4. Store TOC in project brief_data
  const updatedBrief = {
    ...(project.brief_data as Record<string, unknown> | null),
    tableOfContents: tocEntries,
  };

  await supabase
    .from("projects")
    .update({
      brief_data: updatedBrief as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .throwOnError();

  // 5. Audit log
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
      payload: { durationMs, kind: "generate_toc", tocEntryCount: tocEntries.length },
    })
    .throwOnError();
}
