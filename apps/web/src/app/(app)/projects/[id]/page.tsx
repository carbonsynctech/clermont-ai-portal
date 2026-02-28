import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages, personas, sourceMaterials, versions, styleGuides } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PipelineProgress } from "@/components/projects/pipeline-progress";
import { StepTrigger } from "@/components/projects/step-trigger";
import { PersonaSelector } from "@/components/personas/persona-selector";
import { MaterialUpload } from "@/components/sources/material-upload";
import { StyleGuideUpload } from "@/components/sources/style-guide-upload";
import { VersionsPanel } from "@/components/versions/versions-panel";
import type { ProjectBriefData } from "@repo/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, user.id)),
  });

  if (!project) notFound();

  // Fetch all supporting data in parallel
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

  const stageMap = Object.fromEntries(stageRows.map((s) => [s.stepNumber, s]));
  const brief = project.briefData as ProjectBriefData | null;

  const selectedPersonas = personaRows
    .filter((p) => p.isSelected)
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0));

  const personaDrafts = versionRows.filter((v) => v.versionType === "persona_draft");
  const latestStyleGuide = styleGuideRows[0] ?? null;

  // Determine the latest content version for display
  const contentVersionTypes = ["fact_checked", "styled", "synthesis"] as const;
  const latestContentVersion = contentVersionTypes
    .map((t) => versionRows.filter((v) => v.versionType === t).at(-1))
    .find(Boolean);

  const factCheckVersion = versionRows.filter((v) => v.versionType === "fact_checked").at(-1);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs capitalize">
              {project.status}
            </Badge>
            <span className="text-muted-foreground text-xs">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pipeline progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Pipeline Progress</CardTitle>
            <CardDescription className="text-xs">
              Step {project.currentStage} of 13
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineProgress stages={stageRows} currentStep={project.currentStage} />
          </CardContent>
        </Card>

        {/* Right panel: brief + all step actions */}
        <div className="flex flex-col gap-4">
          {/* Brief summary */}
          {brief && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Project Brief</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1">
                  {[
                    ["Company", brief.companyName],
                    ["Sector", brief.sector],
                    ["Deal Type", brief.dealType],
                    brief.dealSizeUsd
                      ? ["Deal Size", `$${brief.dealSizeUsd.toLocaleString()}`]
                      : null,
                    ["Audience", brief.targetAudience],
                  ]
                    .filter((r): r is [string, string] => r !== null)
                    .map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0 w-24 text-xs">{label}:</dt>
                        <dd className="text-foreground text-xs truncate">{value}</dd>
                      </div>
                    ))}
                </dl>
                {brief.keyQuestion && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Key Question</p>
                    <p className="text-xs text-foreground leading-relaxed">{brief.keyQuestion}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 1: Master Prompt */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Step 1: Master Prompt</CardTitle>
              <CardDescription className="text-xs">
                {stageMap[1]?.status === "completed"
                  ? "Master prompt generated."
                  : "Generate the master prompt to begin the pipeline."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.masterPrompt && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-foreground leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {project.masterPrompt}
                </div>
              )}
              {stageMap[1]?.status !== "completed" && (
                <StepTrigger
                  projectId={project.id}
                  stepNumber={1}
                  label="Generate Master Prompt"
                  currentStatus={stageMap[1]?.status ?? "pending"}
                />
              )}
            </CardContent>
          </Card>

          {/* Step 2: Expert Personas */}
          {stageMap[1]?.status === "completed" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Step 2: Expert Personas</CardTitle>
                <CardDescription className="text-xs">
                  {stageMap[2]?.status === "completed"
                    ? `${selectedPersonas.length} personas confirmed.`
                    : stageMap[2]?.status === "awaiting_human"
                    ? "Select 5 expert personas to proceed."
                    : "AI will suggest expert personas for your memo."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stageMap[2]?.status === "completed" && selectedPersonas.length > 0 && (
                  <div className="space-y-1">
                    {selectedPersonas.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                          {i + 1}
                        </Badge>
                        <span className="text-foreground">{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {stageMap[2]?.status === "awaiting_human" && (
                  <PersonaSelector projectId={project.id} personas={personaRows} />
                )}
                {(stageMap[2]?.status === "pending" || !stageMap[2]) && (
                  <StepTrigger
                    projectId={project.id}
                    stepNumber={2}
                    label="Suggest Expert Personas"
                    currentStatus={stageMap[2]?.status ?? "pending"}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Source Materials */}
          {stageMap[2]?.status === "completed" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Step 3: Source Materials</CardTitle>
                <CardDescription className="text-xs">
                  {stageMap[3]?.status === "completed"
                    ? `${materialRows.length} file(s) uploaded.`
                    : "Upload source documents (PDF, TXT). NDA acknowledgment required."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stageMap[3]?.status === "completed" ? (
                  <div className="space-y-1">
                    {materialRows.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="truncate text-foreground">{m.originalFilename}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {m.chunkCount} chunks
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <MaterialUpload projectId={project.id} materials={materialRows} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Persona Drafts */}
          {stageMap[3]?.status === "completed" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Step 4: Persona Drafts</CardTitle>
                <CardDescription className="text-xs">
                  {stageMap[4]?.status === "completed"
                    ? `${personaDrafts.length} persona drafts generated.`
                    : "Run 5 parallel AI drafts — one per selected persona."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stageMap[4]?.status === "completed" && personaDrafts.length > 0 && (
                  <div className="space-y-1">
                    {personaDrafts.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-xs">
                        <span className="truncate text-foreground">{v.internalLabel}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {v.wordCount?.toLocaleString() ?? "–"} words
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {stageMap[4]?.status !== "completed" && (
                  <StepTrigger
                    projectId={project.id}
                    stepNumber={4}
                    label="Generate Persona Drafts (×5 parallel)"
                    currentStatus={stageMap[4]?.status ?? "pending"}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 5: Synthesis */}
          {stageMap[4]?.status === "completed" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Step 5: Synthesise V1</CardTitle>
                <CardDescription className="text-xs">
                  {stageMap[5]?.status === "completed"
                    ? `Synthesis complete — ${versionRows.find((v) => v.versionType === "synthesis")?.wordCount?.toLocaleString() ?? "?"} words.`
                    : "Merge all persona drafts into a unified memo using extended thinking."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stageMap[5]?.status !== "completed" && (
                  <StepTrigger
                    projectId={project.id}
                    stepNumber={5}
                    label="Synthesise Drafts"
                    currentStatus={stageMap[5]?.status ?? "pending"}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Steps 6+7: Style Guide Upload + Edit */}
          {stageMap[5]?.status === "completed" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Steps 6–7: Style Guide + Edit</CardTitle>
                <CardDescription className="text-xs">
                  {stageMap[7]?.status === "completed"
                    ? `Styled V2 complete — ${versionRows.find((v) => v.versionType === "styled")?.wordCount?.toLocaleString() ?? "?"} words.`
                    : latestStyleGuide
                    ? "Style guide uploaded. Run the combined style edit."
                    : "Upload your organisation's style guide, then run the combined style edit."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stageMap[7]?.status !== "completed" && (
                  <>
                    <StyleGuideUpload
                      projectId={project.id}
                      existingStyleGuide={latestStyleGuide}
                    />
                    {latestStyleGuide && (
                      <StepTrigger
                        projectId={project.id}
                        stepNumber={7}
                        label="Apply Style Guide & Edit"
                        currentStatus={stageMap[7]?.status ?? "pending"}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 8: Fact-Check */}
          {stageMap[7]?.status === "completed" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Step 8: Fact-Check (Gemini)</CardTitle>
                <CardDescription className="text-xs">
                  {stageMap[8]?.status === "completed"
                    ? `Fact-check complete. ${latestContentVersion?.wordCount?.toLocaleString() ?? "?"} words.`
                    : "Gemini cross-checks all factual claims in the styled draft."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stageMap[8]?.status !== "completed" && (
                  <StepTrigger
                    projectId={project.id}
                    stepNumber={8}
                    label="Fact-Check with Gemini"
                    currentStatus={stageMap[8]?.status ?? "pending"}
                  />
                )}
                {stageMap[8]?.status === "completed" && factCheckVersion && (
                  <p className="text-xs text-muted-foreground">{factCheckVersion.internalLabel}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Versions panel – shown once at least one version exists */}
      {versionRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Output Versions</CardTitle>
            <CardDescription className="text-xs">
              All AI-generated versions for this project. Click View to read, Compare to diff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VersionsPanel versions={versionRows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
