import type { StageMetadata, Json } from "@repo/db";
import { claude, gemini } from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function factCheck(projectId: string, userId: string, onChunk?: (chunk: string) => void): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch project
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  onChunk?.("Fetching latest synthesis version…\n");

  // 2. Update stage to running
  await supabase
    .from("stages")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("step_number", 6)
    .throwOnError();

  const startedAt = Date.now();

  // 3. Fetch latest synthesis version (Step 5 canonical source)
  let synthesisContent: string;
  if (project.active_version_id) {
    const activeVersion = assertData(
      await supabase.from("versions").select().eq("id", project.active_version_id).single(),
    );
    synthesisContent = activeVersion?.content ?? "";
  } else {
    const latestResults = assertData(
      await supabase
        .from("versions")
        .select()
        .eq("project_id", projectId)
        .eq("version_type", "synthesis")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    );
    synthesisContent = latestResults?.content ?? "";
  }

  if (!synthesisContent) {
    throw new Error(`Project ${projectId} has no synthesis version to fact-check`);
  }

  onChunk?.("Extracting factual claims…\n");

  // 4. Extract factual claims via Claude
  const claimsResult = await claude.call({
    system: 'You are an expert at extracting specific factual claims from investment content. Extract all specific factual claims (numbers, dates, names, statistics, percentages, financial figures) from the provided content. Return ONLY a valid JSON array of strings — one claim per item. Example: ["Company X generated $50M revenue in 2024", "Industry growth rate is 15% annually"]. Do not include any other text, preamble, or explanation.',
    messages: [{ role: "user", content: synthesisContent }],
    maxTokens: 2048,
  });

  let claims: string[] = [];
  try {
    const responseText = claimsResult.content.trim();
    // Try to extract JSON array — handles cases where Claude adds preamble
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        claims = parsed.filter((c) => typeof c === "string" && c.trim().length > 0);
      }
    }
    // If still no claims found, create fallback claims from key sentences
    if (claims.length === 0) {
      const sentences = synthesisContent
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20 && /\d|percent|revenue|growth|market/.test(s.toLowerCase()))
        .slice(0, 5);
      claims = sentences;
    }
  } catch (err) {
    // If parsing fails, proceed with fallback claims — Gemini will still review the full text
    console.error("[fact-check] Failed to parse claims extraction:", err);
  }

  onChunk?.(`Found ${claims.length} claim${claims.length !== 1 ? "s" : ""} to verify.\n`);
  onChunk?.("Sending to Gemini for fact-checking…\n");

  // 5. Call Gemini fact-check
  const geminiResult = await gemini.factCheck(synthesisContent, claims);

  const durationMs = Date.now() - startedAt;

  const issueCount = geminiResult.findings.length;
  const issueWord = issueCount === 1 ? "issue" : "issues";
  onChunk?.(
    geminiResult.verified
      ? `Fact-check complete. No issues found.\n`
      : `Fact-check complete. ${issueCount} ${issueWord} found:\n${geminiResult.findings.map((finding) => `  • ${finding.issue}`).join("\n")}\n`
  );
  onChunk?.(`\n${geminiResult.correctedContent}\n`);
  onChunk?.("\nSaving corrected version…\n");

  // 6. Insert fact-checked version
  const [newVersion] = assertData(
    await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        produced_by_step: 6,
        version_type: "fact_checked",
        internal_label: `Fact-Checked V3${issueCount > 0 ? ` (${issueCount} issue${issueCount !== 1 ? "s" : ""} found)` : ""}`,
        content: geminiResult.correctedContent,
        word_count: countWords(geminiResult.correctedContent),
        is_client_visible: false,
      })
      .select()
  );

  if (!newVersion) throw new Error("Failed to insert fact-checked version");

  // 7. Update activeVersionId
  await supabase
    .from("projects")
    .update({ active_version_id: newVersion.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .throwOnError();

  // 8. Audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 6,
      model_id: "gemini-2.5-pro+google-search",
      payload: {
        durationMs,
        issueCount,
        verified: geminiResult.verified,
        claimsChecked: claims.length,
        findingsWithSources: geminiResult.findings.filter((finding) => (finding.sources?.length ?? 0) > 0).length,
      },
    })
    .throwOnError();

  // 9. Update stage to awaiting human approval
  const metadata: StageMetadata = {
    durationMs,
    factCheckIssues: geminiResult.issues,
    factCheckFindings: geminiResult.findings,
  };
  await supabase
    .from("stages")
    .update({
      status: "awaiting_human",
      updated_at: new Date().toISOString(),
      metadata: metadata as unknown as Json,
    })
    .eq("project_id", projectId)
    .eq("step_number", 6)
    .throwOnError();
}
