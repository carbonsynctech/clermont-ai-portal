import { notFound, redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, personas, sourceMaterials, versions, styleGuides } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { PipelineView } from "@/components/projects/pipeline-view";

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

  const [stageRows, personaRows, materialRows, versionRows, styleGuideRows] = await Promise.all([
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
  ]);

  const stepParam = typeof sp["step"] === "string" ? Number(sp["step"]) : NaN;
  const initialStep = Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 13
    ? stepParam
    : project.currentStage;
  const step10Stage = stageRows.find((stage) => stage.stepNumber === 10);
  const step10DraftContent =
    typeof step10Stage?.metadata?.reviewDraftContent === "string"
      ? step10Stage.metadata.reviewDraftContent
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
      step10DraftContent={step10DraftContent}
      coverImageUrl={coverImageUrl}
    />
  );
}
