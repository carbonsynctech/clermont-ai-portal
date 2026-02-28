import { cn } from "@/lib/utils";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import type { Stage } from "@repo/db";

interface PipelineProgressProps {
  stages: Stage[];
  currentStep: number;
}

type StageStatus = "pending" | "running" | "awaiting_human" | "completed" | "failed" | "skipped";

const SHORT_STEP_NAMES: Record<number, string> = {
  1: "Define Task",
  2: "Select Personas",
  3: "Gather Sources",
  4: "Persona Drafts",
  5: "Synthesize",
  6: "Load Style",
  7: "Edit to Style",
  8: "Fact-Check",
  9: "Final Style",
  10: "Human Review",
  11: "Devil's Advocate",
  12: "Integrate Critiques",
  13: "Export PDF",
};

function StepCircle({
  step,
  status,
  isCurrentStep,
}: {
  step: number;
  status: StageStatus;
  isCurrentStep: boolean;
}) {
  if (status === "completed") {
    return <CheckCircle className="size-4 text-green-500 shrink-0" />;
  }
  if (status === "running") {
    return <Loader2 className="size-4 text-primary animate-spin shrink-0" />;
  }
  if (status === "awaiting_human") {
    return <Clock className="size-4 text-amber-500 shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle className="size-4 text-destructive shrink-0" />;
  }
  return (
    <div
      className={cn(
        "size-4 rounded-full border-2 flex items-center justify-center shrink-0",
        isCurrentStep
          ? "border-primary text-primary"
          : "border-muted-foreground/30 text-muted-foreground/40"
      )}
    >
      <span className="text-[9px] font-mono font-semibold leading-none">{step}</span>
    </div>
  );
}

export function PipelineProgress({ stages, currentStep }: PipelineProgressProps) {
  const stageMap = new Map(stages.map((s) => [s.stepNumber, s]));

  return (
    <div className="space-y-0.5">
      {Array.from({ length: 13 }, (_, i) => i + 1).map((step) => {
        const stage = stageMap.get(step);
        const status: StageStatus = (stage?.status as StageStatus) ?? "pending";
        const isCurrentStep = step === currentStep;
        const stepName = SHORT_STEP_NAMES[step] ?? `Step ${step}`;

        return (
          <div
            key={step}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              isCurrentStep && status !== "completed"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <StepCircle step={step} status={status} isCurrentStep={isCurrentStep} />
            <span className="flex-1 truncate">{stepName}</span>
          </div>
        );
      })}
    </div>
  );
}
