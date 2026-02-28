import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, stages } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PipelineProgress } from "@/components/projects/pipeline-progress";
import { StepTrigger } from "@/components/projects/step-trigger";
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

  const stageRows = await db.query.stages.findMany({
    where: eq(stages.projectId, id),
    orderBy: (s, { asc }) => [asc(s.stepNumber)],
  });

  const step1Stage = stageRows.find((s) => s.stepNumber === 1);
  const step1Done = step1Stage?.status === "completed";
  const brief = project.briefData as ProjectBriefData | null;

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

        {/* Right panel: brief summary + actions */}
        <div className="flex flex-col gap-4">
          {/* Brief summary */}
          {brief && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Project Brief</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1 text-sm">
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

          {/* Step 1: Generate master prompt */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Step 1: Master Prompt</CardTitle>
              <CardDescription className="text-xs">
                {step1Done
                  ? "The AI has generated a master prompt for this project."
                  : "Generate the master prompt to begin the content pipeline."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.masterPrompt && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-foreground leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {project.masterPrompt}
                </div>
              )}
              {!step1Done && (
                <StepTrigger
                  projectId={project.id}
                  stepNumber={1}
                  label="Generate Master Prompt"
                  currentStatus={step1Stage?.status ?? "pending"}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
