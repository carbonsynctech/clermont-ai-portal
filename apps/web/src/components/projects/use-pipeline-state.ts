import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { InlineEditorHandle } from "@/components/review/inline-editor";
import { type DocumentColors, DEFAULT_COLORS, STYLE_PRESETS, type StylePreset } from "./steps/document-template";
import { emitTokenUsage } from "@/lib/project-save-events";
import { getPrerequisiteMessage, type Step8DraftPayload, type PipelineViewProps } from "./pipeline-constants";
import type { Version, Stage } from "@repo/db";
import type { ProjectBriefData } from "@repo/db";

export function usePipelineState(props: PipelineViewProps) {
  const {
    project,
    stages,
    versions,
    latestStyleGuide,
    initialStep,
    coverImageUrl,
    tokenUsageSummary,
  } = props;

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

  // Shared document styling state — set in step 10, consumed in step 11
  const [documentColors, setDocumentColors] = useState<DocumentColors>(DEFAULT_COLORS);
  const [liveCoverImageUrl, setLiveCoverImageUrl] = useState<string | undefined>(coverImageUrl);

  // Keep liveCoverImageUrl in sync when the server refreshes the signed URL
  useEffect(() => {
    setLiveCoverImageUrl(coverImageUrl);
  }, [coverImageUrl]);

  // Resolve initial preset from style guide originalFilename (format: "preset:<id>")
  const serverPresetId = (() => {
    const filename = latestStyleGuide?.original_filename;
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

  // Step 7 editor ref + state
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

  const stageMap = Object.fromEntries(stages.map((s) => [s.step_number, s])) as Record<number, Stage | undefined>;
  const brief = project.brief_data as ProjectBriefData | null;
  const getLatestVersion = useCallback(
    (versionType: Version["version_type"]) => versions.filter((v) => v.version_type === versionType).at(-1),
    [versions],
  );

  const sourceSynthesisVersion = getLatestVersion("synthesis");
  const factCheckVersion = versions.filter((v) => v.version_type === "fact_checked").at(-1);

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
  const isNewStep = activeStep >= project.current_stage;

  async function goToNextStep() {
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
        toast.error(error instanceof Error ? error.message : `Failed to complete Step ${activeStep}`);
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
      toast.error(error instanceof Error ? error.message : "Failed to continue to Step 9");
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
      toast.error(error instanceof Error ? error.message : "Failed to continue to Step 10");
    } finally {
      setStep9Skipping(false);
    }
  }

  const showFloatingStepBar = activeStep >= 4;

  return {
    // Core state
    activeStep,
    stageMap,
    brief,
    prerequisiteMessage,
    isLockedStep,
    activeStatus,
    isNewStep,
    showFloatingStepBar,

    // Versions
    versions,
    getLatestVersion,
    sourceSynthesisVersion,
    factCheckVersion,

    // Step running flags
    step1Running,
    setStep1Running,
    step4Running,
    setStep4Running,
    step5Running,
    setStep5Running,
    step6Running,
    setStep6Running,
    step8Running,
    setStep8Running,
    step9Running,
    setStep9Running,
    coverImagesGenerating,
    setCoverImagesGenerating,

    // Step 7
    editorRef,
    step7IsDirty,
    step7IsApproving,
    handleStep7ContentChange,
    handleStep7Approve,

    // Step 8
    step8Submitting,
    step8SelectedCritiques,
    setStep8SelectedCritiques,
    step8Draft,
    setStep8Draft,
    persistStep8Draft,
    handleStep8Continue,

    // Step 9
    step9Skipping,
    handleStep9SkipContinue,

    // Step 10/11
    documentColors,
    liveCoverImageUrl,
    setLiveCoverImageUrl,
    resolvedPresetId,
    handlePresetSelect,
    step11FormatRunId,
    setStep11FormatRunId,
    optionalStepCompleting,

    // Navigation
    handleStepClick,
    goToNextStep,
  };
}

export type PipelineState = ReturnType<typeof usePipelineState>;
