import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface FindingRecord {
  id: string;
  issue: string;
  incorrectText?: string | null;
  correctedText?: string | null;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function isFindingRecordArray(value: unknown): value is FindingRecord[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return typeof record.id === "string" && typeof record.issue === "string";
  });
}

function applyAcceptedCorrections(content: string, findings: FindingRecord[]): {
  revisedContent: string;
  appliedCount: number;
} {
  let revisedContent = content;
  let appliedCount = 0;

  for (const finding of findings) {
    const incorrectText = typeof finding.incorrectText === "string" ? finding.incorrectText.trim() : "";
    const correctedText = typeof finding.correctedText === "string" ? finding.correctedText.trim() : "";
    if (!incorrectText || !correctedText) continue;

    if (revisedContent.includes(incorrectText)) {
      revisedContent = revisedContent.replace(incorrectText, correctedText);
      appliedCount += 1;
    }
  }

  return { revisedContent, appliedCount };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    baseContent?: unknown;
    findingIds?: unknown;
  };
  const baseContent = typeof body.baseContent === "string" ? body.baseContent : null;
  const findingIds = Array.isArray(body.findingIds)
    ? body.findingIds.filter((findingId): findingId is string => typeof findingId === "string")
    : [];

  const { data: stage8 } = await supabase
    .from("stages")
    .select()
    .eq("project_id", projectId)
    .eq("step_number", 8)
    .single();
  const metadata = stage8?.metadata as Record<string, unknown> | null;
  const rawFindings = metadata?.factCheckFindings;
  const allFindings = isFindingRecordArray(rawFindings) ? rawFindings : [];
  const selectedFindingSet = new Set(findingIds);
  const selectedFindings = allFindings.filter((finding) => selectedFindingSet.has(finding.id));
  const issuesApproved = selectedFindings.map((finding) => finding.issue);

  const { data: latestFactChecked } = await supabase
    .from("versions")
    .select()
    .eq("project_id", projectId)
    .eq("version_type", "fact_checked")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latestFactChecked) {
    return NextResponse.json({ error: "Fact-checked version not found" }, { status: 404 });
  }

  const startingContent = baseContent ?? latestFactChecked.content;
  const { revisedContent, appliedCount } = applyAcceptedCorrections(startingContent, selectedFindings);

  let finalFactCheckedVersionId = latestFactChecked.id;
  if (revisedContent !== latestFactChecked.content) {
    const { data: newVersion } = await supabase
      .from("versions")
      .insert({
        project_id: projectId,
        parent_version_id: latestFactChecked.id,
        produced_by_step: 8,
        version_type: "fact_checked",
        internal_label: `Fact-Checked V3 (Approved ${appliedCount} correction${appliedCount === 1 ? "" : "s"})`,
        content: revisedContent,
        word_count: countWords(revisedContent),
        is_client_visible: false,
      })
      .select()
      .single();

    if (!newVersion) {
      return NextResponse.json({ error: "Failed to save revised fact-checked version" }, { status: 500 });
    }
    finalFactCheckedVersionId = newVersion.id;
  }

  const now = new Date().toISOString();

  await supabase
    .from("projects")
    .update({ active_version_id: finalFactCheckedVersionId, updated_at: now })
    .eq("id", projectId);

  await supabase
    .from("stages")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
      metadata: {
        ...(metadata ?? {}),
        factCheckApprovedFindingIds: findingIds,
        factCheckApprovedIssues: issuesApproved,
        factCheckAppliedCorrections: appliedCount,
        factCheckRevisedVersionId: finalFactCheckedVersionId,
      },
    })
    .eq("project_id", projectId)
    .eq("step_number", 8);

  await supabase.from("audit_logs").insert({
    project_id: projectId,
    user_id: user.id,
    action: "stage_completed",
    step_number: 8,
    payload: {
      event: "fact_check_approved",
      issuesApproved,
      findingIds,
      count: issuesApproved.length,
      appliedCorrections: appliedCount,
    },
  });

  await supabase
    .from("projects")
    .update({ current_stage: 9, updated_at: now })
    .eq("id", projectId);

  return NextResponse.json({
    ok: true,
    revisedContent,
    appliedCorrections: appliedCount,
  });
}
