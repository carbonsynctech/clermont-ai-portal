"use client";

import Link from "next/link";
import { PipelineStepNav } from "./pipeline-step-nav";
import { VersionsPanel } from "@/components/versions/versions-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon } from "lucide-react";
import { STEP_TITLES, STEP_PHASES, type PipelineViewProps } from "./pipeline-constants";
import { usePipelineState } from "./use-pipeline-state";
import { PipelineStepContent } from "./pipeline-step-content";
import { PipelineFloatingBar } from "./pipeline-floating-bar";

export type { PipelineViewProps };

export function PipelineView(props: PipelineViewProps) {
  const state = usePipelineState(props);

  const {
    activeStep,
    stageMap,
    prerequisiteMessage,
    isLockedStep,
    activeStatus,
    isNewStep,
    showFloatingStepBar,
    versions,
    step1Running,
    step4Running,
    step5Running,
    step6Running,
    step8Running,
    step9Running,
    coverImagesGenerating,
    editorRef,
    step7IsDirty,
    step7IsApproving,
    step8Submitting,
    step9Skipping,
    optionalStepCompleting,
    handleStepClick,
    goToNextStep,
    handleStep7Approve,
    handleStep8Continue,
    handleStep9SkipContinue,
    setStep11FormatRunId,
  } = state;

  const { project, stages } = props;

  const showStep4FloatingBar = showFloatingStepBar && activeStep === 4 && versions.length > 0;
  const showMainFloatingBar = showFloatingStepBar && activeStep < 12 && !showStep4FloatingBar;

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
            currentStep={project.current_stage}
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
            <PipelineStepContent props={props} state={state} />

            {showMainFloatingBar && (
              <PipelineFloatingBar
                activeStep={activeStep}
                activeStatus={activeStatus}
                isNewStep={isNewStep}
                step7IsDirty={step7IsDirty}
                step7IsApproving={step7IsApproving}
                onStep7Reset={() => editorRef.current?.reset()}
                onStep7Approve={() => void handleStep7Approve()}
                step8Submitting={step8Submitting}
                onStep8Continue={() => void handleStep8Continue()}
                step9Skipping={step9Skipping}
                onStep9SkipContinue={() => void handleStep9SkipContinue()}
                optionalStepCompleting={optionalStepCompleting}
                onStep11Regenerate={() => setStep11FormatRunId((curr) => curr + 1)}
                onGoToNextStep={() => void goToNextStep()}
              />
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
          {showStep4FloatingBar && (
            <PipelineFloatingBar
              activeStep={activeStep}
              activeStatus={activeStatus}
              isNewStep={isNewStep}
              step7IsDirty={false}
              step7IsApproving={false}
              onStep7Reset={() => {}}
              onStep7Approve={() => {}}
              step8Submitting={false}
              onStep8Continue={() => {}}
              step9Skipping={false}
              onStep9SkipContinue={() => {}}
              optionalStepCompleting={null}
              onStep11Regenerate={() => {}}
              onGoToNextStep={() => void goToNextStep()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
