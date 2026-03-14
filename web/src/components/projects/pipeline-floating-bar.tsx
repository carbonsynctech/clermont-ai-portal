import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { STEP_COMPLETION_MESSAGES } from "./pipeline-constants";

interface PipelineFloatingBarProps {
  activeStep: number;
  activeStatus: string;
  isNewStep: boolean;
  // Step 7
  step7IsDirty: boolean;
  step7IsApproving: boolean;
  onStep7Reset: () => void;
  onStep7Approve: () => void;
  // Step 8
  step8Submitting: boolean;
  onStep8Continue: () => void;
  // Step 9
  step9Skipping: boolean;
  onStep9SkipContinue: () => void;
  // Step 11
  optionalStepCompleting: number | null;
  onStep11Regenerate: () => void;
  // Generic
  onGoToNextStep: () => void;
}

export function PipelineFloatingBar({
  activeStep,
  activeStatus,
  isNewStep,
  step7IsDirty,
  step7IsApproving,
  onStep7Reset,
  onStep7Approve,
  step8Submitting,
  onStep8Continue,
  step9Skipping,
  onStep9SkipContinue,
  optionalStepCompleting,
  onStep11Regenerate,
  onGoToNextStep,
}: PipelineFloatingBarProps) {
  return (
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
            onClick={onStep11Regenerate}
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
              onClick={onStep7Reset}
              disabled={!step7IsDirty || step7IsApproving}
            >
              Reset to Original
            </Button>
            <Button
              size="sm"
              onClick={onStep7Approve}
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
                  ? onStep8Continue
                  : activeStep === 9
                    ? onStep9SkipContinue
                    : onGoToNextStep
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
                onClick={onGoToNextStep}
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
  );
}
