"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PipelineStepNav } from "./pipeline-step-nav";
import { DefineTaskStep } from "./steps/define-task-step";
import { StepTrigger } from "./step-trigger";
import { SelectPersonasStep } from "./steps/select-personas-step";
import { SynthesisStep } from "./steps/synthesis-step";
import { ExportStep } from "./steps/export-step";
import { StyleEditStep } from "./steps/style-edit-step";
import { FinalStylePassStep } from "./steps/final-style-pass-step";
import { IntegrateCritiquesStep } from "./steps/integrate-critiques-step";
import { MarkdownVersionPanel } from "./markdown-version-panel";
import { MaterialUpload } from "@/components/sources/material-upload";
import { StyleGuideUpload } from "@/components/sources/style-guide-upload";
import { StyleGuidePreview, type ColorPaletteEntry } from "@/components/sources/style-guide-preview";
import { VersionsPanel } from "@/components/versions/versions-panel";
import { InlineEditor, type InlineEditorHandle } from "@/components/review/inline-editor";
import { CritiqueSelector, type CritiqueItem } from "@/components/review/critique-selector";
import { FactCheckReviewStep } from "@/components/review/fact-check-review";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon, CheckCircle2, Users, BookOpen, Eye, RefreshCw } from "lucide-react";
import type {
  Stage,
  Persona,
  SourceMaterial,
  Version,
  StyleGuide,
  Project,
  FactCheckFinding,
} from "@repo/db";
import type { ProjectBriefData } from "@repo/db";
import { type DocumentColors, DEFAULT_COLORS } from "./steps/document-template";
import type { TokenUsageSummary } from "@/lib/token-usage-cost";
import { emitProjectCost } from "@/lib/project-save-events";

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

interface Step11DraftPayload {
  critiques: CritiqueItem[];
  selectedIds: number[];
  selectedCritiques: string[];
}

function isCritiqueItemArray(value: unknown): value is CritiqueItem[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return (
      typeof record.id === "number"
      && Number.isFinite(record.id)
      && typeof record.title === "string"
      && typeof record.detail === "string"
      && (record.isCustom === undefined || typeof record.isCustom === "boolean")
    );
  });
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function getStep11DraftFromMetadata(value: unknown): Step11DraftPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const draft = record.devilsAdvocateDraft;
  if (!draft || typeof draft !== "object") return null;

  const draftRecord = draft as Record<string, unknown>;
  if (!isCritiqueItemArray(draftRecord.critiques)) return null;
  if (!isNumberArray(draftRecord.selectedIds)) return null;

  const selectedCritiquesRaw = draftRecord.selectedCritiques;
  const selectedCritiques =
    Array.isArray(selectedCritiquesRaw) && selectedCritiquesRaw.every((entry) => typeof entry === "string")
      ? selectedCritiquesRaw
      : [];

  return {
    critiques: draftRecord.critiques,
    selectedIds: draftRecord.selectedIds,
    selectedCritiques,
  };
}

interface PipelineViewProps {
  project: Project;
  stages: Stage[];
  personas: Persona[];
  materials: SourceMaterial[];
  versions: Version[];
  latestStyleGuide: StyleGuide | null;
  initialStep: number;
  factCheckFindings: FactCheckFinding[] | null;
  factCheckApprovedFindingIds?: string[] | null;
  factCheckApprovedIssues?: string[] | null;
  factCheckAppliedCorrections?: number | null;
  coverImageUrl?: string;
  tokenUsageSummary: TokenUsageSummary;
}


export function PipelineView({
  project,
  stages,
  personas,
  materials,
  versions,
  latestStyleGuide,
  initialStep,
  factCheckFindings,
  factCheckApprovedFindingIds,
  factCheckApprovedIssues,
  factCheckAppliedCorrections,
  coverImageUrl,
  tokenUsageSummary,
}: PipelineViewProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(initialStep);
  const [coverImagesGenerating, setCoverImagesGenerating] = useState(false);
  const [step1Running, setStep1Running] = useState(false);
  const [step4Running, setStep4Running] = useState(false);
  const [step5Running, setStep5Running] = useState(false);
  const [step8Running, setStep8Running] = useState(false);
  const [step9Running, setStep9Running] = useState(false);
  const [step11Running, setStep11Running] = useState(false);
  const [step11Submitting, setStep11Submitting] = useState(false);
  const [step11SelectedCritiques, setStep11SelectedCritiques] = useState<string[]>([]);
  const [step11Draft, setStep11Draft] = useState<Step11DraftPayload | null>(null);
  const [optionalStepCompleting, setOptionalStepCompleting] = useState<number | null>(null);
  const [step12Running, setStep12Running] = useState(false);
  const [step12Skipping, setStep12Skipping] = useState(false);
  const [step7FormatRunId, setStep7FormatRunId] = useState(0);
  const step11DraftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared document styling state — set in step 6, consumed in step 7
  const [documentColors, setDocumentColors] = useState<DocumentColors>(DEFAULT_COLORS);
  const [liveCoverImageUrl, setLiveCoverImageUrl] = useState<string | undefined>(coverImageUrl);

  // Emit token cost to header nav
  useEffect(() => {
    emitProjectCost({ projectId: project.id, estimatedCostUsd: tokenUsageSummary.estimatedCostUsd });
  }, [project.id, tokenUsageSummary.estimatedCostUsd]);

  // Keep liveCoverImageUrl in sync when the server refreshes the signed URL
  useEffect(() => {
    setLiveCoverImageUrl(coverImageUrl);
  }, [coverImageUrl]);

  const handleColorsChange = useCallback((palette: ColorPaletteEntry[]) => {
    const [primary, secondary, accent, neutral, muted, surface] = palette;
    setDocumentColors({
      primary:   primary?.hex   ?? DEFAULT_COLORS.primary,
      secondary: secondary?.hex ?? DEFAULT_COLORS.secondary,
      accent:    accent?.hex    ?? DEFAULT_COLORS.accent,
      neutral:   neutral?.hex   ?? DEFAULT_COLORS.neutral,
      muted:     muted?.hex     ?? DEFAULT_COLORS.muted,
      surface:   surface?.hex   ?? DEFAULT_COLORS.surface,
    });
  }, []);

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
  const getLatestVersion = useCallback(
    (versionType: Version["versionType"]) => versions.filter((v) => v.versionType === versionType).at(-1),
    [versions],
  );

  const sourceSynthesisVersion = getLatestVersion("synthesis");
  const factCheckVersion = versions.filter((v) => v.versionType === "fact_checked").at(-1);
  const finalStyledVersion = getLatestVersion("final_styled");

  const persistStep11Draft = useCallback(
    (draft: Step11DraftPayload) => {
      if (step11DraftSaveTimeoutRef.current) {
        clearTimeout(step11DraftSaveTimeoutRef.current);
      }

      step11DraftSaveTimeoutRef.current = setTimeout(() => {
        void fetch(`/api/projects/${project.id}/critiques/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }).catch(() => {
          // Silent failure: the final save still occurs on Step 11 continue.
        });
      }, 600);
    },
    [project.id],
  );

  useEffect(() => {
    return () => {
      if (step11DraftSaveTimeoutRef.current) {
        clearTimeout(step11DraftSaveTimeoutRef.current);
      }
    };
  }, []);

  function handleStepClick(step: number) {
    setActiveStep(step);
    window.history.replaceState(null, "", `/projects/${project.id}?step=${step}`);
  }

  const prerequisiteMessage = getPrerequisiteMessage(activeStep, stageMap);
  const isLockedStep = prerequisiteMessage !== null;
  const activeStatus = stageMap[activeStep]?.status ?? "pending";
  const isNewStep = activeStep >= project.currentStage;

  async function goToNextStep() {
    if (activeStep === 7 || activeStep === 9) {
      setOptionalStepCompleting(activeStep);
      try {
        const res = await fetch(`/api/projects/${project.id}/stages/${activeStep}/complete`, {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error(`Failed to complete Step ${activeStep}`);
        }
      } catch (error) {
        console.error(`Step ${activeStep} completion error:`, error);
        alert(error instanceof Error ? error.message : `Failed to complete Step ${activeStep}`);
        return;
      } finally {
        setOptionalStepCompleting(null);
      }
    }

    const next = activeStep + 1;
    setActiveStep(next);
    router.push(`/projects/${project.id}?step=${next}`);
    if (activeStep === 7 || activeStep === 9) {
      router.refresh();
    }
  }

  async function handleStep11Continue() {
    setStep11Submitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/critiques/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedCritiques: step11SelectedCritiques,
          critiques: step11Draft?.critiques ?? [],
          selectedIds: step11Draft?.selectedIds ?? [],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save Step 11 selection");
      }

      const data = (await res.json()) as { nextStep?: number };
      const next = data.nextStep === 13 ? 13 : 12;
      setActiveStep(next);
      router.push(`/projects/${project.id}?step=${next}`);
      router.refresh();
    } catch (error) {
      console.error("Step 11 continue error:", error);
      alert(error instanceof Error ? error.message : "Failed to continue to Step 12");
    } finally {
      setStep11Submitting(false);
    }
  }

  async function handleStep12SkipContinue() {
    setStep12Skipping(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/stages/12/skip`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to skip Step 12");
      }

      const next = 13;
      setActiveStep(next);
      router.push(`/projects/${project.id}?step=${next}`);
      router.refresh();
    } catch (error) {
      console.error("Step 12 skip error:", error);
      alert(error instanceof Error ? error.message : "Failed to continue to Step 13");
    } finally {
      setStep12Skipping(false);
    }
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
        return (
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
            synthesisVersion={getLatestVersion("synthesis")}
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
                onColorsChange={handleColorsChange}
                onCoverImageChange={setLiveCoverImageUrl}
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
            synthesisVersion={getLatestVersion("synthesis")}
            latestStyleGuide={latestStyleGuide}
            coverImageUrl={liveCoverImageUrl}
            colors={documentColors}
            formatRunId={step7FormatRunId}
          />
        );

      case 8: {
        const canRunStep8 = stageMap[5]?.status === "completed";
        if (factCheckVersion && (status === "awaiting_human" || status === "completed")) {
          return (
            <FactCheckReviewStep
              projectId={project.id}
              factCheckFindings={factCheckFindings ?? []}
              sourceVersion={sourceSynthesisVersion}
              factCheckedVersion={factCheckVersion}
              approvedFindingIds={factCheckApprovedFindingIds ?? undefined}
              approvedIssues={factCheckApprovedIssues ?? undefined}
              appliedCorrections={factCheckAppliedCorrections ?? undefined}
              isStepApproved={status === "completed"}
            />
          );
        }
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <MarkdownVersionPanel
              title="Content to Fact-Check (Step 5 Synthesis)"
              content={sourceSynthesisVersion?.content ?? ""}
              wordCount={sourceSynthesisVersion?.wordCount ?? undefined}
            />

            <div className="rounded-xl border bg-card p-6 space-y-4 lg:sticky lg:top-4 h-fit">
              <StepTrigger
                projectId={project.id}
                stepNumber={8}
                label="Fact-Check with Gemini"
                currentStatus={status}
                disabled={!canRunStep8}
                disabledReason="Complete Step 5 to run this step."
                onRunningChange={setStep8Running}
              />
            </div>
          </div>
        );
      }

      case 9:
        return (
          <FinalStylePassStep
            projectId={project.id}
            projectTitle={project.title}
            companyName={brief?.companyName}
            dealType={brief?.dealType}
            coverImageUrl={coverImageUrl}
            factCheckedVersion={getLatestVersion("fact_checked")}
            finalStyledVersion={getLatestVersion("final_styled")}
            stage8Status={stageMap[8]?.status ?? "pending"}
            stage9Status={status}
            onRunningChange={setStep9Running}
          />
        );

      case 10:
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-base text-foreground">Human Review</h3>
            </div>
            <InlineEditor
              ref={editorRef}
              projectId={project.id}
              initialContent={
                getLatestVersion("human_reviewed")?.content
                ?? finalStyledVersion?.content
                ?? factCheckVersion?.content
                ?? ""
              }
              compareContent={finalStyledVersion?.content ?? factCheckVersion?.content}
              versionLabel="Final Styled V4"
              hideActions
              onContentChange={handleStep10ContentChange}
              onApproveSuccess={() => setActiveStep(11)}
            />
          </div>
        );

      case 11: {
        const canRunStep11 = stageMap[10]?.status === "completed";
        const persistedDraft = getStep11DraftFromMetadata(stageMap[11]?.metadata);
        const redReportContent = persistedDraft ? "" : (getLatestVersion("red_report")?.content ?? "");
        const shouldShowSelector = status === "awaiting_human" || status === "completed" || Boolean(persistedDraft);
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <StepTrigger
              projectId={project.id}
              stepNumber={11}
              label="Generate Devil's Advocate Critiques"
              currentStatus={status}
              disabled={!canRunStep11}
              disabledReason="Complete Step 10 to run this step."
              onRunningChange={setStep11Running}
            />
            {shouldShowSelector && (
              <>
                <p className="text-sm text-muted-foreground">
                  Select the critiques you want integrated into the final document. Click a card to select or deselect it. You can also add custom critiques.
                </p>
                <CritiqueSelector
                  projectId={project.id}
                  redReport={redReportContent}
                  step10Markdown={
                    getLatestVersion("human_reviewed")?.content
                    ?? getLatestVersion("final_styled")?.content
                    ?? ""
                  }
                  onSelectedCritiquesChange={setStep11SelectedCritiques}
                  initialCritiques={persistedDraft?.critiques}
                  initialSelectedIds={persistedDraft?.selectedIds}
                  onDraftChange={(draft) => {
                    setStep11Draft(draft);
                    persistStep11Draft(draft);
                  }}
                  onConfirm={() => void handleStep11Continue()}
                  isConfirming={step11Submitting}
                  isCompleted={status === "completed"}
                />
              </>
            )}
          </div>
        );
      }

      case 12:
        return (
          <IntegrateCritiquesStep
            projectId={project.id}
            finalVersion={getLatestVersion("final")}
            stage11Status={stageMap[11]?.status ?? "pending"}
            stage12Status={status}
            onRunningChange={setStep12Running}
          />
        );

      case 13:
        // Find the relevant versions for export
        const finalVersion = getLatestVersion("final");
        return (
          <ExportStep
            projectId={project.id}
            projectTitle={project.title}
            companyName={project.briefData?.companyName}
            dealType={project.briefData?.dealType}
            coverImageUrl={coverImageUrl}
            finalVersion={finalVersion}
            stage12Status={stageMap[12]?.status ?? "pending"}
          />
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
              ...(step8Running ? { 8: "running" as const } : {}),
              ...(step9Running ? { 9: "running" as const } : {}),
              ...(step11Running ? { 11: "running" as const } : {}),
              ...(step12Running ? { 12: "running" as const } : {}),
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
            {showFloatingStepBar && activeStep < 13 && !(activeStep === 4 && versions.length > 0) && (
              <div className="sticky bottom-4 z-30 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeStatus === "completed" && (
                    <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                  )}

                  <span className="text-sm font-medium text-foreground truncate">
                    {((activeStep === 7 || activeStep === 9) && activeStatus !== "completed")
                      ? "Optional step — continue anytime or run it before moving on."
                      : activeStatus === "completed"
                      ? STEP_COMPLETION_MESSAGES[activeStep]
                      : activeStatus === "running"
                        ? "Step is running…"
                        : activeStatus === "awaiting_human"
                          ? "Awaiting your input to continue."
                          : "Complete this step to continue."}
                  </span>

                  {activeStep === 7 && activeStatus === "completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStep7FormatRunId((curr) => curr + 1)}
                      className="gap-1.5 shrink-0"
                    >
                      <RefreshCw className="size-3.5" />
                      Regenerate
                    </Button>
                  )}

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
                  {activeStep < 13 && activeStep !== 10 && activeStep !== 11 && (
                    isNewStep ? (
                      <Button
                        size="sm"
                        disabled={
                          optionalStepCompleting !== null
                          ||
                          activeStep === 12
                              ? step12Skipping
                              : activeStep === 7 || activeStep === 9
                                ? false
                                : activeStatus !== "completed"
                        }
                        onClick={
                          activeStep === 12
                              ? () => void handleStep12SkipContinue()
                              : () => void goToNextStep()
                        }
                      >
                        {activeStep === 12 && step12Skipping
                            ? "Saving…"
                          : (activeStep === 7 || activeStep === 9) && optionalStepCompleting === activeStep
                            ? "Saving…"
                          : activeStep === 8
                            ? "Continue to Step 9"
                            : `Save and continue to Step ${activeStep + 1}`}
                      </Button>
                    ) : (
                      (activeStatus === "completed" || activeStep === 7 || activeStep === 9) && (
                        <Button
                          size="sm"
                          onClick={() => void goToNextStep()}
                          disabled={(activeStep === 7 || activeStep === 9) && optionalStepCompleting === activeStep}
                        >
                          {(activeStep === 7 || activeStep === 9) && optionalStepCompleting === activeStep
                            ? "Saving…"
                            : activeStep === 8
                              ? "Continue to Step 9"
                              : `Save and continue to Step ${activeStep + 1}`}
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
            <div className="sticky bottom-4 z-30 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur">
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
                    onClick={() => void goToNextStep()}
                  >
                    Save and continue to Step {activeStep + 1}
                  </Button>
                ) : (
                  activeStatus === "completed" && (
                    <Button
                      size="sm"
                      onClick={() => void goToNextStep()}
                    >
                      Save and continue to Step {activeStep + 1}
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
    8: 5,
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
