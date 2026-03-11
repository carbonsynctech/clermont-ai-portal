"use client";

import Link from "next/link";
import { Check, Lock, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage } from "@repo/db";

const PREREQUISITE_STEP: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 5, 8: 5, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12,
};

const STEP_NAMES: Record<number, string> = {
  1: "Define Task",
  2: "Select Personas",
  3: "Source Material",
  4: "Generate Opinions",
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

const GROUPS = [
  { label: "SETUP", steps: [1, 2, 3] },
  { label: "GENERATE", steps: [4, 5] },
  { label: "POLISH", steps: [6, 7, 8, 9] },
  { label: "REVIEW", steps: [10, 11, 12, 13] },
];

type StageStatus = "pending" | "running" | "awaiting_human" | "completed" | "failed" | "skipped";

function StepIcon({
  status,
  step,
  isActive,
}: {
  status: StageStatus;
  step: number;
  isActive: boolean;
}) {
  if (status === "completed") {
    return (
      <div className="size-6 rounded-full flex items-center justify-center shrink-0 border-2 border-primary/35 bg-primary/10">
        <Check className="size-3.5 text-primary" />
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="size-6 rounded-full flex items-center justify-center shrink-0 border-2 border-primary bg-primary/10">
        <Loader2 className="size-3.5 text-primary animate-spin" />
      </div>
    );
  }
  if (status === "awaiting_human" || isActive) {
    return (
      <div className="size-6 rounded-full flex items-center justify-center shrink-0 border-2 border-primary bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="size-6 rounded-full flex items-center justify-center shrink-0 border-2 border-destructive/30 bg-destructive/10">
        <XCircle className="size-3.5 text-destructive" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "size-6 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border-2 transition-colors",
        isActive
          ? "bg-primary border-primary text-primary-foreground"
          : "border-muted-foreground/25 text-muted-foreground/40"
      )}
    >
      {step}
    </div>
  );
}

interface PipelineStepNavProps {
  projectId: string;
  stages: Stage[];
  activeStep: number;
  currentStep: number;
  onStepClick: (step: number) => void;
  /** Override the displayed status for specific steps (e.g. background jobs not tied to stage status) */
  stepStatusOverrides?: Partial<Record<number, StageStatus>>;
  /** Steps optimistically marked as completed during transitions (before server data arrives) */
  completedStepOverrides?: Set<number>;
}

export function PipelineStepNav({
  projectId,
  stages,
  activeStep,
  onStepClick,
  stepStatusOverrides,
  completedStepOverrides,
}: PipelineStepNavProps) {
  const stageMap = new Map(stages.map((s) => [s.stepNumber, s]));

  return (
    <div className="rounded-xl border bg-card p-4 h-fit sticky top-16">
      <h2 className="text-sm font-semibold mb-4 px-1">Pipeline Steps</h2>
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-muted-foreground/60 tracking-widest px-1 mb-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.steps.map((step) => {
                const stage = stageMap.get(step);
                const baseStatus = (stage?.status as StageStatus) ?? "pending";
                const status = stepStatusOverrides?.[step] ?? baseStatus;
                const isActive = step === activeStep;

                // A step is locked if its prerequisite step is not completed
                const prereq = PREREQUISITE_STEP[step];
                const prereqStatus = prereq ? (stageMap.get(prereq)?.status as StageStatus | undefined) ?? "pending" : "completed";
                const isLocked = prereqStatus !== "completed" && !(prereq !== undefined && completedStepOverrides?.has(prereq));

                if (isLocked) {
                  return (
                    <div
                      key={step}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-left opacity-40 cursor-not-allowed select-none"
                    >
                      <div className="size-6 rounded-full flex items-center justify-center shrink-0 border-2 border-muted-foreground/25 text-muted-foreground/40">
                        <Lock className="size-3" />
                      </div>
                      <span className="truncate text-muted-foreground">{STEP_NAMES[step]}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={step}
                    href={`/projects/${projectId}?step=${step}`}
                    scroll={false}
                    onClick={() => onStepClick(step)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-left",
                      "transition-colors cursor-pointer",
                      "hover:bg-muted hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground"
                    )}
                  >
                    <StepIcon status={status} step={step} isActive={isActive} />
                    <span className="truncate">{STEP_NAMES[step]}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
