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
import { IntegrateCritiquesStep } from "./steps/integrate-critiques-step";
import { MarkdownVersionPanel } from "./markdown-version-panel";
import { MaterialUpload } from "@/components/sources/material-upload";
import { StylePresetSelector } from "@/components/sources/style-preset-selector";
import { StyleGuidePreview } from "@/components/sources/style-guide-preview";
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
import { type DocumentColors, DEFAULT_COLORS, STYLE_PRESETS, type StylePreset } from "./steps/document-template";
import type { TokenUsageSummary } from "@/lib/token-usage-cost";
import { emitTokenUsage } from "@/lib/project-save-events";

const STEP_TITLES: Record<number, string> = {
  1: "Define Task",
  2: "Select Personas",
  3: "Source Material",
  4: "Generate Drafts",
  5: "Synthesize",
  6: "Fact-Check",
  7: "Human Review",
  8: "Devil's Advocate",
  9: "Integrate Critiques",
  10: "Style Guide",
  11: "Edit for Style",
  12: "Export",
};

const STEP_PHASES: Record<number, string> = {
  1: "Setup Phase", 2: "Setup Phase", 3: "Setup Phase",
  4: "Generate Phase", 5: "Generate Phase",
  6: "Review Phase", 7: "Review Phase", 8: "Review Phase", 9: "Review Phase",
  10: "Polish Phase", 11: "Polish Phase", 12: "Polish Phase",
};

const STEP_COMPLETION_MESSAGES: Record<number, string> = {
  4: "Persona drafts generated.",
  5: "Synthesis V1 completed.",
  6: "Fact-check V3 completed.",
  7: "Human review V5 approved.",
  8: "Critiques selected and confirmed.",
  9: "Critiques integrated into final V6.",
  10: "Style guide is ready.",
  11: "Style edit V2 completed.",
  12: "Export is ready.",
};

interface Step8DraftPayload {
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

function getStep8DraftFromMetadata(value: unknown): Step8DraftPayload | null {
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
  step11Critiques?: CritiqueItem[];
  step11SelectedIds?: number[];
}

function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
  step11Critiques = [],
  step11SelectedIds = [],
}: PipelineViewProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(initialStep);
  const [coverImagesGenerating, setCoverImagesGenerating] = useState(false);
  const [step1Running, setStep1Running] = useState(false);
  const [step4Running, setStep4Running] = useState(false);
  const [step5Running, setStep5Running] = useState(false);
  const [step6Running, setStep6Running] = useState(false);
  const [step8Running, setStep8Running] = useState(false);
  const [step8Submitting, setStep8Submitting] = useState(false);
  const [step8SelectedCritiques, setStep8SelectedCritiques] = useState<string[]>([]);
  const [step8Draft, setStep8Draft] = useState<Step8DraftPayload | null>(null);
  const [optionalStepCompleting, setOptionalStepCompleting] = useState<number | null>(null);
  const [step9Running, setStep9Running] = useState(false);
  const [step9Skipping, setStep9Skipping] = useState(false);
  const [step11FormatRunId, setStep11FormatRunId] = useState(0);
  const step8DraftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared document styling state -?set in step 10, consumed in step 11
  const [documentColors, setDocumentColors] = useState<DocumentColors>(DEFAULT_COLORS);
  const [liveCoverImageUrl, setLiveCoverImageUrl] = useState<string | undefined>(coverImageUrl);

  // Keep liveCoverImageUrl in sync when the server refreshes the signed URL
  useEffect(() => {
    setLiveCoverImageUrl(coverImageUrl);
  }, [coverImageUrl]);

  // Resolve initial preset from style guide originalFilename (format: "preset:<id>")
  const serverPresetId = (() => {
    const filename = latestStyleGuide?.originalFilename;
    if (filename?.startsWith("preset:")) {
      return filename.slice("preset:".length);
    }
    return null;
  })();

  const [localPresetId, setLocalPresetId] = useState<string | null>(serverPresetId);
  const resolvedPresetId = localPresetId ?? serverPresetId;

  // Set initial colors from preset
  useEffect(() => {
    if (resolvedPresetId) {
      const preset = STYLE_PRESETS.find((p) => p.id === resolvedPresetId);
      if (preset) {
        setDocumentColors(preset.colors);
      }
    }
  }, [resolvedPresetId]);

  const handlePresetSelect = useCallback((preset: StylePreset) => {
    setLocalPresetId(preset.id);
    setDocumentColors(preset.colors);
  }, []);



  // Step 7 editor ref + state (for floating bar actions)
  const editorRef = useRef<InlineEditorHandle | null>(null);
  const [step7IsDirty, setStep7IsDirty] = useState(false);
  const [step7IsApproving, setStep7IsApproving] = useState(false);
  const handleStep7ContentChange = useCallback((isDirty: boolean) => {
    setStep7IsDirty(isDirty);
  }, []);
  async function handleStep7Approve() {
    if (!editorRef.current) return;
    setStep7IsApproving(true);
    try {
      await editorRef.current.approve();
      // Navigate to step 8 after successful approval
      setActiveStep(8);
      router.push(`/projects/${project.id}?step=8`);
    } finally {
      setStep7IsApproving(false);
    }
  }

  useEffect(() => {
    emitTokenUsage({
      projectId: project.id,
      totalInputTokens: tokenUsageSummary.totalInputTokens,
      totalOutputTokens: tokenUsageSummary.totalOutputTokens,
      totalTokens: tokenUsageSummary.totalTokens,
      estimatedCostUsd: tokenUsageSummary.estimatedCostUsd,
    });
  }, [project.id, tokenUsageSummary]);

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

  const persistStep8Draft = useCallback(
    (draft: Step8DraftPayload) => {
      if (step8DraftSaveTimeoutRef.current) {
        clearTimeout(step8DraftSaveTimeoutRef.current);
      }

      step8DraftSaveTimeoutRef.current = setTimeout(() => {
        void fetch(`/api/projects/${project.id}/critiques/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }).catch(() => {
          // Silent failure: the final save still occurs on Step 8 continue.
        });
      }, 600);
    },
    [project.id],
  );

  useEffect(() => {
    return () => {
      if (step8DraftSaveTimeoutRef.current) {
        clearTimeout(step8DraftSaveTimeoutRef.current);
      }
    };
  }, []);

  function handleStepClick(step: number) {
    setActiveStep(step);
  }

  const prerequisiteMessage = getPrerequisiteMessage(activeStep, stageMap);
  const isLockedStep = prerequisiteMessage !== null;
  const activeStatus = stageMap[activeStep]?.status ?? "pending";
  const isNewStep = activeStep >= project.currentStage;

  async function goToNextStep() {
    // Step 11 (Edit for Style) is optional -?complete it before advancing
    if (activeStep === 11) {
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
    if (activeStep === 11) {
      router.refresh();
    }
  }

  async function handleStep8Continue() {
    setStep8Submitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/critiques/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedCritiques: step8SelectedCritiques,
          critiques: step8Draft?.critiques ?? [],
          selectedIds: step8Draft?.selectedIds ?? [],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save Step 8 selection");
      }

      const data = (await res.json()) as { nextStep?: number };
      const next = data.nextStep === 12 ? 12 : 9;
      setActiveStep(next);
      router.push(`/projects/${project.id}?step=${next}`);
      router.refresh();
    } catch (error) {
      console.error("Step 8 continue error:", error);
      alert(error instanceof Error ? error.message : "Failed to continue to Step 9");
    } finally {
      setStep8Submitting(false);
    }
  }

  async function handleStep9SkipContinue() {
    setStep9Skipping(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/stages/9/skip`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to skip Step 9");
      }

      const next = 10;
      setActiveStep(next);
      router.push(`/projects/${project.id}?step=${next}`);
      router.refresh();
    } catch (error) {
      console.error("Step 9 skip error:", error);
      alert(error instanceof Error ? error.message : "Failed to continue to Step 10");
    } finally {
      setStep9Skipping(false);
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

      case 6: {
        const canRunStep6 = stageMap[5]?.status === "completed";
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
                stepNumber={6}
                label="Fact-Check with Gemini"
                currentStatus={status}
                disabled={!canRunStep6}
                disabledReason="Complete Step 5 to run this step."

                onRunningChange={setStep6Running}
              />
            </div>
          </div>
        );
      }

      case 7:
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
                ?? factCheckVersion?.content
                ?? ""
              }
              compareContent={factCheckVersion?.content ?? ""}
              versionLabel="Final Styled V4"
              hideActions
              onContentChange={handleStep7ContentChange}
              onApproveSuccess={() => setActiveStep(8)}
            />
          </div>
        );

      case 8: {
        const canRunStep8 = stageMap[7]?.status === "completed";
        const persistedDraft = getStep8DraftFromMetadata(stageMap[8]?.metadata);
        const redReportContent = persistedDraft ? "" : (getLatestVersion("red_report")?.content ?? "");
        const shouldShowSelector = status === "awaiting_human" || status === "completed" || Boolean(persistedDraft);
        return (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <StepTrigger
                projectId={project.id}
                stepNumber={8}
                label="Generate Devil's Advocate Critiques"
                currentStatus={status}
                disabled={!canRunStep8}
                disabledReason="Complete Step 7 to run this step."

                onRunningChange={setStep8Running}
              />
            </div>
            {shouldShowSelector && (
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select the critiques you want integrated into the final document. Click a card to select or deselect it. You can also add custom critiques below.
                </p>
                <CritiqueSelector
                  projectId={project.id}
                  redReport={redReportContent}
                  step10Markdown={
                    getLatestVersion("human_reviewed")?.content
                    ?? ""
                  }
                  onSelectedCritiquesChange={setStep8SelectedCritiques}
                  initialCritiques={persistedDraft?.critiques}
                  initialSelectedIds={persistedDraft?.selectedIds}
                  onDraftChange={(draft) => {
                    setStep8Draft(draft);
                    persistStep8Draft(draft);
                  }}
                />
              </div>
            )}
          </div>
        );
      }

      case 9:
        return (
          <IntegrateCritiquesStep
            projectId={project.id}
            finalVersion={getLatestVersion("final")}
            stage11Status={stageMap[8]?.status ?? "pending"}
            stage12Status={status}
            onRunningChange={setStep9Running}
          />
        );

      case 10:
        return (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-base text-foreground">Document Style</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose a visual style for your investment memo. This sets the colour palette, typography, and writing tone.
              </p>
              <StylePresetSelector
                projectId={project.id}
                selectedPresetId={resolvedPresetId}
                onSelect={handlePresetSelect}
              />
            </div>

            <StyleGuidePreview
              projectId={project.id}
              projectTitle={project.title}
              companyName={brief?.companyName}
              onGeneratingChange={setCoverImagesGenerating}
              onCoverImageChange={setLiveCoverImageUrl}
            />
          </div>
        );

      case 11:
        return (
          <StyleEditStep
            projectId={project.id}
            projectTitle={project.title}
            companyName={brief?.companyName}
            dealType={brief?.dealType}
            stage5Status={stageMap[5]?.status ?? "pending"}
            stage7Status={status}
            synthesisVersion={getLatestVersion("final")}
            latestStyleGuide={latestStyleGuide}
            coverImageUrl={liveCoverImageUrl}
            colors={documentColors}
            formatRunId={step11FormatRunId}
          />
        );

      case 12: {
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
            stage12Status={stageMap[11]?.status ?? "pending"}
          />
        );
      }

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
              All 12 pipeline steps finished.
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
              ...(step6Running ? { 6: "running" as const } : {}),
              ...(coverImagesGenerating ? { 10: "running" as const } : {}),
              ...(step8Running ? { 8: "running" as const } : {}),
              ...(step9Running ? { 9: "running" as const } : {}),
            }}
          />
        </div>

        {/* Right: active step content */}
        <div>
          {/* Step header */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-1">
              Step {activeStep} of 12 &bull; {STEP_PHASES[activeStep]}
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
            {showFloatingStepBar && activeStep < 12 && !(activeStep === 4 && versions.length > 0) && (
              <div className="sticky bottom-4 z-30 mt-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeStatus === "completed" && (
                    <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                  )}

                  <span className="text-sm font-medium text-foreground truncate">
                    {(activeStep === 11 && activeStatus !== "completed")
                      ? "Optional step - continue anytime or run it before moving on."
                      : activeStatus === "completed"
                      ? STEP_COMPLETION_MESSAGES[activeStep]
                      : activeStatus === "running"
                        ? "Step is running..."
                        : activeStatus === "awaiting_human"
                          ? "Awaiting your input to continue."
                          : "Complete this step to continue."}
                  </span>

                  {activeStep === 11 && activeStatus === "completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStep11FormatRunId((curr) => curr + 1)}
                      className="gap-1.5 shrink-0"
                    >
                      <RefreshCw className="size-3.5" />
                      Regenerate
                    </Button>
                  )}

                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeStep === 7 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editorRef.current?.reset()}
                        disabled={!step7IsDirty || step7IsApproving}
                      >
                        Reset to Original
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleStep7Approve()}
                        disabled={step7IsApproving}
                      >
                        {step7IsApproving ? "Saving..." : "Approve & Continue to Step 8"}
                      </Button>
                    </>
                  )}
                  {activeStep < 12 && activeStep !== 7 && (
                    isNewStep ? (
                      <Button
                        size="sm"
                        disabled={
                          optionalStepCompleting !== null
                          ||
                          activeStep === 8
                            ? !["completed", "awaiting_human"].includes(activeStatus) || step8Submitting
                            : activeStep === 9
                              ? step9Skipping
                              : activeStep === 11
                                ? false
                                : activeStatus !== "completed"
                        }
                        onClick={
                          activeStep === 8
                            ? () => void handleStep8Continue()
                            : activeStep === 9
                              ? () => void handleStep9SkipContinue()
                              : () => void goToNextStep()
                        }
                      >
                        {activeStep === 8 && step8Submitting
                          ? "Saving..."
                          : activeStep === 9 && step9Skipping
                            ? "Saving..."
                          : activeStep === 11 && optionalStepCompleting === activeStep
                            ? "Saving..."
                          : `Save and continue to Step ${activeStep + 1}`}
                      </Button>
                    ) : (
                      (activeStatus === "completed" || activeStep === 11) && (
                        <Button
                          size="sm"
                          onClick={() => void goToNextStep()}
                          disabled={activeStep === 11 && optionalStepCompleting === activeStep}
                        >
                          {activeStep === 11 && optionalStepCompleting === activeStep
                            ? "Saving..."
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
                        ? "Step is running..."
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
    7: 6,
    8: 7,
    9: 8,
    10: 5,
    11: 5,
    12: 11,
  };

  const requiredStep = prerequisiteStep[step];
  if (!requiredStep) {
    return null;
  }

  return stageMap[requiredStep]?.status === "completed"
    ? null
    : `Complete Step ${requiredStep} to run this step.`;
}






