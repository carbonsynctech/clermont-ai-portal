import { cn } from "@/lib/utils";
import { CheckCircle, Clock, Loader2, XCircle, Circle } from "lucide-react";
import { SOP_STEP_NAMES, HUMAN_CHECKPOINT_STEPS } from "@repo/core";
import type { Stage } from "@repo/db";

interface PipelineProgressProps {
  stages: Stage[];
  currentStep: number;
}

type StageStatus = "pending" | "running" | "awaiting_human" | "completed" | "failed" | "skipped";

function StepIcon({ status, isCurrentStep }: { status: StageStatus; isCurrentStep: boolean }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />;
    case "awaiting_human":
      return <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    case "skipped":
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
    default:
      return (
        <Circle
          className={cn(
            "h-4 w-4 shrink-0",
            isCurrentStep ? "text-primary" : "text-muted-foreground/40"
          )}
        />
      );
  }
}

export function PipelineProgress({ stages, currentStep }: PipelineProgressProps) {
  const stageMap = new Map(stages.map((s) => [s.stepNumber, s]));

  return (
    <div className="space-y-1">
      {Array.from({ length: 13 }, (_, i) => i + 1).map((step) => {
        const stage = stageMap.get(step);
        const status: StageStatus = (stage?.status as StageStatus) ?? "pending";
        const isCurrentStep = step === currentStep;
        const isHumanCheckpoint = HUMAN_CHECKPOINT_STEPS.includes(step as 2 | 3 | 10 | 11 | 12);
        const stepName = SOP_STEP_NAMES[step as keyof typeof SOP_STEP_NAMES];

        return (
          <div
            key={step}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isCurrentStep && status !== "completed"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="w-5 text-right text-xs font-mono shrink-0 text-muted-foreground/60">
              {step}
            </span>
            <StepIcon status={status} isCurrentStep={isCurrentStep} />
            <span className="flex-1 truncate">{stepName}</span>
            {isHumanCheckpoint && status !== "completed" && (
              <span className="text-xs text-muted-foreground/60 shrink-0">review</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
