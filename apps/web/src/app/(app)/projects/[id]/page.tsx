import { notFound, redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PipelineView } from "@/components/projects/pipeline-view";
import type { FactCheckFinding, FactCheckSource, StageMetadata, CoverImagesData } from "@repo/db";
import type { CritiqueItem } from "@/components/review/critique-selector";
import { summarizeTokenUsage } from "@/lib/token-usage-cost";

function isFactCheckSource(value: unknown): value is FactCheckSource {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const hasValidDocumentName = record.documentName === null || typeof record.documentName === "string";
  const hasValidPageNumber = record.pageNumber === null || typeof record.pageNumber === "number";
  return hasValidDocumentName && hasValidPageNumber;
}

function isFactCheckFinding(value: unknown): value is FactCheckFinding {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.issue !== "string") {
    return false;
  }

  if (record.sources !== undefined && record.sources !== null) {
    if (!Array.isArray(record.sources)) return false;
    if (!record.sources.every(isFactCheckSource)) return false;
  }

  return true;
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!project) notFound();

  const [stageResult, personaResult, materialResult, versionResult, styleGuideResult, usageResult] = await Promise.all([
    supabase
      .from("stages")
      .select()
      .eq("project_id", id)
      .order("step_number", { ascending: true }),
    supabase
      .from("personas")
      .select()
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("source_materials")
      .select()
      .eq("project_id", id)
      .order("uploaded_at", { ascending: true }),
    supabase
      .from("versions")
      .select()
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("style_guides")
      .select()
      .eq("project_id", id)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select("model_id, input_tokens, output_tokens")
      .eq("project_id", id),
  ]);

  const stageRows = stageResult.data ?? [];
  const personaRows = personaResult.data ?? [];
  const materialRows = materialResult.data ?? [];
  const versionRows = versionResult.data ?? [];
  const styleGuideRows = styleGuideResult.data ?? [];
  const usageRows = usageResult.data ?? [];

  const usageSummary = summarizeTokenUsage(
    usageRows.map((row) => ({
      modelId: row.model_id,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    })),
  );

  const stepParam = typeof sp["step"] === "string" ? Number(sp["step"]) : NaN;
  const initialStep = Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 12
    ? stepParam
    : project.current_stage;
  const step8Stage = stageRows.find((stage) => stage.step_number === 8);
  const step8Metadata = step8Stage?.metadata as StageMetadata | null;
  const factCheckFindings = (() => {
    const rawFindings = step8Metadata?.factCheckFindings;
    if (Array.isArray(rawFindings)) {
      const parsedFindings = rawFindings.filter(isFactCheckFinding);
      if (parsedFindings.length > 0) {
        return parsedFindings;
      }
    }

    const rawIssues = step8Metadata?.factCheckIssues;
    if (Array.isArray(rawIssues)) {
      return rawIssues
        .filter((issue): issue is string => typeof issue === "string")
        .map((issue, index) => ({
          id: `finding-${index + 1}`,
          issue,
          sources: [],
        }));
    }

    return null;
  })();
  const factCheckApprovedFindingIds = (() => {
    const rawIds = step8Metadata?.factCheckApprovedFindingIds;
    if (!Array.isArray(rawIds)) return null;
    const ids = rawIds.filter((value): value is string => typeof value === "string");
    return ids.length > 0 ? ids : null;
  })();
  const factCheckApprovedIssues = (() => {
    const rawIssues = step8Metadata?.factCheckApprovedIssues;
    if (!Array.isArray(rawIssues)) return null;
    const issues = rawIssues.filter((value): value is string => typeof value === "string");
    return issues.length > 0 ? issues : null;
  })();
  const factCheckAppliedCorrections =
    typeof step8Metadata?.factCheckAppliedCorrections === "number"
      ? step8Metadata.factCheckAppliedCorrections
      : null;

  // Extract Step 11 critiques from stage metadata (server-side, like persona DB fetch)
  const step11Stage = stageRows.find((stage) => stage.step_number === 11);
  const step11Metadata = step11Stage?.metadata as StageMetadata | null;
  const step11Critiques: CritiqueItem[] = (() => {
    const draft = step11Metadata?.devilsAdvocateDraft;
    if (!draft || !Array.isArray(draft.critiques)) return [];
    return draft.critiques
      .filter((c): c is { id: number; title: string; detail: string; isCustom?: boolean } =>
        typeof c.id === "number" && typeof c.title === "string" && typeof c.detail === "string"
      )
      .map((c) => ({ id: c.id, title: c.title, detail: c.detail, isCustom: c.isCustom }));
  })();
  const step11SelectedIds: number[] = (() => {
    const draft = step11Metadata?.devilsAdvocateDraft;
    if (!draft || !Array.isArray(draft.selectedIds)) return [];
    return draft.selectedIds.filter((v): v is number => typeof v === "number");
  })();

  // Fetch selected cover image signed URL for the styled document preview
  let coverImageUrl: string | undefined;
  const latestStyleGuide = styleGuideRows[0];
  const coverImages = latestStyleGuide?.cover_images as CoverImagesData | null;
  if (coverImages?.selectedStyle) {
    const selectedImg = coverImages.images.find(
      (img) => img.style === coverImages.selectedStyle,
    );
    if (selectedImg) {
      const adminSupabase = createAdminClient();
      const { data } = await adminSupabase.storage
        .from("source-materials")
        .createSignedUrl(selectedImg.storagePath, 3600);
      if (data?.signedUrl) {
        coverImageUrl = data.signedUrl;
      }
    }
  }

  return (
    <PipelineView
      project={project}
      stages={stageRows}
      personas={personaRows}
      materials={materialRows}
      versions={versionRows}
      latestStyleGuide={styleGuideRows[0] ?? null}
      initialStep={initialStep}
      factCheckFindings={factCheckFindings}
      factCheckApprovedFindingIds={factCheckApprovedFindingIds}
      factCheckApprovedIssues={factCheckApprovedIssues}
      factCheckAppliedCorrections={factCheckAppliedCorrections}
      coverImageUrl={coverImageUrl}
      tokenUsageSummary={usageSummary}
      step11Critiques={step11Critiques}
      step11SelectedIds={step11SelectedIds}
    />
  );
}
