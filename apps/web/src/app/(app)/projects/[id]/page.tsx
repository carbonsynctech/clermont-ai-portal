import { notFound, redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, personas, sourceMaterials, versions, styleGuides, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { PipelineView } from "@/components/projects/pipeline-view";
import type { FactCheckFinding, FactCheckSource } from "@repo/db";
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

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, user.id)),
  });

  if (!project) notFound();

  const [stageRows, personaRows, materialRows, versionRows, styleGuideRows, usageRows] = await Promise.all([
    db.query.stages.findMany({
      where: eq(stages.projectId, id),
      orderBy: (s, { asc }) => [asc(s.stepNumber)],
    }),
    db.query.personas.findMany({
      where: eq(personas.projectId, id),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    }),
    db.query.sourceMaterials.findMany({
      where: eq(sourceMaterials.projectId, id),
      orderBy: (m, { asc }) => [asc(m.uploadedAt)],
    }),
    db.query.versions.findMany({
      where: eq(versions.projectId, id),
      orderBy: (v, { asc }) => [asc(v.createdAt)],
    }),
    db.query.styleGuides.findMany({
      where: eq(styleGuides.projectId, id),
      orderBy: (sg, { desc }) => [desc(sg.uploadedAt)],
    }),
    db.query.auditLogs.findMany({
      where: eq(auditLogs.projectId, id),
      columns: {
        modelId: true,
        inputTokens: true,
        outputTokens: true,
      },
    }),
  ]);

  const usageSummary = summarizeTokenUsage(usageRows);

  const stepParam = typeof sp["step"] === "string" ? Number(sp["step"]) : NaN;
  const initialStep = Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 12
    ? stepParam
    : project.currentStage;
  const step8Stage = stageRows.find((stage) => stage.stepNumber === 8);
  const factCheckFindings = (() => {
    const rawFindings = step8Stage?.metadata?.factCheckFindings;
    if (Array.isArray(rawFindings)) {
      const parsedFindings = rawFindings.filter(isFactCheckFinding);
      if (parsedFindings.length > 0) {
        return parsedFindings;
      }
    }

    const rawIssues = step8Stage?.metadata?.factCheckIssues;
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
    const rawIds = step8Stage?.metadata?.factCheckApprovedFindingIds;
    if (!Array.isArray(rawIds)) return null;
    const ids = rawIds.filter((value): value is string => typeof value === "string");
    return ids.length > 0 ? ids : null;
  })();
  const factCheckApprovedIssues = (() => {
    const rawIssues = step8Stage?.metadata?.factCheckApprovedIssues;
    if (!Array.isArray(rawIssues)) return null;
    const issues = rawIssues.filter((value): value is string => typeof value === "string");
    return issues.length > 0 ? issues : null;
  })();
  const factCheckAppliedCorrections =
    typeof step8Stage?.metadata?.factCheckAppliedCorrections === "number"
      ? step8Stage.metadata.factCheckAppliedCorrections
      : null;

  // Fetch selected cover image signed URL for the styled document preview
  let coverImageUrl: string | undefined;
  const latestStyleGuide = styleGuideRows[0];
  if (latestStyleGuide?.coverImages?.selectedStyle) {
    const selectedImg = latestStyleGuide.coverImages.images.find(
      (img) => img.style === latestStyleGuide.coverImages!.selectedStyle,
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
    />
  );
}
