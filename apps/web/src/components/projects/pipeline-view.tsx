"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PipelineStepNav } from "./pipeline-step-nav";
import { DefineTaskStep } from "./steps/define-task-step";
import { StepTrigger } from "./step-trigger";
import { SelectPersonasStep } from "./steps/select-personas-step";
import { SynthesisStep } from "./steps/synthesis-step";
import { StyleEditStep } from "./steps/style-edit-step";
import { MaterialUpload } from "@/components/sources/material-upload";
import { StyleGuideUpload } from "@/components/sources/style-guide-upload";
import { StyleGuidePreview } from "@/components/sources/style-guide-preview";
import { VersionsPanel } from "@/components/versions/versions-panel";
import { InlineEditor, type InlineEditorHandle } from "@/components/review/inline-editor";
import { CritiqueSelector } from "@/components/review/critique-selector";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon, CheckCircle2, Users, BookOpen, Eye } from "lucide-react";
import type {
  Stage,
  Persona,
  SourceMaterial,
  Version,
  StyleGuide,
  Project,
} from "@repo/db";
import type { ProjectBriefData } from "@repo/db";

const STEP_TITLES: Record<number, string> = {
  1: "Define Task",
  2: "Select Personas",
  3: "Source Material",
  4: "Generate Drafts",
  5: "Synthesize",
  6: "Style Guide",
  7: "Edit for Style",
  8: "Fact-Check",
  9: "Final Polish",
  10: "Human Review",
  11: "Devil's Advocate",
  12: "Integrate Critiques",
  13: "Export",
};

const STEP_PHASES: Record<number, string> = {
  1: "Setup Phase", 2: "Setup Phase", 3: "Setup Phase",
  4: "Generate Phase", 5: "Generate Phase",
  6: "Polish Phase", 7: "Polish Phase", 8: "Polish Phase", 9: "Polish Phase",
  10: "Review Phase", 11: "Review Phase", 12: "Review Phase", 13: "Review Phase",
};

const STEP_COMPLETION_MESSAGES: Record<number, string> = {
  4: "Persona drafts generated.",
  5: "Synthesis V1 completed.",
  6: "Style guide is ready.",
  7: "Style edit V2 completed.",
  8: "Fact-check V3 completed.",
  9: "Final style pass V4 completed.",
  10: "Human review V5 approved.",
  11: "Critiques selected and confirmed.",
  12: "Critiques integrated into final V6.",
  13: "Export is ready.",
};

interface PipelineViewProps {
  project: Project;
  stages: Stage[];
  personas: Persona[];
  materials: SourceMaterial[];
  versions: Version[];
  latestStyleGuide: StyleGuide | null;
  initialStep: number;
  step10DraftContent: string | null;
  coverImageUrl?: string;
}

export function PipelineView({
  project,
  stages,
  personas,
  materials,
  versions,
  latestStyleGuide,
  initialStep,
  step10DraftContent,
  coverImageUrl,
}: PipelineViewProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(initialStep);
  const [coverImagesGenerating, setCoverImagesGenerating] = useState(false);
  const [step1Running, setStep1Running] = useState(false);
  const [step4Running, setStep4Running] = useState(false);
  const [step5Running, setStep5Running] = useState(false);
  const [step7Running, setStep7Running] = useState(false);
  const [step8Running, setStep8Running] = useState(false);
  const [step9Running, setStep9Running] = useState(false);
  const [step11Running, setStep11Running] = useState(false);
  const [step12Running, setStep12Running] = useState(false);
  const [step13Running, setStep13Running] = useState(false);

  // Step 10 editor ref + state (for floating bar actions)
  const editorRef = useRef<InlineEditorHandle | null>(null);
  const [step10IsDirty, setStep10IsDirty] = useState(false);
  const [step10IsApproving, setStep10IsApproving] = useState(false);
  const handleStep10ContentChange = useCallback((isDirty: boolean) => {
    setStep10IsDirty(isDirty);
  }, []);
  async function handleStep10Approve() {
    if (!editorRef.current) return;
    setStep10IsApproving(true);
    try {
      await editorRef.current.approve();
    } finally {
      setStep10IsApproving(false);
    }
  }

  useEffect(() => {
    document.documentElement.classList.add("hide-page-scrollbar");
    document.body.classList.add("hide-page-scrollbar");

    return () => {
      document.documentElement.classList.remove("hide-page-scrollbar");
      document.body.classList.remove("hide-page-scrollbar");
    };
  }, []);

  useEffect(() => {
    setActiveStep(initialStep);
  }, [initialStep]);

  const stageMap = Object.fromEntries(stages.map((s) => [s.stepNumber, s]));
  const brief = project.briefData as ProjectBriefData | null;

  const personaDrafts = versions.filter((v) => v.versionType === "persona_draft");
  const factCheckVersion = versions.filter((v) => v.versionType === "fact_checked").at(-1);

  function handleStepClick(step: number) {
    setActiveStep(step);
  }

  const prerequisiteMessage = getPrerequisiteMessage(activeStep, stageMap);
  const isLockedStep = prerequisiteMessage !== null;
  const activeStatus = stageMap[activeStep]?.status ?? "pending";
  const isNewStep = activeStep >= project.currentStage;

  function goToNextStep() {
    const next = activeStep + 1;
    setActiveStep(next);
    router.push(`/projects/${project.id}?step=${next}`);
  }
  const showFloatingStepBar = activeStep >= 4;

  function renderStepContent() {
    const step = activeStep;
    const stage = stageMap[step];
    const status = stage?.status ?? "pending";

    switch (step) {
      case 1:
        return (
          <DefineTaskStep
            projectId={project.id}
            projectTitle={project.title}
            briefData={brief}
            stage1Status={status}
            masterPrompt={project.masterPrompt ?? null}
            onRunningChange={setStep1Running}
          />
        );

      case 2: {
        const s2Stage = stageMap[2];
        const s2Status = s2Stage?.status ?? "pending";
        return (
          <SelectPersonasStep
            projectId={project.id}
            stage1Status={stageMap[1]?.status ?? "pending"}
            stage2Status={s2Status}
            projectPersonas={personas}
          />
        );
      }

      case 3:
        return <MaterialUpload projectId={project.id} materials={materials} />;

      case 4: {
        const canRunStep4 = stageMap[3]?.status === "completed";
        return status === "completed" ? (
          <div className="rounded-xl border bg-card p-6 space-y-2">
            <p className="font-medium text-base text-green-700 dark:text-green-400">
              {personaDrafts.length} persona draft{personaDrafts.length !== 1 ? "s" : ""} generated.
            </p>
            <p className="text-base text-muted-foreground">
              All drafts are available in Output Versions below. Proceed to Step 5 to synthesise.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-base text-foreground">Persona Drafts</h3>
              </div>
              <p className="text-base text-muted-foreground">
                Each of the 5 selected personas will independently analyse the source material and
                produce a full draft document from their unique perspective. All 5 drafts run in
                parallel, then get synthesised in Step 5.
              </p>
              <StepTrigger
                projectId={project.id}
                stepNumber={4}
                label="Generate Persona Drafts (×5 parallel)"
                currentStatus={status}
                disabled={!canRunStep4}
                disabledReason="Complete Step 3 to run this step."
                autoRun={canRunStep4}
                onRunningChange={setStep4Running}
              />
            </div>
          </div>
        );
      }

      case 5:
        return (
          <SynthesisStep
            projectId={project.id}
            stage4Status={stageMap[4]?.status ?? "pending"}
            stage5Status={status}
            synthesisVersion={versions.find((v) => v.versionType === "synthesis")}
            onRunningChange={setStep5Running}
          />
        );

      case 6:
        return (
          <div className="space-y-0">
            <div className="rounded-xl border bg-card p-6">
              {status === "completed" && latestStyleGuide ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="size-4 text-muted-foreground" />
                    <h3 className="font-medium text-base text-foreground">Uploaded Style Guide</h3>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="truncate text-foreground">{latestStyleGuide.originalFilename}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {latestStyleGuide.isProcessed ? "Processed" : "Ready"}
                    </span>
                  </div>
                </div>
              ) : (
                <StyleGuideUpload projectId={project.id} existingStyleGuide={latestStyleGuide} />
              )}
            </div>
            {status === "completed" && latestStyleGuide && (
              <StyleGuidePreview
                projectId={project.id}
                projectTitle={project.title}
                companyName={brief?.companyName}
                onGeneratingChange={setCoverImagesGenerating}
              />
            )}
          </div>
        );

      case 7:
        return (
          <StyleEditStep
            projectId={project.id}
            projectTitle={project.title}
            companyName={brief?.companyName}
            dealType={brief?.dealType}
            stage5Status={stageMap[5]?.status ?? "pending"}
            stage7Status={status}
            styledVersion={versions.find((v) => v.versionType === "styled")}
            latestStyleGuide={latestStyleGuide}
            coverImageUrl={coverImageUrl}
            onRunningChange={setStep7Running}
          />
        );

      case 8:
        const canRunStep8 = stageMap[7]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {status === "completed" && factCheckVersion && (
              <p className="text-base text-muted-foreground">{factCheckVersion.internalLabel}</p>
            )}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={8}
                label="Fact-Check with Gemini"
                currentStatus={status}
                disabled={!canRunStep8}
                disabledReason="Complete Step 7 to run this step."
                autoRun={canRunStep8}
                onRunningChange={setStep8Running}
              />
            )}
          </div>
        );

      case 9:
        const canRunStep9 = stageMap[8]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {status === "completed" && (
              <p className="text-base text-muted-foreground">
                Final Styled V4 —{" "}
                {versions.find((v) => v.versionType === "final_styled")?.wordCount?.toLocaleString() ?? "?"} words.
              </p>
            )}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={9}
                label="Apply Final Style Pass"
                currentStatus={status}
                disabled={!canRunStep9}
                disabledReason="Complete Step 8 to run this step."
                autoRun={canRunStep9}
                onRunningChange={setStep9Running}
              />
            )}
          </div>
        );

      case 10:
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-base text-foreground">Human Review</h3>
            </div>
            {status !== "completed" && (
              <InlineEditor
                ref={editorRef}
                projectId={project.id}
                initialContent={step10DraftContent ?? versions.find((v) => v.versionType === "final_styled")?.content ?? ""}
                versionLabel="Final Styled V4"
                hideActions
                onContentChange={handleStep10ContentChange}
                onApproveSuccess={() => setActiveStep(11)}
              />
            )}
            {status === "completed" && (
              <p className="text-base text-muted-foreground">
                Human Review V5 — approved and locked.
              </p>
            )}
          </div>
        );

      case 11:
        const canRunStep11 = stageMap[10]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {(status === "pending" || status === "running" || !stage) && (
              <StepTrigger
                projectId={project.id}
                stepNumber={11}
                label="Generate Devil's Advocate Critiques"
                currentStatus={status}
                disabled={!canRunStep11}
                disabledReason="Complete Step 10 to run this step."
                autoRun={canRunStep11}
                onRunningChange={setStep11Running}
              />
            )}
            {status === "awaiting_human" && (
              <CritiqueSelector
                projectId={project.id}
                redReport={versions.find((v) => v.versionType === "red_report")?.content ?? ""}
              />
            )}
            {status === "completed" && (
              <p className="text-base text-muted-foreground">
                Critiques confirmed — proceeding to integration.
              </p>
            )}
          </div>
        );

      case 12:
        const canRunStep12 = stageMap[11]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={12}
                label="Integrate Critiques with Extended Thinking"
                currentStatus={status}
                disabled={!canRunStep12}
                disabledReason="Complete Step 11 to run this step."
                autoRun={canRunStep12}
                onRunningChange={setStep12Running}
              />
            )}
            {status === "completed" && (
              <p className="text-base text-muted-foreground">Final V6 — critique integration complete.</p>
            )}
          </div>
        );

      case 13:
        const canRunStep13 = stageMap[12]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={13}
                label="Generate HTML Export"
                currentStatus={status}
                disabled={!canRunStep13}
                disabledReason="Complete Step 12 to run this step."
                onRunningChange={setStep13Running}
              />
            )}
            {status === "completed" && (
              <div className="flex items-center gap-3">
                <Link
                  href={`/api/projects/${project.id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Download PDF
                </Link>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Completion banner */}
      {project.status === "completed" && (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-green-800 dark:text-green-300">
              Investment memo complete
            </p>
            <p className="text-sm text-green-700/80 dark:text-green-400/80 mt-0.5">
              All 13 pipeline steps finished.
            </p>
          </div>
          <Link
            href={`/api/projects/${project.id}/export`}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition-colors shrink-0"
          >
            Download PDF
          </Link>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* Left: step nav */}
        <div className="md:row-span-2">
          <PipelineStepNav
            projectId={project.id}
            stages={stages}
            activeStep={activeStep}
            currentStep={project.currentStage}
            onStepClick={handleStepClick}
            stepStatusOverrides={{
              ...(step1Running ? { 1: "running" as const } : {}),
              ...(step4Running ? { 4: "running" as const } : {}),
              ...(step5Running ? { 5: "running" as const } : {}),
              ...(coverImagesGenerating ? { 6: "running" as const } : {}),
              ...(step7Running ? { 7: "running" as const } : {}),
              ...(step8Running ? { 8: "running" as const } : {}),
              ...(step9Running ? { 9: "running" as const } : {}),
              ...(step11Running ? { 11: "running" as const } : {}),
              ...(step12Running ? { 12: "running" as const } : {}),
              ...(step13Running ? { 13: "running" as const } : {}),
            }}
          />
        </div>

        {/* Right: active step content */}
        <div>
          {/* Step header */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-1">
              Step {activeStep} of 13 &bull; {STEP_PHASES[activeStep]}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{STEP_TITLES[activeStep]}</h1>
          </div>

          {prerequisiteMessage && (
            <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
              <AlertTriangleIcon />
              <AlertTitle>{prerequisiteMessage}</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                Preview mode is enabled for navigation/testing.
              </AlertDescription>
            </Alert>
          )}

          <div className="relative">
            {renderStepContent()}
            {showFloatingStepBar && !(activeStep === 4 && versions.length > 0) && (
              <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeStatus === "completed" && (
                    <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                  )}

                  <span className="text-sm font-medium text-foreground truncate">
                    {activeStatus === "completed"
                      ? STEP_COMPLETION_MESSAGES[activeStep]
                      : activeStatus === "running"
                        ? "Step is running…"
                        : activeStatus === "awaiting_human"
                          ? "Awaiting your input to continue."
                          : "Complete this step to continue."}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeStep === 10 && activeStatus !== "completed" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editorRef.current?.reset()}
                        disabled={!step10IsDirty || step10IsApproving}
                      >
                        Reset to Original
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleStep10Approve()}
                        disabled={step10IsApproving}
                      >
                        {step10IsApproving ? "Saving…" : "Approve & Continue to Step 11"}
                      </Button>
                    </>
                  )}
                  {activeStep < 13 && activeStep !== 10 && (
                    isNewStep ? (
                      <Button
                        size="sm"
                        disabled={activeStatus !== "completed"}
                        onClick={goToNextStep}
                      >
                        Save and continue to Step {activeStep + 1}
                      </Button>
                    ) : (
                      activeStatus === "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goToNextStep}
                        >
                          Update Step {activeStep}
                        </Button>
                      )
                    )
                  )}
                </div>
              </div>
            )}
            {isLockedStep && (
              <div
                className="absolute inset-0 rounded-xl bg-white/40"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Versions panel (Step 4 only) */}
          {activeStep === 4 && versions.length > 0 && (
            <div className="mt-6 rounded-xl border bg-card p-6">
              <VersionsPanel versions={versions} />
            </div>
          )}

          {/* Floating step bar for Step 4 (after versions) */}
          {showFloatingStepBar && activeStep === 4 && versions.length > 0 && (
            <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur">
              <div className="flex items-center gap-2.5 min-w-0">
                {activeStatus === "completed" && (
                  <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                )}

                <span className="text-sm font-medium text-foreground truncate">
                  {activeStatus === "completed"
                    ? STEP_COMPLETION_MESSAGES[activeStep]
                    : activeStatus === "running"
                      ? "Step is running…"
                      : activeStatus === "awaiting_human"
                        ? "Awaiting your input to continue."
                        : "Complete this step to continue."}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isNewStep ? (
                  <Button
                    size="sm"
                    disabled={activeStatus !== "completed"}
                    onClick={goToNextStep}
                  >
                    Save and continue to Step {activeStep + 1}
                  </Button>
                ) : (
                  activeStatus === "completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNextStep}
                    >
                      Update Step {activeStep}
                    </Button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getPrerequisiteMessage(
  step: number,
  stageMap: Record<number, Stage | undefined>,
): string | null {
  if (step <= 1) {
    return null;
  }

  const prerequisiteStep: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 5,
    8: 7,
    9: 8,
    10: 9,
    11: 10,
    12: 11,
    13: 12,
  };

  const requiredStep = prerequisiteStep[step];
  if (!requiredStep) {
    return null;
  }

  return stageMap[requiredStep]?.status === "completed"
    ? null
    : `Complete Step ${requiredStep} to run this step.`;
}
